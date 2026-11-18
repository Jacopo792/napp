-- Stickers and GIFs in every chat, as a message of their own.
--
-- `sticker` is either one of the app's own drawings, named and drawn by the
-- client ({"pack":"napp","id":"cat.hi"}), or a GIPHY GIF or sticker copied
-- into the private `chat-media` bucket as `<archive>/<message>.giphy.webp` at
-- send time, so it is read exactly when the message is and never fetched
-- from GIPHY again ({"pack":"giphy","type":"gif"|"sticker","path":...}).
--
-- Additive: null for every existing row. Released clients show a sticker-only
-- message as an empty bubble until updated. Apply before deploying the client.

alter table public.archive_messages add column if not exists sticker jsonb;
alter table public.note_comments add column if not exists sticker jsonb;

-- Words, pictures, a sticker or any mix; never nothing.
alter table public.archive_messages drop constraint if exists archive_messages_said_something;
alter table public.archive_messages add constraint archive_messages_said_something check (
  char_length(body) <= 4000
  and (char_length(body) >= 1 or jsonb_array_length(attachments) > 0 or sticker is not null)
);
alter table public.note_comments drop constraint if exists note_comments_said_something;
alter table public.note_comments add constraint note_comments_said_something check (
  char_length(body) <= 4000
  and (char_length(body) >= 1 or jsonb_array_length(attachments) > 0 or sticker is not null)
);

create or replace function private.check_message_sticker()
returns trigger
language plpgsql
security definer
set search_path = ''
as $sticker_check$
begin
  if new.sticker is null then return new; end if;
  if jsonb_typeof(new.sticker) <> 'object' then
    raise check_violation using message = 'A sticker is a napp drawing or a GIPHY copy';
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
  else
    raise check_violation using message = 'A sticker is a napp drawing or a GIPHY copy';
  end if;
  return new;
end;
$sticker_check$;

drop trigger if exists check_archive_message_sticker on public.archive_messages;
create trigger check_archive_message_sticker
  before insert on public.archive_messages
  for each row execute function private.check_message_sticker();

drop trigger if exists check_note_comment_sticker on public.note_comments;
create trigger check_note_comment_sticker
  before insert on public.note_comments
  for each row execute function private.check_message_sticker();

-- What was sent stays as sent.
create or replace function private.freeze_message_sticker()
returns trigger
language plpgsql
security definer
set search_path = ''
as $freeze_sticker$
begin
  new.sticker := old.sticker;
  return new;
end;
$freeze_sticker$;

drop trigger if exists freeze_archive_message_sticker on public.archive_messages;
create trigger freeze_archive_message_sticker
  before update on public.archive_messages
  for each row execute function private.freeze_message_sticker();

drop trigger if exists freeze_note_comment_sticker on public.note_comments;
create trigger freeze_note_comment_sticker
  before update on public.note_comments
  for each row execute function private.freeze_message_sticker();
