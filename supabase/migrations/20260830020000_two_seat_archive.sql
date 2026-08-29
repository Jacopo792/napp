-- Two things, both of them a boundary rather than a message.
--
-- First: signing up has been failing with "Database error saving new user"
-- since the profile table was reshaped. A trigger left behind by the Supabase
-- starter scaffold — `on_auth_user_created` calling `public.handle_new_user()`
-- — still inserts into `public.profiles (id, username, full_name, avatar_url)`,
-- and those columns have not existed since `20260829180000_member_profiles`
-- renamed that table to `legacy_profiles_20260829` and created the real one
-- with `user_id` / `nickname` / `avatar_object`. Every insert into `auth.users`
-- raised inside the trigger, GoTrue reported it as a generic database error,
-- and no account could be created. Nothing needs replacing: `ensureProfile()`
-- in `src/lib/session.ts` writes the profile on first sign-in, under the
-- account's own RLS, with a nickname taken from the address.
--
-- Second: this archive holds two people. The seat cap belongs on the insert
-- into `archive_members`, because that is the one door every path goes
-- through — bootstrap, invitation redemption, and anything written later.
-- Refusing a third invitation as well is a courtesy, not the boundary.

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

alter table public.archives
  add column if not exists seat_limit smallint not null default 2
  check (seat_limit between 1 and 8);

comment on column public.archives.seat_limit is
  'How many members this archive may hold. Two is what the interface is built for.';

create or replace function private.archive_seat_limit(target_archive_id uuid)
returns smallint
language sql
stable
security definer
set search_path = ''
as $seat_limit$
  select coalesce(
    (select seat_limit from public.archives where id = target_archive_id),
    2::smallint
  );
$seat_limit$;

-- A seat is taken by a member, or held by an invitation that is still live.
-- `excluded_email` is the address being re-invited: rewriting an unclaimed
-- invitation reuses the seat it already holds instead of asking for another.
create or replace function private.archive_seats_taken(
  target_archive_id uuid,
  excluded_email text default null
)
returns integer
language sql
stable
security definer
set search_path = ''
as $seats$
  select
    (select count(*) from public.archive_members where archive_id = target_archive_id)
    + (
      select count(*)
      from public.archive_invites
      where archive_id = target_archive_id
        and claimed_at is null
        and expires_at > now()
        and (excluded_email is null or lower(email) <> lower(excluded_email))
    );
$seats$;

revoke all on function private.archive_seat_limit(uuid) from public, anon;
revoke all on function private.archive_seats_taken(uuid, text) from public, anon;
grant execute on function private.archive_seat_limit(uuid) to authenticated;
grant execute on function private.archive_seats_taken(uuid, text) to authenticated;

-- The boundary. Security definer so it can count rows the caller's own policy
-- would hide from it, and `before insert` so the refusal costs nothing.
create or replace function private.enforce_archive_seats()
returns trigger
language plpgsql
security definer
set search_path = ''
as $enforce$
declare
  seats integer;
  limit_seats smallint := private.archive_seat_limit(new.archive_id);
begin
  -- Re-inserting a row that already exists takes no new seat: redemption uses
  -- `on conflict do nothing`, and a before-insert trigger runs ahead of that.
  if exists (
    select 1 from public.archive_members
    where archive_id = new.archive_id and user_id = new.user_id
  ) then
    return new;
  end if;

  select count(*) into seats
  from public.archive_members
  where archive_id = new.archive_id;

  if seats >= limit_seats then
    raise check_violation using message = 'This archive is full';
  end if;

  return new;
end;
$enforce$;

drop trigger if exists archive_members_seat_cap on public.archive_members;
create trigger archive_members_seat_cap
  before insert on public.archive_members
  for each row execute function private.enforce_archive_seats();

-- Issuing an invitation for a seat that does not exist only produces a link
-- that fails on redemption, which is a worse way to learn the same fact.
create or replace function private.issue_archive_invite(
  target_archive_id uuid,
  target_email text,
  target_role text
)
returns text
language plpgsql
security definer
set search_path = ''
as $issue_seats$
declare
  current_user_id uuid := (select auth.uid());
  normalized_email text := lower(pg_catalog.btrim(target_email));
  raw_token text := pg_catalog.encode(extensions.gen_random_bytes(32), 'hex');
  hashed_token bytea := extensions.digest(raw_token, 'sha256');
begin
  if current_user_id is null
     or not private.can_write_archive(target_archive_id) then
    raise insufficient_privilege using message = 'Editor role required';
  end if;

  if target_role not in ('editor', 'viewer') then
    raise invalid_parameter_value using message = 'Role must be editor or viewer';
  end if;

  if char_length(normalized_email) < 3
     or char_length(normalized_email) > 320
     or pg_catalog.strpos(normalized_email, '@') < 2 then
    raise invalid_parameter_value using message = 'Enter a valid email address';
  end if;

  if private.archive_seats_taken(target_archive_id, normalized_email)
     >= private.archive_seat_limit(target_archive_id) then
    raise check_violation using
      message = 'This archive is full. Remove a member or let an invitation expire first.';
  end if;

  update public.archive_invites
  set token_hash = hashed_token,
      role = target_role,
      invited_by = current_user_id,
      created_at = now(),
      expires_at = now() + interval '7 days'
  where archive_id = target_archive_id
    and lower(email) = normalized_email
    and claimed_at is null;

  if not found then
    insert into public.archive_invites (
      archive_id, email, token_hash, invited_by, role
    ) values (
      target_archive_id, normalized_email, hashed_token, current_user_id, target_role
    );
  end if;

  return raw_token;
end;
$issue_seats$;

revoke all on function private.issue_archive_invite(uuid, text, text) from public, anon;
grant execute on function private.issue_archive_invite(uuid, text, text) to authenticated;
