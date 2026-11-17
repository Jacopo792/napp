-- A chat message may answer another one, your own included.
--
-- Additive: the live build selects no new column. Apply before deploying the
-- client that selects it. A deleted message leaves its replies standing, with
-- nothing to point at.

alter table public.note_comments
  add column if not exists reply_to uuid
    references public.note_comments (id) on delete set null;

-- What a message answers is part of what was said: an edit changes the words,
-- never the message they answer. Clearing it is allowed, because that is what
-- `on delete set null` does when the answered message goes.
create or replace function private.freeze_comment_reply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $reply$
begin
  if new.reply_to is not null then
    new.reply_to := old.reply_to;
  end if;
  return new;
end;
$reply$;

drop trigger if exists freeze_comment_reply on public.note_comments;
create trigger freeze_comment_reply
  before update on public.note_comments
  for each row execute function private.freeze_comment_reply();
