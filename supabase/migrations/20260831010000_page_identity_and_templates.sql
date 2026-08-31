-- Page identity and archive-private reusable templates.
-- Existing notes remain unchanged: null means the page has neither adornment.
--
-- The two shapes are validated in Postgres and not only in the browser, for
-- the reason every boundary here is: a shape checked in the client has already
-- been written by anything that is not the client. `pageProperties.ts` holds
-- the same two whitelists, and the two have to move together.

create or replace function private.valid_page_icon(value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $icon$
  -- `coalesce(..., false)` is the whole point. A missing key makes
  -- `value -> 'value'` SQL null, every comparison on it null, and the check
  -- constraint *passes*: a null check expression is not a failed one. Without
  -- this a page icon with no value at all was accepted.
  select coalesce(
    value is null
    or (
      jsonb_typeof(value) = 'object'
      and (
        (
          value ->> 'kind' = 'emoji'
          and jsonb_typeof(value -> 'value') = 'string'
          and char_length(value ->> 'value') between 1 and 16
        )
        or (
          value ->> 'kind' = 'symbol'
          and value ->> 'value' in (
            'book', 'bookmark', 'bulb', 'check', 'flag',
            'heart', 'home', 'star', 'target'
          )
        )
      )
    ),
    false
  );
$icon$;

create or replace function private.valid_note_cover(value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $cover$
  -- Same three-valued trap as above, and it had the same hole: a cover with no
  -- `position` was stored, because `jsonb_typeof(null) = 'number'` is null
  -- rather than false.
  select coalesce(
    value is null
    or (
      jsonb_typeof(value) = 'object'
      and jsonb_typeof(value -> 'position') = 'number'
      and (value ->> 'position')::double precision between 0 and 1
      and (
        (
          value ->> 'kind' = 'preset'
          and value ->> 'id' in ('museum', 'dusk', 'forest', 'ocean', 'paper', 'ember')
        )
        or (
          value ->> 'kind' = 'upload'
          and value ->> 'objectId' ~*
            '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        )
      )
    ),
    false
  );
$cover$;

alter table public.notes
  add column if not exists page_icon jsonb,
  add column if not exists cover jsonb;

alter table public.notes
  drop constraint if exists notes_page_icon_check,
  add constraint notes_page_icon_check check (private.valid_page_icon(page_icon)),
  drop constraint if exists notes_cover_check,
  add constraint notes_cover_check check (private.valid_note_cover(cover));

create table if not exists public.note_templates (
  id uuid primary key,
  archive_id uuid not null references public.archives(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  description text not null default '' check (char_length(description) <= 240),
  title text not null default '',
  content jsonb not null check (
    coalesce(jsonb_typeof(content) = 'object' and content ->> 'type' = 'doc', false)
  ),
  page_icon jsonb,
  cover jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint note_templates_page_icon_check check (private.valid_page_icon(page_icon)),
  constraint note_templates_cover_check check (private.valid_note_cover(cover))
);

create index if not exists note_templates_archive_updated_idx
  on public.note_templates (archive_id, updated_at desc);

alter table public.note_templates enable row level security;

drop policy if exists note_templates_member_select on public.note_templates;
create policy note_templates_member_select on public.note_templates
  for select to authenticated
  using ((select private.is_archive_member(archive_id)));

drop policy if exists note_templates_editor_insert on public.note_templates;
create policy note_templates_editor_insert on public.note_templates
  for insert to authenticated
  with check (
    (select private.can_write_archive(archive_id))
    and created_by = (select auth.uid())
  );

drop policy if exists note_templates_editor_update on public.note_templates;
create policy note_templates_editor_update on public.note_templates
  for update to authenticated
  using ((select private.can_write_archive(archive_id)))
  with check ((select private.can_write_archive(archive_id)));

drop policy if exists note_templates_editor_delete on public.note_templates;
create policy note_templates_editor_delete on public.note_templates
  for delete to authenticated
  using ((select private.can_write_archive(archive_id)));

revoke all on public.note_templates from anon;
grant select, insert, update, delete on public.note_templates to authenticated;

do $realtime$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'note_templates'
  ) then
    alter publication supabase_realtime add table public.note_templates;
  end if;
end
$realtime$;

comment on column public.notes.page_icon is
  'Optional emoji or stable curated symbol identifier displayed above the title.';
comment on column public.notes.cover is
  'Optional curated/uploaded cover and normalized vertical focal position.';
comment on table public.note_templates is
  'Reusable structured pages shared privately by the members of one archive.';
