-- One note, one member's to write.
--
-- Write access used to be a property of the archive and nothing else:
-- `archive_members.role` said editor or viewer for everything in it, which is
-- the wrong size of decision for an archive built for two people who are both
-- writers. The column stays, and so does `set_archive_member_role` — an
-- archive that ever wants a reader can still have one — but the interface no
-- longer asks, and every member this archive already holds is an editor. That
-- is the first statement below, and it is what makes the rest of this file the
-- only place a member's writing is ever narrowed.
--
-- What one member takes back from another is a note. `locked_by` names the one
-- account that may write the row while it is set, and it is enforced here
-- rather than in the browser for the reason every boundary in this archive is:
-- a disabled button has already handed the row over.
--
-- Remarks are deliberately outside it. `note_comments` is a conversation about
-- the passage rather than part of it, so a locked note can still be commented
-- on — which is the whole use of locking one.

update public.archive_members set role = 'editor' where role <> 'editor';

alter table public.notes
  add column if not exists locked_by uuid references auth.users(id) on delete set null;

-- The parameter is named apart from the column on purpose: the policies below
-- pass `locked_by` in, and a parameter sharing its name is the sort of silent
-- shadowing that makes a predicate read true for everyone.
create or replace function private.note_lock_open(lock_holder uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $lock$
  select lock_holder is null or lock_holder = (select auth.uid());
$lock$;

revoke all on function private.note_lock_open(uuid) from public, anon;
grant execute on function private.note_lock_open(uuid) to authenticated;

-- `using` decides whether the row as it stands may be touched at all, so it is
-- what keeps the other member out. `with check` decides what the row may
-- become, and it is what stops anybody locking a note in somebody else's name:
-- the only holder you may write is yourself, and the only lock you may lift is
-- your own.
drop policy if exists notes_editor_update on public.notes;
create policy notes_editor_update on public.notes
  for update to authenticated
  using (
    (select private.can_write_archive(archive_id))
    and (select private.archived_note_visible(owner_id, archived_at))
    and (select private.note_lock_open(locked_by))
  )
  with check (
    (select private.can_write_archive(archive_id))
    and (select private.note_lock_open(locked_by))
  );

-- A note you may not write is a note you may not throw away either.
drop policy if exists notes_editor_delete on public.notes;
create policy notes_editor_delete on public.notes
  for delete to authenticated
  using (
    (select private.can_write_archive(archive_id))
    and (select private.archived_note_visible(owner_id, archived_at))
    and (select private.note_lock_open(locked_by))
  );
