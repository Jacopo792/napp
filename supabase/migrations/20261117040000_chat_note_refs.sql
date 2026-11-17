-- The general chat can talk about notes: a passage quoted from one, or a note
-- named in the words with "#".
--
-- `refs` is a list of {note, title, quote?}: the note's id, its title when the
-- message was sent, and for a quoted passage the words quoted. A copy, not a
-- link into the document: the quote stays what was said even if the passage
-- is later rewritten, and opening it finds the passage again if it is there.
--
-- Additive: released clients neither select nor write it. Apply before
-- deploying the client that does.

alter table public.archive_messages
  add column if not exists refs jsonb not null default '[]'::jsonb;

-- Only notes of the message's own archive, few of them, and short.
create or replace function private.check_archive_message_refs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $refs$
begin
  if jsonb_typeof(new.refs) <> 'array' or jsonb_array_length(new.refs) > 8 then
    raise check_violation using message = 'A message refers to at most eight notes';
  end if;
  if exists (
    select 1 from jsonb_array_elements(new.refs) as ref(item)
    where jsonb_typeof(ref.item) <> 'object'
      or jsonb_typeof(ref.item -> 'note') <> 'string'
      or jsonb_typeof(ref.item -> 'title') <> 'string'
      or char_length(ref.item ->> 'title') > 200
      or (ref.item ? 'quote' and (
        jsonb_typeof(ref.item -> 'quote') <> 'string'
        or char_length(ref.item ->> 'quote') not between 1 and 600
      ))
      or (ref.item ->> 'note') !~ '^[0-9a-f-]{36}$'
      or not exists (
        select 1 from public.notes n
        where n.id = (ref.item ->> 'note')::uuid and n.archive_id = new.archive_id
      )
  ) then
    raise check_violation using message = 'A message refers only to notes of its archive';
  end if;
  return new;
end;
$refs$;

drop trigger if exists check_archive_message_refs on public.archive_messages;
create trigger check_archive_message_refs
  before insert on public.archive_messages
  for each row execute function private.check_archive_message_refs();

-- What a message refers to is part of what was said when it was sent: an edit
-- changes the words, not the notes they are about.
create or replace function private.freeze_archive_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $freeze$
begin
  new.author_id := old.author_id;
  new.archive_id := old.archive_id;
  new.created_at := old.created_at;
  new.bubble := old.bubble;
  new.refs := old.refs;
  if new.reply_to is not null then
    new.reply_to := old.reply_to;
  end if;
  return new;
end;
$freeze$;
