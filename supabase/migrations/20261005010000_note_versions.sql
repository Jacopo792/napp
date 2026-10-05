-- What a note said, and who had been writing it.
--
-- The live text is the Yjs document in `note_documents`, and that binary is a
-- history nobody can read: it knows every keystroke and not who typed one. So
-- the collaboration server — which does know, because it authorised every
-- update — writes a row here after a stretch of somebody's writing: at most
-- every ten minutes of it, and once more when the note is closed. The row
-- carries the projection, the same readable title and Tiptap JSON `notes`
-- carries, so a version can be read, compared and put back without a Yjs
-- decoder in the browser.
--
-- `author_ids` is everyone whose updates landed in that stretch. It is what
-- "what has this person changed" is answered from, which is why it is indexed.
--
-- A member may also name the moment themselves ("sent to the supervisor on
-- the 15th"): `label` set, the author the caller and nobody else. Those are
-- the only rows a browser writes; the server writes the rest with the service
-- role.
--
-- Additive: the live build selects nothing from here.

create table if not exists public.note_versions (
  id uuid primary key default gen_random_uuid(),
  archive_id uuid not null references public.archives (id) on delete cascade,
  note_id uuid not null references public.notes (id) on delete cascade,
  created_at timestamptz not null default now(),
  author_ids uuid[] not null default '{}',
  title text not null default '',
  content jsonb not null,
  label text,
  words_added integer,
  words_removed integer
);

create index if not exists note_versions_note_idx
  on public.note_versions (note_id, created_at desc);

create index if not exists note_versions_authors_idx
  on public.note_versions using gin (author_ids);

alter table public.note_versions
  drop constraint if exists note_versions_label_check;
alter table public.note_versions
  add constraint note_versions_label_check
  check (label is null or char_length(label) between 1 and 80);

alter table public.note_versions enable row level security;

-- Reading a version is reading the note: the subquery runs under the caller's
-- own policies on `notes`, so an archived note its owner has hidden keeps its
-- history hidden too, by the same rule and without a second copy of it.
drop policy if exists note_versions_member_select on public.note_versions;
create policy note_versions_member_select on public.note_versions
  for select
  to authenticated
  using (
    (select private.is_archive_member(archive_id))
    and exists (select 1 from public.notes as note where note.id = note_id)
  );

-- A named moment, under the caller's own name and nobody else's.
drop policy if exists note_versions_named_insert on public.note_versions;
create policy note_versions_named_insert on public.note_versions
  for insert
  to authenticated
  with check (
    (select private.can_write_archive(archive_id))
    and label is not null
    and author_ids = array[(select auth.uid())]
    and exists (
      select 1 from public.notes as note
      where note.id = note_id and note.archive_id = note_versions.archive_id
    )
  );

grant select, insert on public.note_versions to authenticated;
