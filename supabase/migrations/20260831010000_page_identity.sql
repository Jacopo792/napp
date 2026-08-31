-- Optional page icon and cover properties. Existing notes remain unchanged:
-- null means the page has neither adornment.

create or replace function private.valid_page_icon(value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $icon$
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

comment on column public.notes.page_icon is
  'Optional emoji or stable curated symbol identifier displayed above the title.';
comment on column public.notes.cover is
  'Optional curated/uploaded cover and normalized vertical focal position.';
