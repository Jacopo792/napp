-- A new account opens to a note that tours Napp, instead of an empty list.
--
-- The bootstrap writes it in the same transaction as the archive. It is stored
-- as Markdown in `body` with `content_version = 0`: the browser and the
-- collaboration server already turn that into the rich-text document, and the
-- server seeds the Yjs binary the first time the note is opened.
--
-- The note's id is the archive's own id. That marks it without a column, and
-- lets the invitation cleanup tell "an empty default archive with its welcome
-- note still untouched" (version 1: its text never written, since opening a
-- note does not write it; not archived or trashed) from one somebody has
-- started to use. A folder or anything else in the archive still keeps it.

create or replace function private.bootstrap_personal_archive()
returns uuid
language plpgsql
security definer
set search_path = ''
as $bootstrap$
declare
  current_user_id uuid := (select auth.uid());
  existing_archive_id uuid;
  new_archive_id uuid;
begin
  if current_user_id is null then
    raise insufficient_privilege using message = 'Authentication required';
  end if;

  -- Two tabs completing the same first sign-in must not create two archives.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(current_user_id::text, 0)
  );

  select member.archive_id
  into existing_archive_id
  from public.archive_members as member
  where member.user_id = current_user_id
  order by member.created_at, member.archive_id
  limit 1;

  if existing_archive_id is not null then
    return existing_archive_id;
  end if;

  insert into public.archives (name, settings, auto_created)
  values ('My notes', '{}'::jsonb, true)
  returning id into new_archive_id;

  insert into public.archive_members (archive_id, user_id)
  values (new_archive_id, current_user_id);

  insert into public.notes (id, archive_id, owner_id, title, body, content_version, created_at, updated_at)
  values (new_archive_id, new_archive_id, current_user_id, 'Welcome to Napp', private.welcome_note_body(), 0, now(), now());

  return new_archive_id;
end;
$bootstrap$;

create or replace function private.welcome_note_body()
returns text
language sql
immutable
set search_path = ''
as $body$
  select 'Napp is a place to write notes together, with a chat beside them. Here is the short tour.

## Write

Press **New note** to start. Use headings, checklists, tables, links, images and files, then drag notes into folders and pin the ones you need most.

## Find anything

Press **⌘K** (Ctrl+K on Windows) to search every note and folder.

## Share this group

This group is yours. Invite up to seven people from **Settings › Members**: everyone edits the same notes live.

## Talk

Open the **General chat** to talk with everyone, or a note''s own chat to talk about it. Send photos, GIFs and stickers, or add your own pictures to the group''s sticker pack.

## Draw

Sketch on the page or on a board with pencil, marker and eraser.

## Go back in time

**History** keeps earlier versions of every note. Restoring one saves the present first, so nothing is lost.

## Keep it yours

Lock a note or a passage so only you can change its writing.

Delete this note whenever you like. Happy writing!'::text;
$body$;

create or replace function private.discard_empty_default_archive(member_id uuid, keep_archive_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $discard$
declare
  candidate uuid;
begin
  select a.id into candidate
    from public.archives a
   where a.auto_created
     and a.created_by = member_id
     and a.id <> keep_archive_id
   order by a.created_at
   limit 1
     for update;
  if candidate is null then
    return null;
  end if;
  -- An edit in flight waits here; one that committed first is seen below.
  perform 1 from public.notes where archive_id = candidate for update;

  if exists (select 1 from public.archive_members
              where archive_id = candidate and user_id <> member_id)
     or not exists (select 1 from public.archive_members
                     where archive_id = candidate and user_id = member_id)
     or not exists (select 1 from public.archive_members
                     where archive_id <> candidate and user_id = member_id)
     -- Any note but the untouched welcome note means the archive is in use.
     or exists (select 1 from public.notes
                 where archive_id = candidate
                   and not (id = candidate and version = 1
                            and content_version = 0
                            and title is not distinct from 'Welcome to Napp'
                            and body is not distinct from private.welcome_note_body()
                            and trashed_at is null and archived_at is null))
     or exists (select 1 from public.folders where archive_id = candidate)
     or exists (select 1 from public.tags where archive_id = candidate)
     or exists (select 1 from public.archive_sources where archive_id = candidate)
     or exists (select 1 from public.archive_invites where archive_id = candidate)
     or exists (select 1 from storage.objects
                 where bucket_id = 'note-images'
                   and pg_catalog.split_part(name, '/', 1) = candidate::text) then
    return null;
  end if;

  delete from public.archives where id = candidate;
  return candidate;
end;
$discard$;

revoke all on function private.welcome_note_body() from public, anon, authenticated;
revoke all on function private.discard_empty_default_archive(uuid, uuid)
  from public, anon, authenticated;
