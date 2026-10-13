-- Remarks that are addressed, handed over and answered without words.
--
-- `mentions` is who a remark is said to: the members named in it with @. It is
-- part of what the author said, so it is frozen with the body — only the
-- author may change it, by editing the remark.
--
-- `assignee_id` lives on a thread's opening row and says whose job it is to
-- deal with it. Anyone editing the note may hand a thread over, the way anyone
-- may resolve one; it must name a member of the archive.
--
-- A reaction is its own row rather than a field on the remark: the remark's
-- row is the author's, and a reaction is somebody else's. A table lets the
-- policy say "only your own" the way it already does for deleting a remark.
--
-- Additive, so the live build is unaffected; apply before deploying the
-- client that selects these columns.

alter table public.note_comments
  add column if not exists mentions uuid[] not null default '{}',
  add column if not exists assignee_id uuid references auth.users (id) on delete set null;

alter table public.note_comments
  drop constraint if exists note_comments_mentions_check;
alter table public.note_comments
  add constraint note_comments_mentions_check
  check (cardinality(mentions) <= 8);

create or replace function private.freeze_comment_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $freeze$
begin
  if new.body is distinct from old.body or new.mentions is distinct from old.mentions then
    if old.author_id <> (select auth.uid()) then
      raise insufficient_privilege using message = 'Only the author may edit this comment';
    end if;
    new.body := btrim(new.body);
  end if;

  new.author_id := old.author_id;
  new.note_id := old.note_id;
  new.archive_id := old.archive_id;
  new.thread_id := old.thread_id;
  new.created_at := old.created_at;
  return new;
end;
$freeze$;

-- Whoever a remark names or a thread is handed to is somebody in the archive.
create or replace function private.check_comment_people()
returns trigger
language plpgsql
security definer
set search_path = ''
as $people$
begin
  if new.assignee_id is not null and not exists (
    select 1 from public.archive_members m
    where m.archive_id = new.archive_id and m.user_id = new.assignee_id
  ) then
    raise check_violation using message = 'A thread can only be handed to a member';
  end if;
  if exists (
    select 1 from unnest(new.mentions) as named(user_id)
    where not exists (
      select 1 from public.archive_members m
      where m.archive_id = new.archive_id and m.user_id = named.user_id
    )
  ) then
    raise check_violation using message = 'A remark can only name members';
  end if;
  return new;
end;
$people$;

drop trigger if exists check_comment_people on public.note_comments;
create trigger check_comment_people
  before insert or update of assignee_id, mentions on public.note_comments
  for each row execute function private.check_comment_people();

create table if not exists public.note_comment_reactions (
  comment_id uuid not null references public.note_comments (id) on delete cascade,
  archive_id uuid not null references public.archives (id) on delete cascade,
  note_id uuid not null references public.notes (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id, emoji)
);

create index if not exists note_comment_reactions_note_idx
  on public.note_comment_reactions (archive_id, note_id);

alter table public.note_comment_reactions enable row level security;

drop policy if exists note_comment_reactions_member_select on public.note_comment_reactions;
create policy note_comment_reactions_member_select on public.note_comment_reactions
  for select
  to authenticated
  using ((select private.is_archive_member(archive_id)));

drop policy if exists note_comment_reactions_own_insert on public.note_comment_reactions;
create policy note_comment_reactions_own_insert on public.note_comment_reactions
  for insert
  to authenticated
  with check (
    (select private.can_write_archive(archive_id))
    and user_id = (select auth.uid())
    and exists (
      -- Qualified: unqualified, these names resolve to `c`'s own columns.
      select 1 from public.note_comments c
      where c.id = note_comment_reactions.comment_id
        and c.archive_id = note_comment_reactions.archive_id
        and c.note_id = note_comment_reactions.note_id
    )
  );

drop policy if exists note_comment_reactions_own_delete on public.note_comment_reactions;
create policy note_comment_reactions_own_delete on public.note_comment_reactions
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- `subscribeToComments` has listened to `note_comments` since 1 September and
-- heard nothing: the table was never in the publication, so a remark reached
-- the other member only when something else made the archive read again.
do $publish$
declare
  published text;
begin
  foreach published in array array['note_comments', 'note_comment_reactions'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = published
    ) then
      execute format('alter publication supabase_realtime add table public.%I', published);
    end if;
  end loop;
end;
$publish$;
