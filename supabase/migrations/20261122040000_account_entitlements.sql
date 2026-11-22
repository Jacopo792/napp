create table public.account_entitlements (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null check (plan in ('free', 'plus')),
  status text not null check (status in ('trialing', 'active', 'past_due', 'canceled', 'expired')),
  trial_ends_at timestamptz check (isfinite(trial_ends_at)),
  current_period_end timestamptz check (isfinite(current_period_end)),
  source text not null check (source in ('trial', 'web', 'apple', 'google')),
  external_customer_id text,
  external_subscription_id text
);

alter table public.account_entitlements enable row level security;
revoke all on public.account_entitlements from public, anon, authenticated;
grant select on public.account_entitlements to authenticated;
grant select, insert, update, delete on public.account_entitlements to service_role;
create policy entitlement_read_own on public.account_entitlements for select to authenticated
using (owner_id = (select auth.uid()));

create function private.start_account_trial()
returns trigger language plpgsql security definer set search_path = ''
as $trial$
begin
  if not new.is_anonymous then
    insert into public.account_entitlements(owner_id, plan, status, trial_ends_at, source)
    values (new.id, 'plus', 'trialing', statement_timestamp() + interval '720 hours', 'trial')
    on conflict (owner_id) do nothing;
  end if;
  return new;
end;
$trial$;
revoke all on function private.start_account_trial() from public, anon, authenticated;

-- Installing the trigger first also covers sign-ups concurrent with the backfill.
create trigger start_account_trial after insert or update of is_anonymous on auth.users
for each row execute function private.start_account_trial();

insert into public.account_entitlements(owner_id, plan, status, trial_ends_at, source)
select id, 'plus', 'trialing', statement_timestamp() + interval '720 hours', 'trial'
from auth.users where not is_anonymous
on conflict (owner_id) do nothing;

create function private.plan_deadline(entitlement public.account_entitlements)
returns timestamptz language sql immutable set search_path = ''
as $deadline$
  select case when entitlement.plan = 'plus' then
    case entitlement.status
      when 'trialing' then entitlement.trial_ends_at
      when 'active' then entitlement.current_period_end
      when 'past_due' then entitlement.current_period_end
      when 'canceled' then entitlement.current_period_end
    end
  end;
$deadline$;

create function private.effective_plan(account_id uuid)
returns text language sql stable security definer set search_path = ''
as $effective$
  select case when exists (
    select 1 from public.account_entitlements e
    where e.owner_id = account_id and private.plan_deadline(e) > statement_timestamp()
  ) then 'plus' else 'free' end;
$effective$;
revoke all on function private.plan_deadline(public.account_entitlements),
  private.effective_plan(uuid) from public, anon, authenticated;

create function public.my_plan()
returns jsonb language sql stable security definer set search_path = ''
as $my_plan$
  select jsonb_build_object(
    'plan', private.effective_plan((select auth.uid())),
    'trial_ends_at', e.trial_ends_at,
    'days_left', case when e.status = 'trialing' and e.trial_ends_at > statement_timestamp()
      then ceil(extract(epoch from e.trial_ends_at - statement_timestamp()) / 86400)::int end,
    'access_ends_at', private.plan_deadline(e)
  )
  from (select auth.uid() as id) caller
  left join public.account_entitlements e on e.owner_id = caller.id;
$my_plan$;
revoke all on function public.my_plan() from public, anon;
grant execute on function public.my_plan() to authenticated;

-- An archive surviving erasure is billed to its oldest remaining member.
create function private.billing_owner(archive public.archives)
returns uuid language sql stable security definer set search_path = ''
as $billing$
  select coalesce(archive.created_by, (
    select m.user_id from public.archive_members m where m.archive_id = archive.id
    order by m.created_at, m.user_id limit 1
  ));
$billing$;

create index archives_created_by_idx on public.archives(created_by, created_at, id);

create function private.free_writable_group(account_id uuid)
returns uuid language sql stable security definer set search_path = ''
as $group$
  select a.id from public.archives a
  where (a.created_by = account_id or
    (a.created_by is null and private.billing_owner(a) = account_id))
    and a.kind = 'notes' and (
      select count(*) from public.archive_members m where m.archive_id = a.id
    ) = 2
  order by a.created_at, a.id limit 1;
$group$;

