create table private.suspended_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  suspended_at timestamptz not null default now()
);

create table private.policy_acceptances (
  user_id uuid not null references auth.users(id) on delete cascade,
  terms_version text not null,
  privacy_version text not null,
  accepted_at timestamptz not null default clock_timestamp(),
  source text not null check (source in ('legacy_metadata', 'signup', 'rpc')),
  primary key (user_id, terms_version, privacy_version)
);
revoke all on private.suspended_accounts, private.policy_acceptances from public, anon, authenticated;

-- Legacy metadata is imported once and identified as such. Its client clock
-- is deliberately excluded from the acceptance record.
insert into private.policy_acceptances(user_id, terms_version, privacy_version, source)
select id, '2026-11-16', '2026-11-16', 'legacy_metadata' from auth.users
where raw_user_meta_data->>'napp_terms_version' = '2026-11-16'
  and raw_user_meta_data->>'napp_privacy_version' = '2026-11-16';

create function private.record_signup_policies()
returns trigger language plpgsql security definer set search_path = ''
as $signup$
begin
  if new.raw_user_meta_data->>'napp_terms_version' = '2026-11-16'
    and new.raw_user_meta_data->>'napp_privacy_version' = '2026-11-16' then
    insert into private.policy_acceptances(user_id, terms_version, privacy_version, source)
    values (new.id, '2026-11-16', '2026-11-16', 'signup');
  end if;
  return new;
end;
$signup$;
create trigger record_signup_policies after insert on auth.users
for each row execute function private.record_signup_policies();

