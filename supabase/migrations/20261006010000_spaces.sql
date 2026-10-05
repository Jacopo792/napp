-- Spaces: an account may hold several archives and make new ones itself.
--
-- 1. `create_archive(name)` — `ensure_personal_archive` only ever makes the
--    first, and a brand new archive has no members for `archives_editor_insert`
--    to recognise, so a client could not make a second one at all. This is the
--    one way in: the archive and the caller's seat in it, in one transaction.
-- 2. Seats may not be set below the members already sitting in them. The
--    insert trigger keeps a full archive full; nothing stopped the limit being
--    lowered under the people already there.
-- 3. No member may delete an archive. The policy let anybody invited in drop
--    the whole thing — every note, every folder — and nothing in the
--    interface ever asked for it. Leaving is `leave_shared_archive`.

create or replace function private.create_archive(archive_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $create$
declare
  current_user_id uuid := (select auth.uid());
  trimmed text := pg_catalog.btrim(coalesce(archive_name, ''));
  new_archive_id uuid;
begin
  if current_user_id is null then
    raise insufficient_privilege using message = 'Authentication required';
  end if;
  if trimmed = '' or pg_catalog.length(trimmed) > 80 then
    raise check_violation using message = 'An archive needs a name of up to 80 characters';
  end if;
  -- Not a quota anybody is meant to meet; a loop in a client is.
  if (select count(*) from public.archive_members where user_id = current_user_id) >= 20 then
    raise check_violation using message = 'You already belong to twenty archives';
  end if;

  insert into public.archives (name, settings)
  values (trimmed, '{}'::jsonb)
  returning id into new_archive_id;

  insert into public.archive_members (archive_id, user_id)
  values (new_archive_id, current_user_id);

  return new_archive_id;
end;
$create$;

revoke all on function private.create_archive(text) from public, anon;
grant execute on function private.create_archive(text) to authenticated;

create or replace function public.create_archive(archive_name text)
returns uuid
language sql
set search_path = ''
as $public_create$
  select private.create_archive(archive_name);
$public_create$;

revoke all on function public.create_archive(text) from public, anon;
grant execute on function public.create_archive(text) to authenticated;

create or replace function private.keep_seats_for_members()
returns trigger
language plpgsql
security definer
set search_path = ''
as $seats$
begin
  if new.seat_limit < (
    select count(*) from public.archive_members where archive_id = new.id
  ) then
    raise check_violation using message = 'There are more members than that';
  end if;
  return new;
end;
$seats$;

drop trigger if exists archives_seats_hold_members on public.archives;
create trigger archives_seats_hold_members
  before update of seat_limit on public.archives
  for each row execute function private.keep_seats_for_members();

drop policy if exists archives_editor_delete on public.archives;
