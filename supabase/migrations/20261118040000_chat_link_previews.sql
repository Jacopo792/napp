-- A link's card in a chat message: the page's title, description, site name
-- and, optionally, its picture copied into the private `chat-media` bucket as
-- `<archive>/<message>.link.<ext>`, so it is read exactly when the message is
-- and never fetched from the site again.
--
-- Additive: null for every existing row, and released clients ignore it.

alter table public.archive_messages add column if not exists link jsonb;
alter table public.note_comments add column if not exists link jsonb;

-- The card is the sender's, frozen as sent, and bounded so a single row
-- cannot push an unbounded payload into every member's chat.
create or replace function private.check_message_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $link_check$
begin
  if new.link is null then return new; end if;
  if jsonb_typeof(new.link) <> 'object'
    or coalesce(new.link->>'url', '') !~ '^https://'
    or char_length(new.link->>'url') > 2000
    or char_length(coalesce(new.link->>'title', '')) not between 1 and 300
    or char_length(coalesce(new.link->>'description', '')) > 500
    or char_length(coalesce(new.link->>'site', '')) > 100
    or (new.link ? 'image' and coalesce(new.link->>'image', '') !~ ('^' || new.archive_id::text
      || '/' || new.id::text || '\.link\.(jpg|png|webp|gif)$'))
    or (new.link ? 'width' and jsonb_typeof(new.link->'width') <> 'number')
    or (new.link ? 'height' and jsonb_typeof(new.link->'height') <> 'number')
  then
    raise check_violation using message = 'A link preview carries only its own page and picture';
  end if;
  return new;
end;
$link_check$;

drop trigger if exists check_archive_message_link on public.archive_messages;
create trigger check_archive_message_link
  before insert on public.archive_messages
  for each row execute function private.check_message_link();

drop trigger if exists check_note_comment_link on public.note_comments;
create trigger check_note_comment_link
  before insert on public.note_comments
  for each row execute function private.check_message_link();

create or replace function private.freeze_message_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $freeze_link$
begin
  new.link := old.link;
  return new;
end;
$freeze_link$;

drop trigger if exists freeze_archive_message_link on public.archive_messages;
create trigger freeze_archive_message_link
  before update on public.archive_messages
  for each row execute function private.freeze_message_link();

drop trigger if exists freeze_note_comment_link on public.note_comments;
create trigger freeze_note_comment_link
  before update on public.note_comments
  for each row execute function private.freeze_message_link();
