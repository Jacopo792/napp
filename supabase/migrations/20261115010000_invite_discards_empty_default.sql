-- Accepting an invitation leaves one archive, not two.
--
-- Signing in makes every account a "My notes" archive first
-- (`bootstrap_personal_archive`), so somebody who joins through an
-- invitation arrives with an empty archive of their own beside the shared
-- one. Redeeming now discards that archive — and the inviter's, when the
-- invitation came from a different archive than their own default.
--
-- Data loss is the only thing that matters here, so an archive goes only when
-- all of these hold, checked with the row locked:
--   · `auto_created` — made by the bootstrap, never by `create_archive`;
--   · its maker is its one and only member;
--   · it is not the archive being joined, and the maker keeps another one;
--   · no note (trashed ones included), folder, tag, source, pending
--     invitation or stored file belongs to it.
-- Anything else is left exactly as it was, silently: an invitation never fails
-- because a default archive could not be tidied away.
--
-- The rule is the one `delete_archive` enforces, made stricter, in a function
-- of its own because `archive_deletion_refusal` asks about `auth.uid()` and
-- the inviter is not the caller. The row lock is the same: a note inserted
-- meanwhile takes a key-share lock on the archive and so waits, then fails on
-- its foreign key, rather than vanishing.

alter table public.archives
  add column if not exists auto_created boolean not null default false;

-- Existing defaults: the bootstrap only ever made an account's first archive,
-- named "My notes". The content checks below are the real guard.
update public.archives a
   set auto_created = true
 where a.name = 'My notes'
   and a.created_by is not null
   and a.id = (
     select m.archive_id from public.archive_members m
      where m.user_id = a.created_by
      order by m.created_at, m.archive_id
      limit 1
   );

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

  return new_archive_id;
end;
$bootstrap$;

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

  if exists (select 1 from public.archive_members
              where archive_id = candidate and user_id <> member_id)
     or not exists (select 1 from public.archive_members
                     where archive_id = candidate and user_id = member_id)
     or not exists (select 1 from public.archive_members
                     where archive_id <> candidate and user_id = member_id)
     or exists (select 1 from public.notes where archive_id = candidate)
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

revoke all on function private.discard_empty_default_archive(uuid, uuid)
  from public, anon, authenticated;

create or replace function private.redeem_archive_invite(invite_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $redeem$
declare
  current_user_id uuid := (select auth.uid());
  caller_email text;
  invitation public.archive_invites%rowtype;
begin
  if current_user_id is null then
    raise insufficient_privilege using message = 'Authentication required';
  end if;
  if invite_token !~ '^[0-9a-f]{64}$' then
    raise invalid_parameter_value using message = 'Invitation is invalid or expired';
  end if;

  select * into invitation
  from public.archive_invites
  where token_hash = extensions.digest(invite_token, 'sha256')
  for update;

  if invitation.id is null or invitation.expires_at <= now() then
    raise invalid_parameter_value using message = 'Invitation is invalid or expired';
  end if;
  if invitation.claimed_at is not null then
    if invitation.claimed_by = current_user_id then
      return invitation.archive_id;
    end if;
    raise invalid_parameter_value using message = 'Invitation is invalid or expired';
  end if;

  -- The address still has to match the one invited. It is no longer proof the
  -- caller owns that mailbox, only that they were told which address to use.
  select lower(member.email) into caller_email
  from auth.users as member
  where member.id = current_user_id;

  if caller_email is null or caller_email <> lower(invitation.email) then
    raise insufficient_privilege using message = 'Invitation belongs to another account';
  end if;

  insert into public.archive_members (archive_id, user_id, role)
  values (invitation.archive_id, current_user_id, invitation.role)
  on conflict (archive_id, user_id) do nothing;

  update public.archive_invites
  set claimed_at = now(), claimed_by = current_user_id
  where id = invitation.id;

  perform private.discard_empty_default_archive(current_user_id, invitation.archive_id);
  perform private.discard_empty_default_archive(invitation.invited_by, invitation.archive_id);
  return invitation.archive_id;
end;
$redeem$;
