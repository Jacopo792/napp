-- Invitations are claimed by a confirmed account, never by resolving an email
-- address from the browser. The raw token is returned once; only its SHA-256
-- digest is stored, so reading the table cannot produce a usable invitation.

create table if not exists public.archive_invites (
  id uuid primary key default gen_random_uuid(),
  archive_id uuid not null references public.archives(id) on delete cascade,
  email text not null check (char_length(email) between 3 and 320),
  token_hash bytea not null unique,
  invited_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  claimed_at timestamptz,
  claimed_by uuid references auth.users(id) on delete set null,
  check ((claimed_at is null) = (claimed_by is null))
);

create unique index if not exists archive_invites_active_email_idx
  on public.archive_invites (archive_id, lower(email))
  where claimed_at is null;

alter table public.archive_invites enable row level security;

drop policy if exists archive_invites_member_select on public.archive_invites;
create policy archive_invites_member_select on public.archive_invites
  for select to authenticated
  using ((select private.is_archive_member(archive_id)));

revoke all on public.archive_invites from anon;
revoke insert, update, delete on public.archive_invites from authenticated;
grant select on public.archive_invites to authenticated;

create or replace function private.issue_archive_invite(
  target_archive_id uuid,
  target_email text
)
returns text
language plpgsql
security definer
set search_path = ''
as $issue$
declare
  current_user_id uuid := (select auth.uid());
  normalized_email text := lower(pg_catalog.btrim(target_email));
  raw_token text := pg_catalog.encode(extensions.gen_random_bytes(32), 'hex');
  hashed_token bytea := extensions.digest(raw_token, 'sha256');
begin
  if current_user_id is null
     or not private.is_archive_member(target_archive_id) then
    raise insufficient_privilege using message = 'Archive membership required';
  end if;

  if char_length(normalized_email) < 3
     or char_length(normalized_email) > 320
     or pg_catalog.position('@' in normalized_email) < 2 then
    raise invalid_parameter_value using message = 'Enter a valid email address';
  end if;

  update public.archive_invites
  set token_hash = hashed_token,
      invited_by = current_user_id,
      created_at = now(),
      expires_at = now() + interval '7 days'
  where archive_id = target_archive_id
    and lower(email) = normalized_email
    and claimed_at is null;

  if not found then
    insert into public.archive_invites (
      archive_id, email, token_hash, invited_by
    ) values (
      target_archive_id, normalized_email, hashed_token, current_user_id
    );
  end if;

  return raw_token;
end;
$issue$;

create or replace function private.redeem_archive_invite(invite_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $redeem$
declare
  current_user_id uuid := (select auth.uid());
  confirmed_email text;
  invitation public.archive_invites%rowtype;
begin
  if current_user_id is null then
    raise insufficient_privilege using message = 'Authentication required';
  end if;

  if invite_token !~ '^[0-9a-f]{64}$' then
    raise invalid_parameter_value using message = 'Invitation is invalid or expired';
  end if;

  select *
  into invitation
  from public.archive_invites
  where token_hash = extensions.digest(invite_token, 'sha256')
  for update;

  if invitation.id is null
     or invitation.expires_at <= now() then
    raise invalid_parameter_value using message = 'Invitation is invalid or expired';
  end if;

  if invitation.claimed_at is not null then
    if invitation.claimed_by = current_user_id then
      return invitation.archive_id;
    end if;
    raise invalid_parameter_value using message = 'Invitation is invalid or expired';
  end if;

  select lower(member.email)
  into confirmed_email
  from auth.users as member
  where member.id = current_user_id
    and member.email_confirmed_at is not null;

  if confirmed_email is null
     or confirmed_email <> lower(invitation.email) then
    raise insufficient_privilege using message = 'Invitation belongs to another account';
  end if;

  insert into public.archive_members (archive_id, user_id)
  values (invitation.archive_id, current_user_id)
  on conflict (archive_id, user_id) do nothing;

  update public.archive_invites
  set claimed_at = now(), claimed_by = current_user_id
  where id = invitation.id;

  return invitation.archive_id;
end;
$redeem$;

create or replace function public.create_archive_invite(
  archive_id uuid,
  email text
)
returns text
language sql
security invoker
set search_path = ''
as $create_rpc$
  select private.issue_archive_invite(archive_id, email);
$create_rpc$;

create or replace function public.claim_archive_invite(token text)
returns uuid
language sql
security invoker
set search_path = ''
as $claim_rpc$
  select private.redeem_archive_invite(token);
$claim_rpc$;

revoke all on function private.issue_archive_invite(uuid, text) from public, anon;
revoke all on function private.redeem_archive_invite(text) from public, anon;
revoke all on function public.create_archive_invite(uuid, text) from public, anon;
revoke all on function public.claim_archive_invite(text) from public, anon;
grant execute on function private.issue_archive_invite(uuid, text) to authenticated;
grant execute on function private.redeem_archive_invite(text) to authenticated;
grant execute on function public.create_archive_invite(uuid, text) to authenticated;
grant execute on function public.claim_archive_invite(text) to authenticated;
