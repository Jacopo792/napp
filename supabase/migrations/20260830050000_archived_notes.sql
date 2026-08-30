-- Archived notes, and the first row in this archive one member can keep from
-- another.
--
-- Until now membership was the whole boundary: a row in archive_members let
-- you read everything, and owner_id was a label rather than a permission. The
-- archive keeps that shape for ordinary notes. What changes is that a note its
-- owner has archived can be withheld, and withheld *here* — a list filtered in
-- the browser is not privacy, because the rows have already arrived.
--
-- What this is worth is written down in SECURITY.md: the other member's client
-- cannot fetch the row. Nothing is encrypted, so anyone holding the database
-- still reads it.

alter table public.notes
  add column if not exists archived_at timestamptz;

create index if not exists notes_archive_archived_idx
  on public.notes (archive_id, archived_at);

-- ponytail: per account, not per archive. An account belonging to several
-- archives hides its archived notes in all of them. The per-archive home is
-- archive_members, where direct writes are revoked and this would need an RPC;
-- move it there if an account ever holds more than one archive in earnest.
alter table public.profiles
  add column if not exists hide_archived boolean not null default false;

-- False by default, so nothing that is visible today stops being visible.

create or replace function private.archived_note_visible(
  note_owner uuid,
  archived timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $archived$
  select archived is null
      or note_owner is null
      or note_owner = (select auth.uid())
      or not coalesce(
           (select profile.hide_archived
              from public.profiles profile
             where profile.user_id = note_owner),
           false
         );
$archived$;

revoke all on function private.archived_note_visible(uuid, timestamptz) from public, anon;
grant execute on function private.archived_note_visible(uuid, timestamptz) to authenticated;

-- A row you cannot see must not be a row you can write. The same predicate
-- therefore guards update and delete, not only select: without it the note
-- stays reachable to anyone who kept its id.
drop policy if exists notes_member_select on public.notes;
create policy notes_member_select on public.notes
  for select to authenticated
  using (
    (select private.is_archive_member(archive_id))
    and (select private.archived_note_visible(owner_id, archived_at))
  );

drop policy if exists notes_editor_update on public.notes;
create policy notes_editor_update on public.notes
  for update to authenticated
  using (
    (select private.can_write_archive(archive_id))
    and (select private.archived_note_visible(owner_id, archived_at))
  )
  with check ((select private.can_write_archive(archive_id)));

drop policy if exists notes_editor_delete on public.notes;
create policy notes_editor_delete on public.notes
  for delete to authenticated
  using (
    (select private.can_write_archive(archive_id))
    and (select private.archived_note_visible(owner_id, archived_at))
  );
