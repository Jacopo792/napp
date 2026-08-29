-- Tiptap becomes the canonical editor without destroying the Markdown corpus.
-- `body` remains plain text for previews and search, while `legacy_body` keeps
-- the exact source that existed before conversion. A row is upgraded to v1 on
-- its first real edit; merely opening it never changes timestamps or ordering.

alter table public.notes
  add column if not exists content jsonb,
  add column if not exists content_version smallint not null default 0,
  add column if not exists legacy_body text;

update public.notes
set legacy_body = body
where content_version = 0
  and legacy_body is null;

alter table public.notes
  drop constraint if exists notes_content_version_check;

alter table public.notes
  add constraint notes_content_version_check check (
    (content_version = 0 and content is null)
    or
    (
      content_version = 1
      and jsonb_typeof(content) = 'object'
      and content ->> 'type' = 'doc'
    )
  );

comment on column public.notes.content is
  'Canonical Tiptap JSON document for rich-text notes.';
comment on column public.notes.content_version is
  '0 = legacy Markdown in legacy_body, 1 = Tiptap JSON in content.';
comment on column public.notes.legacy_body is
  'Exact pre-Tiptap Markdown retained for rollback and migration audits.';
