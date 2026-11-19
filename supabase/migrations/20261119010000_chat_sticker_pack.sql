-- The archive's own stickers: pictures its members import, still or moving,
-- shared with everyone in that archive and nobody else.
--
-- The pack is `archive_stickers`, one row per picture, its file in the
-- private `chat-media` bucket as `<archive>/<sticker id>.pack.<ext>`. A file
-- of the pack is readable by whoever may read its row (members, blocks
-- applied). Only the member who added a sticker removes it.
--
-- Sending one copies the picture beside the message, as with GIPHY, so a
-- message reads exactly when it is readable and outlives the pack:
-- {"pack":"own","sticker":<id>,"path":"<archive>/<message>.sticker.<ext>",
--  "width":n,"height":n}.
--
-- Additive. Released clients show an "own" sticker message as an empty
-- bubble until updated. Apply before deploying the client.

create table if not exists public.archive_stickers (
  id uuid primary key default gen_random_uuid(),
  archive_id uuid not null references public.archives(id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  path text not null unique,
  width integer not null check (width between 1 and 4096),
  height integer not null check (height between 1 and 4096),
  created_at timestamptz not null default now(),
  check (path ~ ('^' || archive_id::text || '/' || id::text || '\.pack\.(png|webp|gif|jpg)$'))
);

create index if not exists archive_stickers_archive on public.archive_stickers (archive_id, created_at);

alter table public.archive_stickers enable row level security;

drop policy if exists archive_stickers_member_select on public.archive_stickers;
create policy archive_stickers_member_select on public.archive_stickers
  for select to authenticated
  using (private.is_archive_member(archive_id) and private.people_not_blocked(owner_id));

drop policy if exists archive_stickers_editor_insert on public.archive_stickers;
create policy archive_stickers_editor_insert on public.archive_stickers
  for insert to authenticated
  with check (owner_id = (select auth.uid()) and private.can_write_archive(archive_id));

drop policy if exists archive_stickers_owner_delete on public.archive_stickers;
create policy archive_stickers_owner_delete on public.archive_stickers
  for delete to authenticated
  using (owner_id = (select auth.uid()));

grant select, insert, delete on public.archive_stickers to authenticated;

-- The pack's files are readable with their row; everything else as before.
create or replace function private.safety_file_visible(bucket text, object_name text, owner_text text)
returns boolean language sql stable security invoker set search_path = ''
as $safety_file_visible$
  select case
    when bucket = 'avatars' then private.people_not_blocked(private.storage_user_id(object_name))
    when bucket = 'note-images' then owner_text = (select auth.uid())::text
      or exists (select 1 from public.notes n where n.archive_id::text = split_part(object_name,'/',1)
        and position(split_part(object_name,'/',2) in to_jsonb(n)::text) > 0)
      or exists (select 1 from public.note_versions v where v.archive_id::text = split_part(object_name,'/',1)
        and position(split_part(object_name,'/',2) in v.content::text) > 0)
      or exists (select 1 from public.profile_preferences p where p.user_id = (select auth.uid())
        and position(split_part(object_name,'/',2) in p.preferences::text) > 0)
    when bucket = 'chat-media' then owner_text = (select auth.uid())::text
      or exists (select 1 from public.archive_messages m
        where m.id = private.chat_media_message_id(object_name)
          and m.archive_id = private.storage_archive_id(object_name))
      or exists (select 1 from public.note_comments c
        where c.id = private.chat_media_message_id(object_name)
          and c.archive_id = private.storage_archive_id(object_name))
      or exists (select 1 from public.archive_stickers s where s.path = object_name)
    else false end;
$safety_file_visible$;

-- A message's sticker: one of ours, a GIPHY copy, or a copy of a pack sticker.
create or replace function private.check_message_sticker()
returns trigger
language plpgsql
security definer
set search_path = ''
as $sticker_check$
begin
  if new.sticker is null then return new; end if;
  if jsonb_typeof(new.sticker) <> 'object' then
    raise check_violation using message = 'A sticker is a napp drawing or a copy';
  end if;
  if new.sticker->>'pack' = 'napp' then
    if coalesce(new.sticker->>'id', '') !~ '^[a-z]{2,12}\.[a-z]{2,12}$'
      or (select count(*) from jsonb_object_keys(new.sticker)) <> 2
    then
      raise check_violation using message = 'A napp sticker is named by its id alone';
    end if;
  elsif new.sticker->>'pack' = 'giphy' then
    if coalesce(new.sticker->>'type', '') not in ('gif', 'sticker')
      or coalesce(new.sticker->>'path', '') <> (new.archive_id::text || '/' || new.id::text
        || '.giphy.webp')
      or coalesce(new.sticker->>'giphy', '') !~ '^[A-Za-z0-9]{1,64}$'
      or char_length(coalesce(new.sticker->>'title', '')) > 200
      or jsonb_typeof(new.sticker->'width') <> 'number'
      or jsonb_typeof(new.sticker->'height') <> 'number'
    then
      raise check_violation using message = 'A GIPHY sticker carries only its own copy';
    end if;
  elsif new.sticker->>'pack' = 'own' then
    if coalesce(new.sticker->>'path', '') !~ ('^' || new.archive_id::text || '/' || new.id::text
        || '\.sticker\.(png|webp|gif|jpg)$')
      or coalesce(new.sticker->>'sticker', '')
        !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or jsonb_typeof(new.sticker->'width') <> 'number'
      or jsonb_typeof(new.sticker->'height') <> 'number'
      or (select count(*) from jsonb_object_keys(new.sticker)) <> 5
    then
      raise check_violation using message = 'A pack sticker carries only its own copy';
    end if;
  else
    raise check_violation using message = 'A sticker is a napp drawing or a copy';
  end if;
  return new;
end;
$sticker_check$;
