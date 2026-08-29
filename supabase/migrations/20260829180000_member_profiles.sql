-- A member is a person, not an email address.
--
-- Everything the interface wants to say about who wrote a note, whose scope you
-- are reading, or who is in this archive with you currently has nowhere to come
-- from: `auth.users` is not readable from the client, and `owner` is a two-value
-- label. A profile is the missing row.
--
-- The rule is unchanged: `archive_members` decides. You may read the profile of
-- someone you share an archive with, and write only your own.

-- An abandoned starter table already held this name, with `id` / `username` /
-- `full_name` / `avatar_url` and a "viewable by everyone" policy that was only
-- unreachable because `anon` never had the table grant. Preserve its rows the
-- way the notes scaffold was preserved, rather than deleting them.
do $legacy$
begin
  if to_regclass('public.profiles') is not null
     and not exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'profiles'
         and column_name = 'user_id'
     ) then
    if to_regclass('public.legacy_profiles_20260829') is null then
      alter table public.profiles rename to legacy_profiles_20260829;
    else
      raise exception 'public.profiles is legacy-shaped but legacy_profiles_20260829 already exists';
    end if;
  end if;
end
$legacy$;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null default '' check (char_length(nickname) <= 40),
  avatar_object uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function private.shares_archive(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $shares$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.archive_members mine
      join public.archive_members theirs on theirs.archive_id = mine.archive_id
      where mine.user_id = (select auth.uid())
        and theirs.user_id = shares_archive.target_user_id
    );
$shares$;

revoke all on function private.shares_archive(uuid) from public, anon;
grant execute on function private.shares_archive(uuid) to authenticated;

alter table public.profiles enable row level security;

drop policy if exists profiles_read_shared on public.profiles;
create policy profiles_read_shared on public.profiles
  for select to authenticated
  using ((select private.shares_archive(user_id)));

drop policy if exists profiles_write_own on public.profiles;
create policy profiles_write_own on public.profiles
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Deleting a profile is not a thing you do; deleting the account cascades.
revoke all on public.profiles from anon;
grant select, insert, update on public.profiles to authenticated;

create or replace function public.touch_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $touch$
begin
  new.updated_at := now();
  return new;
end;
$touch$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch
  before update on public.profiles
  for each row execute function public.touch_profile();

-- Avatars live under the owner's user id, which is what the write policy reads.
-- They are private like every other object: sharing an archive is what lets you
-- see someone's face.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function private.storage_user_id(object_name text)
returns uuid
language plpgsql
immutable
security definer
set search_path = ''
as $storage$
declare
  first_segment text;
begin
  first_segment := split_part(object_name, '/', 1);
  if first_segment !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return null;
  end if;
  return first_segment::uuid;
end;
$storage$;

revoke all on function private.storage_user_id(text) from public, anon;
grant execute on function private.storage_user_id(text) to authenticated;

drop policy if exists avatars_shared_select on storage.objects;
create policy avatars_shared_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'avatars'
    and (select private.shares_archive(private.storage_user_id(name)))
  );

drop policy if exists avatars_own_insert on storage.objects;
create policy avatars_own_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and private.storage_user_id(name) = (select auth.uid())
  );

drop policy if exists avatars_own_update on storage.objects;
create policy avatars_own_update on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and private.storage_user_id(name) = (select auth.uid()))
  with check (bucket_id = 'avatars' and private.storage_user_id(name) = (select auth.uid()));

drop policy if exists avatars_own_delete on storage.objects;
create policy avatars_own_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and private.storage_user_id(name) = (select auth.uid()));

do $publish$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
end
$publish$;
