-- The comments became a chat, and a message is sent in its author's bubble.
--
-- The bubble is chosen in Settings and stamped on each message as it is sent,
-- so everyone sees it the way it was sent, and changing your bubble restyles
-- what you say next, not what you already said. Kept as a short name rather
-- than a list the database knows: a client that does not know a name draws
-- the plain bubble, so new animals need no migration.
--
-- Additive: the live build selects no new column. Apply before deploying the
-- client that selects it.

alter table public.note_comments
  add column if not exists bubble text;

alter table public.note_comments
  drop constraint if exists note_comments_bubble_check;
alter table public.note_comments
  add constraint note_comments_bubble_check
  check (bubble is null or bubble ~ '^[a-z]{1,24}$');

-- A message keeps the bubble it was sent in. The existing freeze trigger
-- names its columns one by one, so this one guards the new column alone.
create or replace function private.freeze_comment_bubble()
returns trigger
language plpgsql
security definer
set search_path = ''
as $bubble$
begin
  new.bubble := old.bubble;
  return new;
end;
$bubble$;

drop trigger if exists freeze_comment_bubble on public.note_comments;
create trigger freeze_comment_bubble
  before update on public.note_comments
  for each row execute function private.freeze_comment_bubble();