create function private.archive_plan_writable(target_archive_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $writable$
  select coalesce((
    select private.effective_plan(private.billing_owner(a)) = 'plus'
      or (a.kind = 'notes' and (
        (select count(*) from public.archive_members m where m.archive_id = a.id) <= 1
        or a.id = private.free_writable_group(private.billing_owner(a))
      ))
    from public.archives a where a.id = target_archive_id
  ), false);
$writable$;

revoke all on function private.billing_owner(public.archives), private.free_writable_group(uuid),
  private.archive_plan_writable(uuid) from public, anon, authenticated;
grant execute on function private.archive_plan_writable(uuid) to authenticated;

create or replace function private.can_write_archive(target_archive_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $writer$
  select private.is_archive_member(target_archive_id)
    and private.archive_plan_writable(target_archive_id)
    and exists (select 1 from public.archive_members
      where archive_id = target_archive_id and user_id = (select auth.uid()) and role = 'editor');
$writer$;

create function public.archive_plan(target_archive_id uuid)
returns jsonb language sql stable security definer set search_path = ''
as $plan$
  select jsonb_build_object(
    'plan', private.effective_plan(e.owner_id),
    'plan_writable', private.archive_plan_writable(a.id),
    'can_write', private.can_write_archive(a.id),
    'seat_limit', private.archive_seat_limit(a.id),
    'remaining_ms', case when private.effective_plan(e.owner_id) = 'plus'
      then floor(extract(epoch from private.plan_deadline(e) - statement_timestamp()) * 1000)::bigint end
  )
  from public.archives a
  left join public.account_entitlements e on e.owner_id = private.billing_owner(a)
  where a.id = target_archive_id and private.is_archive_member(a.id);
$plan$;
revoke all on function public.archive_plan(uuid) from public, anon;
grant execute on function public.archive_plan(uuid) to authenticated;

create or replace function private.archive_seat_limit(target_archive_id uuid)
returns smallint language sql stable security definer set search_path = ''
as $limit$
  select coalesce((
    select case when private.effective_plan(private.billing_owner(a)) = 'plus'
      then a.seat_limit else least(a.seat_limit, 2) end
    from public.archives a where a.id = target_archive_id
  ), 2::smallint);
$limit$;

-- Membership and invitation operations take the archive lock first, then
-- serialize across the billing account's other archives.
create function private.lock_group_capacity(target_archive_id uuid)
returns void language plpgsql security definer set search_path = ''
as $capacity$
declare owner_id uuid;
begin
  select private.billing_owner(a) into owner_id
    from public.archives a where a.id = target_archive_id for update;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 2));
end;
$capacity$;
revoke all on function private.lock_group_capacity(uuid) from public, anon, authenticated;

create function private.check_free_group_capacity(target_archive_id uuid)
returns void language plpgsql security definer set search_path = ''
as $group_check$
declare owner_id uuid; existing_group uuid;
begin
  select private.billing_owner(a) into owner_id from public.archives a where a.id = target_archive_id;
  if private.effective_plan(owner_id) = 'free' then
    existing_group := private.free_writable_group(owner_id);
    if existing_group is not null and existing_group <> target_archive_id then
      raise check_violation using message = 'Free includes one shared group';
    end if;
  end if;
end;
$group_check$;
revoke all on function private.check_free_group_capacity(uuid) from public, anon, authenticated;

create or replace function private.enforce_archive_seats()
returns trigger language plpgsql security definer set search_path = ''
as $seats$
declare seats integer;
begin
  perform private.lock_group_capacity(new.archive_id);
  if exists (select 1 from public.archive_members
    where archive_id = new.archive_id and user_id = new.user_id) then
    return new;
  end if;
  select count(*) into seats from public.archive_members where archive_id = new.archive_id;
  if seats >= private.archive_seat_limit(new.archive_id) then
    raise check_violation using message = 'This archive is full';
  end if;
  if seats > 0 then
    if not private.archive_plan_writable(new.archive_id) then
      raise check_violation using message = 'This archive is view only';
    end if;
    perform private.check_free_group_capacity(new.archive_id);
  end if;
  return new;
end;
$seats$;


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

  perform private.check_free_group_capacity(target_archive_id);
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

create or replace function private.create_archive(archive_name text)
returns uuid language plpgsql security definer set search_path = ''
as $safe_create_archive$
declare caller uuid := (select auth.uid()); result uuid; candidate uuid;
begin
  if caller is null then raise insufficient_privilege using message = 'Authentication required'; end if;
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

