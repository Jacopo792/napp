-- A note may carry a picture of its own, chosen from its context menu and
-- shown wherever the note is named. It is stored in the column the emoji and
-- symbol icons used, which the client no longer writes: widening the check
-- rather than narrowing it keeps every existing row valid, so this applies
-- ahead of the deploy without stranding the build that is still live.

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
          value ->> 'kind' = 'photo'
          and value ->> 'objectId' ~*
            '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        )
        or (
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

comment on column public.notes.page_icon is
  'Optional picture for the note, as {"kind":"photo","objectId":<uuid>} in the '
  'archive''s private image bucket. Retired emoji and symbol shapes stay valid '
  'so existing rows keep passing the check.';
