-- Photos and videos in a note's chat, as in the general chat.
--
-- A note comment carries `attachments` exactly like an archive message: files
-- of the private `chat-media` bucket named `<archive>/<comment>.<n>.<ext>`.
-- Its id is a uuid of its own, so one name resolves to one row of either
-- table, and the file is readable exactly when that row is.
--
-- Additive: the column defaults to an empty list, so released clients keep
-- working; a comment may now be media alone, which they show as an empty
-- bubble until updated. Apply before deploying the client that sends media.

alter table public.note_comments
  add column if not exists attachments jsonb not null default '[]'::jsonb;

alter table public.note_comments drop constraint if exists note_comments_body_check;
alter table public.note_comments drop constraint if exists note_comments_said_something;
alter table public.note_comments add constraint note_comments_said_something check (
  char_length(body) <= 4000
  and (char_length(body) >= 1 or jsonb_array_length(attachments) > 0)
);

-- The same check as a message: up to ten, only its own archive and id.
drop trigger if exists check_note_comment_media on public.note_comments;
create trigger check_note_comment_media
  before insert on public.note_comments
  for each row execute function private.check_archive_message_media();

-- An edit or a resolution never changes the pictures.
create or replace function private.freeze_comment_media()
returns trigger
language plpgsql
security definer
set search_path = ''
as $freeze_media$
begin
  new.attachments := old.attachments;
  return new;
end;
$freeze_media$;

drop trigger if exists freeze_comment_media on public.note_comments;
create trigger freeze_comment_media
  before update on public.note_comments
  for each row execute function private.freeze_comment_media();

-- Upload: for a message or comment not yet written, or one's own.
create or replace function private.can_upload_chat_media(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $media_upload$
  select private.can_write_archive(private.storage_archive_id(object_name))
    and private.chat_media_message_id(object_name) is not null
    and not exists (
      select 1 from public.archive_messages m
      where m.id = private.chat_media_message_id(object_name)
        and (m.author_id <> (select auth.uid())
          or m.archive_id <> private.storage_archive_id(object_name))
    )
    and not exists (
      select 1 from public.note_comments c
      where c.id = private.chat_media_message_id(object_name)
        and (c.author_id <> (select auth.uid())
          or c.archive_id <> private.storage_archive_id(object_name))
    );
$media_upload$;

-- Read: through the comment's own policies too (membership, blocks, reports).
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
    else false end;
$safety_file_visible$;
