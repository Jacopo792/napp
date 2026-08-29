-- `owner` becomes a person.
--
-- Two labels, u1 and u2, were a fixture of an archive with exactly two people
-- in it. `owner_id` names the member a note, folder or tag belongs to, so the
-- scope switch generalises to any roster. It is still not an authorization
-- boundary: RLS reads `archive_members` and nothing else.
--
-- Rolling, like the plaintext migration before it. `owner_id` is added and
-- backfilled first; `owner` is only relaxed, never dropped, until the client
-- has moved and the result has been verified.

alter table public.notes add column if not exists owner_id uuid references auth.users(id) on delete set null;
alter table public.folders add column if not exists owner_id uuid references auth.users(id) on delete set null;
alter table public.tags add column if not exists owner_id uuid references auth.users(id) on delete set null;
alter table public.note_tags add column if not exists owner_id uuid references auth.users(id) on delete set null;

-- A label maps to whoever holds it. In a solo archive the second scope belongs
-- to nobody, so its rows fall to the archive's founding member rather than
-- being left unattributed.
create or replace function private.member_for_label(target_archive_id uuid, label text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $member$
  select coalesce(
    (select user_id from public.archive_members
      where archive_id = target_archive_id and owner = label limit 1),
    (select user_id from public.archive_members
      where archive_id = target_archive_id
      order by created_at, user_id limit 1)
  );
$member$;

update public.notes set owner_id = private.member_for_label(archive_id, owner) where owner_id is null;
update public.folders set owner_id = private.member_for_label(archive_id, owner) where owner_id is null;
update public.tags set owner_id = private.member_for_label(archive_id, owner) where owner_id is null;
update public.note_tags set owner_id = private.member_for_label(archive_id, owner) where owner_id is null;

-- The label can no longer be required: a third member has no valid value for a
-- column checked against ('u1', 'u2'). The column and its check stay for the
-- rolling window; new rows simply leave it empty.
alter table public.notes alter column owner drop not null;
alter table public.folders alter column owner drop not null;
alter table public.tags alter column owner drop not null;
alter table public.note_tags alter column owner drop not null;

-- The composite keys that keep a note filed only in a folder of the same owner
-- and archive, restated against the member.
--
-- Postgres has no `add constraint if not exists`, and this file was applied to
-- the live archive by hand before it was ever run as a migration, so it has to
-- survive being run against a database that already has all six. One `do` block
-- with one tag: the CLI mis-pairs `$$` when a file carries more than one.
do $constraints$
begin
  if not exists (select 1 from pg_constraint where conname = 'folders_id_archive_owner_id_key') then
    alter table public.folders add constraint folders_id_archive_owner_id_key unique (id, archive_id, owner_id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'tags_id_archive_owner_id_key') then
    alter table public.tags add constraint tags_id_archive_owner_id_key unique (id, archive_id, owner_id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'notes_id_archive_owner_id_key') then
    alter table public.notes add constraint notes_id_archive_owner_id_key unique (id, archive_id, owner_id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'notes_folder_owner_id_fkey') then
    alter table public.notes add constraint notes_folder_owner_id_fkey
      foreign key (folder_id, archive_id, owner_id)
      references public.folders(id, archive_id, owner_id)
      on delete set null (folder_id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'note_tags_note_owner_id_fkey') then
    alter table public.note_tags add constraint note_tags_note_owner_id_fkey
      foreign key (note_id, archive_id, owner_id)
      references public.notes(id, archive_id, owner_id)
      on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'note_tags_tag_owner_id_fkey') then
    alter table public.note_tags add constraint note_tags_tag_owner_id_fkey
      foreign key (tag_id, archive_id, owner_id)
      references public.tags(id, archive_id, owner_id)
      on delete cascade;
  end if;
end
$constraints$;

create index if not exists notes_archive_owner_id_idx on public.notes (archive_id, owner_id);
create index if not exists folders_archive_owner_id_position_idx on public.folders (archive_id, owner_id, position);
create index if not exists tags_archive_owner_id_idx on public.tags (archive_id, owner_id);
