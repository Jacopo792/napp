-- The collaborative document.
--
-- A note's text now lives in a Yjs document: `Y.Text("title")` and
-- `Y.XmlFragment("default")` inside one `Y.Doc`. The binary below is the whole
-- truth of a note's text; `notes.title`, `notes.body` and `notes.content` stay
-- as projections of it, because every list, search, preview, export and
-- template in this app reads those and none of them should have to understand
-- a CRDT.
--
-- The browser never touches this table. It is written by the collaboration
-- server with the service role, which is also the only thing that holds that
-- key. Row level security is enabled with no policy at all, so an authenticated
-- client that reaches it reads nothing and writes nothing.

create table if not exists public.note_documents (
  note_id uuid primary key references public.notes(id) on delete cascade,
  archive_id uuid not null references public.archives(id) on delete cascade,
  state bytea not null,
  format_version integer not null default 1,
  updated_at timestamptz not null default now()
);

create index if not exists note_documents_archive_idx
  on public.note_documents (archive_id);

alter table public.note_documents enable row level security;

-- Deliberately no policy: with row level security on and nothing granted, the
-- table is invisible to `anon` and `authenticated` alike. The service role
-- bypasses row level security, which is exactly the one path that should exist.
revoke all on public.note_documents from anon, authenticated;

comment on table public.note_documents is
  'Yjs binary per note. Reachable only by the collaboration server''s service role.';
comment on column public.note_documents.state is
  'Y.encodeStateAsUpdate of the whole document: title text and body fragment.';

-- ── Clients that predate the collaborative document ─────────────────────────
-- A tab still running the build before this one saves a note by writing the
-- whole row: title, body, content. Against a note that is now edited through
-- Yjs, that overwrites everybody's text with one browser's stale copy.
--
-- The write is refused rather than merged. PostgREST turns a `PT409` into an
-- HTTP 409, so the old client sees a save failure and keeps its draft, which
-- is the outcome that loses nothing: the text is still in front of the person
-- who typed it, and reloading brings a build that can save it.
create or replace function private.reject_stale_document_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $reject$
begin
  -- Only browser sessions are gated. The collaboration server arrives as
  -- `service_role`, migrations and administrative tools with no claims at all.
  --
  -- The role is read from PostgREST's request claims rather than from
  -- `current_user`, which inside a `security definer` function is the owner of
  -- the function and never the caller. The definer rights are needed for the
  -- `exists` below: `note_documents` has row level security on and no policy,
  -- so an authenticated session reading it directly would always see nothing
  -- and every stale write would be waved through.
  if coalesce(
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
       ''
     ) <> 'authenticated' then
    return new;
  end if;

  if (
    new.title is distinct from old.title
    or new.body is distinct from old.body
    or new.content is distinct from old.content
    or new.content_version is distinct from old.content_version
  ) and exists (
    select 1 from public.note_documents d where d.note_id = new.id
  ) then
    raise exception 'This note is edited collaboratively. Reload to get the version that can save it.'
      using errcode = 'PT409';
  end if;

  return new;
end
$reject$;

drop trigger if exists notes_reject_stale_document_write on public.notes;
create trigger notes_reject_stale_document_write
  before update on public.notes
  for each row
  execute function private.reject_stale_document_write();

comment on function private.reject_stale_document_write() is
  'Refuses a whole-row note save from a client that predates note_documents.';

-- ── The two calls the collaboration server makes ────────────────────────────
-- Both live in `public` because that is the schema PostgREST exposes, and both
-- are granted to `service_role` alone. The binary crosses as base64 rather than
-- as a bytea literal: one encode on each side, and no question about how a
-- driver chose to represent raw bytes today.

create or replace function public.load_note_document(target_note_id uuid)
returns table (state_base64 text, format_version integer)
language sql
security definer
set search_path = ''
as $load$
  select encode(d.state, 'base64'), d.format_version
  from public.note_documents d
  where d.note_id = target_note_id;
$load$;

-- Writes the document a note has never had. Deliberately does not touch
-- `public.notes`: opening a note for the first time is not an edit, and it must
-- not move the note up a list or restamp it.
create or replace function public.seed_note_document(
  target_note_id uuid,
  document_state_base64 text,
  document_format_version integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $seed$
declare
  seeded boolean;
begin
  insert into public.note_documents (note_id, archive_id, state, format_version)
  select target_note_id, n.archive_id, decode(document_state_base64, 'base64'),
         document_format_version
  from public.notes n
  where n.id = target_note_id
  on conflict (note_id) do nothing;

  get diagnostics seeded = row_count;
  return seeded;
end
$seed$;

-- One real edit: the binary and every projection read from it land together or
-- not at all. Anything that reads a note — the list, search, the preview, the
-- export, a template made from it — reads the projections, so a binary saved
-- without them would show the archive a note that had not changed.
create or replace function public.save_note_document(
  target_note_id uuid,
  document_state_base64 text,
  document_format_version integer,
  projected_title text,
  projected_body text,
  projected_content jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $save$
declare
  target_archive_id uuid;
  next_version bigint;
begin
  select n.archive_id into target_archive_id from public.notes n where n.id = target_note_id;
  if target_archive_id is null then
    raise exception 'No note %', target_note_id using errcode = 'PT404';
  end if;

  insert into public.note_documents (note_id, archive_id, state, format_version, updated_at)
  values (
    target_note_id, target_archive_id, decode(document_state_base64, 'base64'),
    document_format_version, now()
  )
  on conflict (note_id) do update
    set state = excluded.state,
        format_version = excluded.format_version,
        updated_at = excluded.updated_at;

  -- Nothing readable changed: leave the note where it is in every list.
  update public.notes n
     set title = projected_title,
         body = projected_body,
         content = projected_content,
         content_version = 1,
         updated_at = now(),
         version = n.version + 1
   where n.id = target_note_id
     and (
       n.title is distinct from projected_title
       or n.body is distinct from projected_body
       or n.content is distinct from projected_content
     )
  returning n.version into next_version;

  return next_version;
end
$save$;

revoke all on function public.load_note_document(uuid) from public, anon, authenticated;
revoke all on function public.seed_note_document(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.save_note_document(uuid, text, integer, text, text, jsonb)
  from public, anon, authenticated;

grant execute on function public.load_note_document(uuid) to service_role;
grant execute on function public.seed_note_document(uuid, text, integer) to service_role;
grant execute on function public.save_note_document(uuid, text, integer, text, text, jsonb)
  to service_role;