create function private.account_active(account_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $active$
  select exists (select 1 from auth.users u where u.id = account_id
    and coalesce(u.banned_until <= statement_timestamp(), true))
    and (nullif(auth.jwt()->>'session_id', '') is null or exists (
      select 1 from auth.sessions s where s.id = (auth.jwt()->>'session_id')::uuid and s.user_id = account_id
    ))
    and not exists (select 1 from private.account_erasure_jobs where user_id = account_id)
    and not exists (select 1 from private.suspended_accounts where user_id = account_id);
$active$;

create function public.has_accepted_policies()
returns boolean language sql stable security definer set search_path = ''
as $accepted$
  select exists (select 1 from private.policy_acceptances
    where user_id = (select auth.uid()) and terms_version = '2026-11-16'
      and privacy_version = '2026-11-16');
$accepted$;

create function public.accept_policies(terms_version text, privacy_version text)
returns void language plpgsql security definer set search_path = ''
as $accept$
declare caller uuid := auth.uid();
begin
  if not private.account_active(caller) then
    raise insufficient_privilege using message = 'This account is unavailable';
  end if;
  if terms_version is distinct from '2026-11-16' or privacy_version is distinct from '2026-11-16' then
    raise check_violation using message = 'Update Napp to view the current policies';
  end if;
  insert into private.policy_acceptances(user_id, terms_version, privacy_version, source)
  values (caller, terms_version, privacy_version, 'rpc') on conflict do nothing;
end;
$accept$;

create function private.account_write_allowed()
returns boolean language sql stable security definer set search_path = ''
as $allowed$
  select private.account_active((select auth.uid())) and public.has_accepted_policies();
$allowed$;

create function private.account_can_share()
returns boolean language sql stable security definer set search_path = ''
as $share$
  select private.account_write_allowed() and exists (select 1 from auth.users
    where id = (select auth.uid()) and not is_anonymous and email_confirmed_at is not null);
$share$;

revoke all on function private.record_signup_policies(), private.account_active(uuid),
  public.has_accepted_policies(), public.accept_policies(text,text),
  private.account_write_allowed(), private.account_can_share() from public, anon, authenticated;
grant execute on function public.has_accepted_policies(), public.accept_policies(text,text),
  private.account_write_allowed(), private.account_can_share() to authenticated;

create function public.set_account_suspension(target_user_id uuid, suspended boolean)
returns void language plpgsql security definer set search_path = ''
as $suspend$
begin
  if suspended then
    insert into private.suspended_accounts(user_id) values (target_user_id) on conflict do nothing;
    -- Auth Admin bans the account. Removing these sessions invalidates its
    -- refresh tokens, including after an eventual unban.
    delete from auth.sessions where user_id = target_user_id;
  else
    delete from private.suspended_accounts where user_id = target_user_id;
  end if;
end;
$suspend$;
revoke all on function public.set_account_suspension(uuid,boolean) from public, anon, authenticated;
grant execute on function public.set_account_suspension(uuid,boolean) to service_role;

create or replace function private.guard_erased_account_writes()
returns trigger language plpgsql security definer set search_path = ''
as $guard$
begin
  if auth.uid() is not null then
    if exists (select 1 from private.account_erasure_jobs where user_id = auth.uid())
      or not exists (select 1 from auth.users where id = auth.uid()) then
      raise insufficient_privilege using message = 'This account is being deleted';
    end if;
    if not private.account_write_allowed() then
      raise insufficient_privilege using message = 'This account cannot write';
    end if;
    if tg_op <> 'DELETE' and (
      tg_table_schema = 'storage'
      or tg_table_name in ('archive_invites', 'archive_messages', 'archive_message_reactions',
        'note_comments', 'note_comment_reactions', 'archive_stickers')
      or (tg_table_name = 'archive_members' and tg_op = 'INSERT' and
        exists (select 1 from public.archive_members where archive_id = (to_jsonb(new)->>'archive_id')::uuid))
    ) and not private.account_can_share() then
      raise insufficient_privilege using message = 'A confirmed email is required to share content';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$guard$;

do $guards$
declare target text;
begin
  foreach target in array array[
    'archives','archive_members','archive_invites','notes','folders','tags',
    'note_tags','profiles','profile_preferences','note_comments',
    'note_comment_reactions','note_versions','archive_sources','media_text',
    'user_blocks','archive_messages','archive_message_reactions','archive_stickers','note_documents'
  ] loop
    execute format('drop trigger if exists guard_erased_account_writes on public.%I', target);
    execute format('create trigger guard_erased_account_writes before insert or update or delete on public.%I for each row execute function private.guard_erased_account_writes()', target);
    execute format('create policy account_write_insert on public.%I as restrictive for insert to authenticated with check ((select private.account_write_allowed()))', target);
    execute format('create policy account_write_update on public.%I as restrictive for update to authenticated using ((select private.account_write_allowed())) with check ((select private.account_write_allowed()))', target);
    execute format('create policy account_write_delete on public.%I as restrictive for delete to authenticated using ((select private.account_write_allowed()))', target);
  end loop;
end;
$guards$;
drop trigger guard_erased_account_writes on storage.objects;
create trigger guard_erased_account_writes before insert or update or delete on storage.objects
for each row execute function private.guard_erased_account_writes();

create policy verified_upload_insert on storage.objects as restrictive for insert to authenticated
with check ((select private.account_can_share()));
create policy verified_upload_update on storage.objects as restrictive for update to authenticated
using ((select private.account_can_share())) with check ((select private.account_can_share()));
create policy verified_upload_delete on storage.objects as restrictive for delete to authenticated
using ((select private.account_write_allowed()));
create policy verified_broadcast on realtime.messages as restrictive for insert to authenticated
with check ((select private.account_write_allowed()) and
  (realtime.topic() not like 'typing:%' or (select private.account_can_share())));

create or replace function private.is_archive_member(target_archive_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $member$
  select private.account_active((select auth.uid()))
    and exists (select 1 from public.archive_members
      where archive_id = target_archive_id and user_id = (select auth.uid()));
$member$;

create or replace function private.is_disposable_email(address text)
returns boolean language sql stable set search_path = ''
as $disposable$
  with host as (
    select rtrim(lower(btrim(split_part(regexp_replace(address, '^.*@', ''), '>', 1))), '.') as name
    where strpos(address, '@') > 0
  )
  select exists (select 1 from host, private.disposable_email_domains listed
    where host.name <> '' and (host.name = listed.domain or host.name like '%.' || listed.domain));
$disposable$;

-- The archive row lock serializes issuance, including token rotation. Count
-- each issuance so repeated rotations cannot circumvent the archive limit.
create table private.archive_invite_issuances (
  archive_id uuid not null references public.archives(id) on delete cascade,
  issued_at timestamptz not null default clock_timestamp()
);
create index archive_invite_issuances_archive_time on private.archive_invite_issuances(archive_id, issued_at);
revoke all on private.archive_invite_issuances from public, anon, authenticated;

create or replace function private.can_write_archive(target_archive_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $writer$
  select private.account_write_allowed() and private.is_archive_member(target_archive_id)
    and (private.account_can_share() or not exists (
      select 1 from public.archive_members where archive_id = target_archive_id and user_id <> (select auth.uid())
    ))
    and private.archive_plan_writable(target_archive_id)
    and exists (select 1 from public.archive_members
      where archive_id = target_archive_id and user_id = (select auth.uid()) and role = 'editor');
$writer$;

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
  perform private.lock_group_capacity(target_archive_id);
  if not private.account_can_share()
     or not private.can_write_archive(target_archive_id) then
    raise insufficient_privilege using message = 'A confirmed email and editor role are required';
  end if;

  if target_role not in ('editor', 'viewer') then
    raise invalid_parameter_value using message = 'Role must be editor or viewer';
  end if;

  if char_length(normalized_email) < 3
     or char_length(normalized_email) > 320
     or pg_catalog.strpos(normalized_email, '@') < 2 then
    raise invalid_parameter_value using message = 'Enter a valid email address';
  end if;

  perform private.check_free_group_capacity(target_archive_id);
  if private.archive_seats_taken(target_archive_id, normalized_email)
     >= private.archive_seat_limit(target_archive_id) then
    raise check_violation using
      message = 'This archive is full. Remove a member or let an invitation expire first.';
  end if;

  delete from private.archive_invite_issuances
    where archive_id = target_archive_id and issued_at <= now() - interval '1 day';
  if (select count(*) from private.archive_invite_issuances where archive_id = target_archive_id) >= 20 then
    raise sqlstate 'PT429' using message = 'This archive has reached its daily invitation limit';
  end if;
  insert into private.archive_invite_issuances(archive_id) values (target_archive_id);

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
  if not private.account_can_share() then
    raise insufficient_privilege using message = 'Confirm your email and accept the policies to claim an invitation';
  end if;
  if invite_token !~ '^[0-9a-f]{64}$' then
    raise invalid_parameter_value using message = 'Invitation is invalid or expired';
  end if;

  perform private.lock_group_capacity((
    select archive_id from public.archive_invites
    where token_hash = extensions.digest(invite_token, 'sha256')
  ));

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

  select lower(member.email) into caller_email
  from auth.users as member
  where member.id = current_user_id and member.email_confirmed_at is not null;

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

create or replace function private.create_archive(archive_name text)
returns uuid language plpgsql security definer set search_path = ''
as $safe_create_archive$
declare caller uuid := (select auth.uid()); result uuid; candidate uuid;
begin
  if not private.account_can_share() then
    raise insufficient_privilege using message = 'Confirm your email to create a group';
  end if;
  if btrim(coalesce(archive_name,'')) = '' or char_length(btrim(archive_name)) > 80 then
    raise check_violation using message = 'An archive needs a name of up to 80 characters';
  end if;
  insert into public.archives(name,settings) values(btrim(archive_name),'{}') returning id into result;
  insert into public.archive_members(archive_id,user_id) values(result,caller);
  if private.effective_plan(caller) = 'free' then
    return result;
  end if;
  for candidate in
    select distinct other.user_id from public.archive_members mine
      join public.archive_members other using(archive_id)
      where mine.user_id = caller and other.user_id <> caller
        and private.people_not_blocked(other.user_id)
        and exists (select 1 from auth.users u where u.id = other.user_id
          and not u.is_anonymous and u.email_confirmed_at is not null
          and coalesce(u.banned_until <= statement_timestamp(), true))
        and not exists (select 1 from private.suspended_accounts where user_id = other.user_id)
      order by other.user_id
  loop
    exit when (select count(*) from public.archive_members where archive_id = result) >= 8;
    if not exists (select 1 from public.user_blocks b
      join public.archive_members seated on seated.archive_id = result
      where (b.blocker_id = candidate and b.blocked_id = seated.user_id)
        or (b.blocked_id = candidate and b.blocker_id = seated.user_id)) then
      insert into public.archive_members(archive_id,user_id) values(result,candidate) on conflict do nothing;
    end if;
  end loop;
  return result;
end;
$safe_create_archive$;


create trigger guard_erased_account_writes before insert or update on private.usage_devices
for each row execute function private.guard_erased_account_writes();
