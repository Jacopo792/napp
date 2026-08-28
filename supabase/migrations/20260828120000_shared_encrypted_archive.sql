-- One shared encrypted archive. `owner` is an organisational label only;
-- every authorization decision is based exclusively on archive membership.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

-- Preserve the abandoned scaffold table instead of deleting its test rows.
do $$
begin
  if to_regclass('public.notes') is not null
     and not exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'notes'
         and column_name = 'archive_id'
     ) then
    if to_regclass('public.legacy_notes_20260828') is null then
      alter table public.notes rename to legacy_notes_20260828;
    else
      raise exception 'public.notes is legacy-shaped but legacy_notes_20260828 already exists';
    end if;
  end if;
end
$$;

create table if not exists public.archives (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Shared notes',
  settings_ciphertext text,
  created_at timestamptz not null default now()
);

create table if not exists public.archive_members (
  archive_id uuid not null references public.archives(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (archive_id, user_id)
);

create table if not exists public.vault_keys (
  user_id uuid not null references auth.users(id) on delete cascade,
  archive_id uuid not null references public.archives(id) on delete cascade,
  wrapped_dek text not null,
  kdf_salt text not null,
  kdf_iterations integer not null check (kdf_iterations >= 600000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, archive_id)
);

create table if not exists public.folders (
  id uuid not null,
  archive_id uuid not null references public.archives(id) on delete cascade,
  owner text not null check (owner in ('u1', 'u2')),
  ciphertext text not null,
  position integer not null default 0,
  primary key (id),
  unique (id, archive_id, owner)
);

create table if not exists public.tags (
  id uuid not null,
  archive_id uuid not null references public.archives(id) on delete cascade,
  owner text not null check (owner in ('u1', 'u2')),
  ciphertext text not null,
  color text not null check (color in (
    'blue', 'rose', 'emerald', 'amber', 'violet', 'sky', 'orange', 'slate'
  )),
  primary key (id),
  unique (id, archive_id, owner)
);

create table if not exists public.notes (
  id uuid not null,
  archive_id uuid not null references public.archives(id) on delete cascade,
  owner text not null check (owner in ('u1', 'u2')),
  ciphertext text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  trashed_at timestamptz,
  pinned boolean not null default false,
  folder_id uuid,
  version bigint not null default 1 check (version > 0),
  primary key (id),
  unique (id, archive_id, owner),
  foreign key (folder_id, archive_id, owner)
    references public.folders(id, archive_id, owner)
    on delete set null (folder_id)
);

create table if not exists public.note_tags (
  note_id uuid not null,
  tag_id uuid not null,
  archive_id uuid not null,
  owner text not null check (owner in ('u1', 'u2')),
  primary key (note_id, tag_id),
  foreign key (note_id, archive_id, owner)
    references public.notes(id, archive_id, owner)
    on delete cascade,
  foreign key (tag_id, archive_id, owner)
    references public.tags(id, archive_id, owner)
    on delete cascade
);

create index if not exists notes_archive_updated_idx
  on public.notes (archive_id, updated_at desc);
create index if not exists notes_archive_owner_idx
  on public.notes (archive_id, owner);
create index if not exists folders_archive_owner_position_idx
  on public.folders (archive_id, owner, position);
create index if not exists tags_archive_owner_idx
  on public.tags (archive_id, owner);
create index if not exists note_tags_archive_idx
  on public.note_tags (archive_id);

create or replace function private.is_archive_member(target_archive_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.archive_members member
      where member.archive_id = target_archive_id
        and member.user_id = (select auth.uid())
    );
$$;

create or replace function private.storage_archive_id(object_name text)
returns uuid
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  first_segment text;
begin
  first_segment := split_part(object_name, '/', 1);
  if first_segment !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return null;
  end if;
  return first_segment::uuid;
end;
$$;

revoke all on function private.is_archive_member(uuid) from public, anon;
revoke all on function private.storage_archive_id(text) from public, anon;
grant execute on function private.is_archive_member(uuid) to authenticated;
grant execute on function private.storage_archive_id(text) to authenticated;

alter table public.archives enable row level security;
alter table public.archive_members enable row level security;
alter table public.vault_keys enable row level security;
alter table public.notes enable row level security;
alter table public.folders enable row level security;
alter table public.tags enable row level security;
alter table public.note_tags enable row level security;

drop policy if exists archives_member_all on public.archives;
create policy archives_member_all on public.archives
  for all to authenticated
  using ((select private.is_archive_member(id)))
  with check ((select private.is_archive_member(id)));

drop policy if exists archive_members_member_all on public.archive_members;
create policy archive_members_member_all on public.archive_members
  for all to authenticated
  using ((select private.is_archive_member(archive_id)))
  with check ((select private.is_archive_member(archive_id)));

drop policy if exists vault_keys_member_all on public.vault_keys;
create policy vault_keys_member_all on public.vault_keys
  for all to authenticated
  using ((select private.is_archive_member(archive_id)))
  with check ((select private.is_archive_member(archive_id)));

drop policy if exists notes_member_all on public.notes;
create policy notes_member_all on public.notes
  for all to authenticated
  using ((select private.is_archive_member(archive_id)))
  with check ((select private.is_archive_member(archive_id)));

drop policy if exists folders_member_all on public.folders;
create policy folders_member_all on public.folders
  for all to authenticated
  using ((select private.is_archive_member(archive_id)))
  with check ((select private.is_archive_member(archive_id)));

drop policy if exists tags_member_all on public.tags;
create policy tags_member_all on public.tags
  for all to authenticated
  using ((select private.is_archive_member(archive_id)))
  with check ((select private.is_archive_member(archive_id)));

drop policy if exists note_tags_member_all on public.note_tags;
create policy note_tags_member_all on public.note_tags
  for all to authenticated
  using ((select private.is_archive_member(archive_id)))
  with check ((select private.is_archive_member(archive_id)));

revoke insert, update, delete on public.archives, public.archive_members,
  public.vault_keys, public.notes, public.folders, public.tags, public.note_tags from anon;
grant select on public.archives, public.archive_members, public.vault_keys,
  public.notes, public.folders, public.tags, public.note_tags to anon;
grant select, insert, update, delete on public.archives, public.archive_members,
  public.vault_keys, public.notes, public.folders, public.tags, public.note_tags
  to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('note-images', 'note-images', false, 26214400, array['application/octet-stream'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists note_images_member_select on storage.objects;
create policy note_images_member_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'note-images'
    and (select private.is_archive_member(private.storage_archive_id(name)))
  );

drop policy if exists note_images_member_insert on storage.objects;
create policy note_images_member_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'note-images'
    and (select private.is_archive_member(private.storage_archive_id(name)))
  );

drop policy if exists note_images_member_update on storage.objects;
create policy note_images_member_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'note-images'
    and (select private.is_archive_member(private.storage_archive_id(name)))
  )
  with check (
    bucket_id = 'note-images'
    and (select private.is_archive_member(private.storage_archive_id(name)))
  );

drop policy if exists note_images_member_delete on storage.objects;
create policy note_images_member_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'note-images'
    and (select private.is_archive_member(private.storage_archive_id(name)))
  );

do $$
declare
  realtime_table text;
begin
  foreach realtime_table in array array['archives', 'notes', 'folders', 'tags', 'note_tags']
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = realtime_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', realtime_table);
    end if;
  end loop;
end
$$;