create or replace function private.archive_deletion_refusal(target_archive_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $refusal$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    return 'Authentication required';
  end if;
  if not exists (
    select 1 from public.archive_members
    where archive_id = target_archive_id and user_id = current_user_id
  ) then
    return 'You are not in this archive';
  end if;
  if exists (
    select 1 from public.archive_members
    where archive_id = target_archive_id and user_id <> current_user_id
  ) and not exists (
    select 1 from public.archives
    where id = target_archive_id and created_by = current_user_id
  ) then
    return 'Only whoever made this archive can delete it while others are in it';
  end if;
  if not exists (
    select 1 from public.archive_members
    where user_id = current_user_id and archive_id <> target_archive_id
  ) then
    return 'This is your only archive';
  end if;
  if not private.archive_plan_writable(target_archive_id) then
    return 'This archive is view only';
  end if;
  return null;
end;
$refusal$;

create function private.guard_document_kind()
returns trigger language plpgsql security definer set search_path = ''
as $kind$
begin
  if auth.uid() is not null and new.kind = 'document'
    and private.effective_plan(private.billing_owner(new)) <> 'plus' then
    raise check_violation using message = 'Books and theses require Plus';
  end if;
  return new;
end;
$kind$;
revoke all on function private.guard_document_kind() from public, anon, authenticated;
create trigger guard_document_kind before insert or update of kind on public.archives
for each row execute function private.guard_document_kind();

-- History stays stored. Reads (including content by id) follow the owner's plan.
create function private.archive_has_plus(target_archive_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $plus$
  select exists (select 1 from public.archives a where a.id = target_archive_id
    and private.is_archive_member(a.id)
    and private.effective_plan(private.billing_owner(a)) = 'plus');
$plus$;
revoke all on function private.archive_has_plus(uuid) from public, anon, authenticated;
grant execute on function private.archive_has_plus(uuid) to authenticated;

create policy plan_history_select on public.note_versions as restrictive for select to authenticated
using (created_at >= statement_timestamp() - interval '720 hours'
       or (select private.archive_has_plus(archive_id)));
create policy plan_named_history_insert on public.note_versions as restrictive for insert to authenticated
with check ((select private.archive_has_plus(archive_id)));

-- Free members can still restore a recent version. The backup has no
-- user-defined label on Free and belongs to a visible, writable note.
create function public.save_restore_checkpoint(target_note_id uuid, snapshot_title text, snapshot_content jsonb, snapshot_label text)
returns public.note_versions language plpgsql security definer set search_path = ''
as $checkpoint$
declare target_archive_id uuid; checkpoint public.note_versions;
begin
  select n.archive_id into target_archive_id from public.notes n
  where n.id = target_note_id and n.trashed_at is null
    and (n.locked_by is null or n.locked_by = (select auth.uid()))
    and private.safety_note_visible(n.id)
    and private.people_not_blocked(n.owner_id)
    and private.archived_note_visible(n.owner_id, n.archived_at);
  if not private.can_write_archive(target_archive_id) then
    raise insufficient_privilege using message = 'This note is view only';
  end if;
  insert into public.note_versions(archive_id, note_id, author_ids, title, content, label)
  values (target_archive_id, target_note_id, array[(select auth.uid())], snapshot_title, snapshot_content,
    case when private.archive_has_plus(target_archive_id) then snapshot_label end)
  returning * into checkpoint;
  return checkpoint;
end;
$checkpoint$;
revoke all on function public.save_restore_checkpoint(uuid, text, jsonb, text) from public, anon;
grant execute on function public.save_restore_checkpoint(uuid, text, jsonb, text) to authenticated;

-- These existing author/owner delete policies intentionally allow viewers
-- to delete their own material in otherwise writable archives.
create policy plan_chat_reaction_delete on public.archive_message_reactions
as restrictive for delete to authenticated
using ((select private.archive_plan_writable(archive_id)));
create policy plan_comment_reaction_delete on public.note_comment_reactions
as restrictive for delete to authenticated
using ((select private.archive_plan_writable(archive_id)));
create policy plan_sticker_delete on public.archive_stickers
as restrictive for delete to authenticated
using ((select private.archive_plan_writable(archive_id)));

create policy plan_media_delete on storage.objects as restrictive for delete to authenticated
using (bucket_id not in ('note-images', 'chat-media')
       or (select private.archive_plan_writable(private.storage_archive_id(name))));

-- Storage fills metadata.size with the uploaded byte count when it finalizes
-- an object. A permission probe can omit metadata and is checked again on
-- finalization. Trusted Storage uploads go through the same quota trigger.
create function private.enforce_archive_storage_quota()
returns trigger language plpgsql security definer set search_path = ''
as $quota$
declare
  target_id uuid := private.storage_archive_id(new.name);
  billing_account uuid;
  byte_count bigint := (new.metadata->>'size')::bigint;
  used numeric;
  allowance bigint;
begin
  if new.bucket_id not in ('note-images', 'chat-media') then return new; end if;
  if not private.archive_plan_writable(target_id) then
    raise check_violation using message = 'This archive is view only';
  end if;
  if byte_count is null then return new; end if;

  select private.billing_owner(a) into billing_account from public.archives a where a.id = target_id;
  perform pg_advisory_xact_lock(hashtextextended(billing_account::text, 3));
  allowance := case when private.effective_plan(billing_account) = 'plus'
    then 20000000000 else 1000000000 end;

  select coalesce(sum((o.metadata->>'size')::bigint), 0) into used
  from public.archives a
  join storage.objects o on o.name collate "C" like a.id::text || '/%'
  where (a.created_by = billing_account or (a.created_by is null and private.billing_owner(a) = billing_account))
    and o.bucket_id in ('note-images', 'chat-media')
    and (o.bucket_id, o.name) <> (new.bucket_id, new.name)
    and (tg_op = 'INSERT' or o.id <> new.id);

  if used + byte_count > allowance then
    raise sqlstate 'PT413' using message = 'This account has reached its storage limit';
  end if;
  return new;
end;
$quota$;
revoke all on function private.enforce_archive_storage_quota() from public, anon, authenticated;
create trigger enforce_archive_storage_quota before insert or update of metadata, bucket_id, name on storage.objects
for each row execute function private.enforce_archive_storage_quota();
