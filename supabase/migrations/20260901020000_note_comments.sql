-- A remark about a passage, rather than a change to it.
--
-- The anchor is not here. What ties a comment to the words it is about is a
-- mark carried in the note's own Yjs document, so the passage keeps its
-- comment through every edit either person makes, converges the way the rest
-- of the text converges, and needs no position stored in a column that would
-- be wrong the moment somebody typed above it. This table holds only what a
-- mark cannot: who wrote the remark, when, and what it says.
--
-- `thread_id` is that mark's id. Several rows sharing one is a conversation,
-- in `created_at` order; the first is the comment and the rest are replies.
--
-- Additive, and therefore safe for the build that is still live: it selects no
-- column here and no policy above changes. Apply it before deploying the
-- client that reads it, never after — PostgREST fails a whole select when one
-- name in it is unknown, so a client ahead of its migration loses the archive
-- rather than the field.

create table if not exists public.note_comments (
  id uuid primary key default gen_random_uuid(),
  archive_id uuid not null references public.archives (id) on delete cascade,
  note_id uuid not null references public.notes (id) on delete cascade,
  thread_id uuid not null,
  author_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- Every read is "the threads on this note, oldest first", which is exactly
-- this order; and the archive leads because it is what row level security
-- filters on first.
create index if not exists note_comments_note_idx
  on public.note_comments (archive_id, note_id, thread_id, created_at);

-- A remark is text somebody typed. Bound so a single row cannot be used to
-- push an unbounded payload into every other member's browser.
alter table public.note_comments
  drop constraint if exists note_comments_body_check;
alter table public.note_comments
  add constraint note_comments_body_check
  check (char_length(body) between 1 and 4000);

alter table public.note_comments enable row level security;

-- Membership reads, exactly as it reads the notes themselves.
drop policy if exists note_comments_member_select on public.note_comments;
create policy note_comments_member_select on public.note_comments
  for select
  to authenticated
  using ((select private.is_archive_member(archive_id)));

-- Only an editor may write one, and only ever under their own name: the
-- author is not a field the browser gets to choose.
drop policy if exists note_comments_editor_insert on public.note_comments;
create policy note_comments_editor_insert on public.note_comments
  for insert
  to authenticated
  with check (
    (select private.can_write_archive(archive_id))
    and author_id = (select auth.uid())
  );

-- Resolving is something anyone editing the note may do — the remark has been
-- dealt with, and who deals with it is not the author's decision. The author
-- is still the author: `author_id` and `body` cannot be rewritten.
drop policy if exists note_comments_editor_update on public.note_comments;
create policy note_comments_editor_update on public.note_comments
  for update
  to authenticated
  using ((select private.can_write_archive(archive_id)))
  with check ((select private.can_write_archive(archive_id)));

-- Deleting is the author's alone. Somebody else resolving your remark is a
-- conversation; somebody else deleting it is not.
drop policy if exists note_comments_author_delete on public.note_comments;
create policy note_comments_author_delete on public.note_comments
  for delete
  to authenticated
  using (
    (select private.can_write_archive(archive_id))
    and author_id = (select auth.uid())
  );

-- The author and the body are the record, and a policy cannot express "these
-- columns are immutable" — so a trigger does.
create or replace function private.freeze_comment_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $freeze$
begin
  new.author_id := old.author_id;
  new.body := old.body;
  new.note_id := old.note_id;
  new.archive_id := old.archive_id;
  new.thread_id := old.thread_id;
  new.created_at := old.created_at;
  return new;
end;
$freeze$;

drop trigger if exists freeze_comment_record on public.note_comments;
create trigger freeze_comment_record
  before update on public.note_comments
  for each row execute function private.freeze_comment_record();
