-- What a chapter is, besides its words: how far along it is, what it is
-- about in two lines, and how long it is meant to be — Scrivener's status,
-- synopsis and target. One object rather than three columns, because the
-- three are read and written together and only a document archive reads them.
--
-- It is metadata, like `position`: written through the ordinary row update,
-- it moves no version and restamps no `updated_at`, so marking a chapter
-- Revised is not an edit to it.
--
-- Additive; apply before deploying the client that selects it.

alter table public.notes
  add column if not exists chapter jsonb;

alter table public.notes
  drop constraint if exists notes_chapter_check;
alter table public.notes
  add constraint notes_chapter_check check (
    chapter is null or (
      jsonb_typeof(chapter) = 'object'
      and pg_column_size(chapter) <= 4096
      and (not chapter ? 'status' or chapter ->> 'status' in ('draft', 'revised', 'final'))
      and (not chapter ? 'synopsis' or jsonb_typeof(chapter -> 'synopsis') = 'string')
      and (not chapter ? 'goal' or jsonb_typeof(chapter -> 'goal') = 'number')
    )
  );
