-- A document's sources: what its citations cite, imported from BibTeX or from
-- Zotero's CSL-JSON. One row per citation key, holding the entry as CSL-JSON,
-- so an import is an upsert and two members importing at once each add their
-- own rows rather than overwriting one blob in `archives.settings`.
--
-- A source belongs to the archive, like its folder names: any member may read
-- it and any writer may add, change or remove it.
--
-- Additive; apply before deploying the client that reads it.

create table if not exists public.archive_sources (
  archive_id uuid not null references public.archives (id) on delete cascade,
  key text not null check (char_length(key) between 1 and 200),
  csl jsonb not null check (jsonb_typeof(csl) = 'object' and pg_column_size(csl) <= 16384),
  created_at timestamptz not null default now(),
  primary key (archive_id, key)
);

alter table public.archive_sources enable row level security;

drop policy if exists archive_sources_member_select on public.archive_sources;
create policy archive_sources_member_select on public.archive_sources
  for select
  to authenticated
  using ((select private.is_archive_member(archive_id)));

drop policy if exists archive_sources_writer_insert on public.archive_sources;
create policy archive_sources_writer_insert on public.archive_sources
  for insert
  to authenticated
  with check ((select private.can_write_archive(archive_id)));

drop policy if exists archive_sources_writer_update on public.archive_sources;
create policy archive_sources_writer_update on public.archive_sources
  for update
  to authenticated
  using ((select private.can_write_archive(archive_id)))
  with check ((select private.can_write_archive(archive_id)));

drop policy if exists archive_sources_writer_delete on public.archive_sources;
create policy archive_sources_writer_delete on public.archive_sources
  for delete
  to authenticated
  using ((select private.can_write_archive(archive_id)));
