-- Private collaboration still needs reporting, direct-contact blocking and
-- an operator's way to filter confirmed abusive content from every client.
create table public.user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  blocked_name text not null default '',
  created_at timestamptz not null default now(),
  primary key(blocker_id, blocked_id),
  check(blocker_id <> blocked_id)
);
alter table public.user_blocks enable row level security;
revoke all on public.user_blocks from public, anon, authenticated;
grant select on public.user_blocks to authenticated;
grant all on public.user_blocks to service_role;
create policy own_block_list on public.user_blocks for select to authenticated
  using(blocker_id = (select auth.uid()));
create trigger guard_erased_account_writes before insert or update on public.user_blocks
for each row execute function private.guard_erased_account_writes();

create table private.safety_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_user_id uuid references auth.users(id) on delete cascade,
  note_id uuid references public.notes(id) on delete cascade,
  comment_id uuid references public.note_comments(id) on delete cascade,
  reason text not null check(reason in ('harassment','sexual_content','hate','violence','illegal','spam','other')),
  details text not null default '' check(char_length(details) <= 2000),
  snapshot jsonb not null,
  status text not null default 'pending' check(status in ('pending','dismissed','hidden')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  check(note_id is not null or target_user_id is not null)
);
create index safety_reports_reporter_time on private.safety_reports(reporter_id,created_at);
create index safety_reports_pending on private.safety_reports(created_at) where status = 'pending';
create table private.hidden_safety_notes (
  note_id uuid primary key references public.notes(id) on delete cascade,
  report_id uuid references private.safety_reports(id) on delete set null,
  created_at timestamptz not null default now()
);
revoke all on private.safety_reports, private.hidden_safety_notes from public, anon, authenticated;

create function private.people_not_blocked(target_user_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $people_not_blocked$
  select target_user_id is null or not exists (
    select 1 from public.user_blocks b
      where (b.blocker_id = (select auth.uid()) and b.blocked_id = target_user_id)
        or (b.blocked_id = (select auth.uid()) and b.blocker_id = target_user_id)
  );
$people_not_blocked$;

create function private.safety_note_visible(target_note_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $safety_note_visible$
  select not exists (select 1 from private.hidden_safety_notes where note_id = target_note_id)
    and not exists (select 1 from private.safety_reports
      where reporter_id = (select auth.uid()) and note_id = target_note_id and status = 'pending');
$safety_note_visible$;

create policy notes_safety_filter on public.notes as restrictive for all to authenticated
  using(private.people_not_blocked(owner_id) and private.safety_note_visible(id))
  with check(private.people_not_blocked(owner_id) and private.safety_note_visible(id));
create policy comments_safety_filter on public.note_comments as restrictive for all to authenticated
  using(private.people_not_blocked(author_id) and exists(select 1 from public.notes n where n.id = note_id))
  with check(private.people_not_blocked(author_id) and exists(select 1 from public.notes n where n.id = note_id));

-- Direct authenticated file downloads must follow the same content filter.
-- Invoker rights are deliberate: the notes/version subqueries keep their RLS.
create function private.safety_file_visible(bucket text, object_name text, owner_text text)
returns boolean language sql stable security invoker set search_path = ''
as $safety_file_visible$
  select case
    when bucket = 'avatars' then private.people_not_blocked(private.storage_user_id(object_name))
    when bucket = 'note-images' then owner_text = (select auth.uid())::text
      or exists (select 1 from public.notes n where n.archive_id::text = split_part(object_name,'/',1)
        and position(split_part(object_name,'/',2) in to_jsonb(n)::text) > 0)
      or exists (select 1 from public.note_versions v where v.archive_id::text = split_part(object_name,'/',1)
        and position(split_part(object_name,'/',2) in v.content::text) > 0)
      or exists (select 1 from public.profile_preferences p where p.user_id = (select auth.uid())
        and position(split_part(object_name,'/',2) in p.preferences::text) > 0)
    else false end;
$safety_file_visible$;
revoke all on function private.safety_file_visible(text,text,text) from public, anon;
grant execute on function private.safety_file_visible(text,text,text) to authenticated;
create policy storage_safety_filter on storage.objects as restrictive for select to authenticated
  using(private.safety_file_visible(bucket_id,name,coalesce(owner_id,owner::text)));

-- A note's author cannot be rewritten to bypass a block. Other members may
-- continue editing its text; only its attribution is fixed for client writes.
create function private.keep_note_author()
returns trigger language plpgsql set search_path = ''
as $keep_note_author$
begin
  if (select auth.role()) = 'authenticated' then
    if tg_op = 'INSERT' then new.owner_id := (select auth.uid());
    else new.owner_id := old.owner_id;
    end if;
  end if;
  return new;
end;
$keep_note_author$;
create trigger keep_note_author before insert or update on public.notes
for each row execute function private.keep_note_author();

create function public.block_user(target_user_id uuid)
returns void language plpgsql security definer set search_path = ''
as $block_user$
declare caller uuid := (select auth.uid());
begin
  if caller is null or caller = target_user_id or not exists (
    select 1 from public.archive_members mine join public.archive_members theirs using(archive_id)
      where mine.user_id = caller and theirs.user_id = target_user_id
  ) then raise insufficient_privilege using message = 'Choose someone in your shared archives'; end if;
  insert into public.user_blocks(blocker_id,blocked_id,blocked_name)
    values(caller,target_user_id,coalesce((select nickname from public.profiles where user_id = target_user_id),'Member'))
    on conflict do nothing;
end;
$block_user$;

create function public.unblock_user(target_user_id uuid)
returns void language sql security definer set search_path = ''
as $unblock_user$
  delete from public.user_blocks where blocker_id = (select auth.uid()) and blocked_id = target_user_id;
$unblock_user$;

-- Invites cannot reintroduce direct contact with a blocked account, even
-- when sent or claimed using an older app version.
create function private.check_blocked_membership()
returns trigger language plpgsql security definer set search_path = ''
as $blocked_membership$
begin
  if exists (select 1 from public.archive_members m join public.user_blocks b
    on (b.blocker_id = new.user_id and b.blocked_id = m.user_id)
      or (b.blocked_id = new.user_id and b.blocker_id = m.user_id)
    where m.archive_id = new.archive_id) then
    raise check_violation using message = 'This invitation conflicts with a blocked account';
  end if;
  return new;
end;
$blocked_membership$;
create trigger check_blocked_membership before insert on public.archive_members
for each row execute function private.check_blocked_membership();

create function private.check_blocked_invitation()
returns trigger language plpgsql security definer set search_path = ''
as $blocked_invitation$
begin
  if exists (select 1 from auth.users invited join public.user_blocks b
    on b.blocker_id = invited.id or b.blocked_id = invited.id
    join public.archive_members m on m.archive_id = new.archive_id
    where lower(invited.email) = lower(new.email)
      and ((b.blocker_id = invited.id and b.blocked_id = m.user_id)
        or (b.blocked_id = invited.id and b.blocker_id = m.user_id))) then
    raise check_violation using message = 'Invitations to blocked accounts are not allowed';
  end if;
  return new;
end;
$blocked_invitation$;
create trigger check_blocked_invitation before insert on public.archive_invites
for each row execute function private.check_blocked_invitation();

create function private.check_blocked_mentions()
returns trigger language plpgsql security definer set search_path = ''
as $blocked_mentions$
begin
  if exists (select 1 from unnest(new.mentions) mentioned(user_id) join public.user_blocks b
    on (b.blocker_id = new.author_id and b.blocked_id = mentioned.user_id)
      or (b.blocked_id = new.author_id and b.blocker_id = mentioned.user_id)) then
    raise check_violation using message = 'You cannot mention a blocked account';
  end if;
  return new;
end;
$blocked_mentions$;
create trigger check_blocked_mentions before insert or update on public.note_comments
for each row execute function private.check_blocked_mentions();

create function public.report_safety_issue(reason_code text, target_note_id uuid default null,
  target_user_id uuid default null, target_comment_id uuid default null, report_details text default '')
returns uuid language plpgsql security definer set search_path = ''
as $report_safety$
declare
  caller uuid := (select auth.uid());
  target_note public.notes%rowtype;
  target_comment public.note_comments%rowtype;
  report_id uuid;
  captured jsonb := '{}'::jsonb;
  reported_user uuid := target_user_id;
begin
  if caller is null or not exists(select 1 from auth.users where id = caller)
    or exists(select 1 from private.account_erasure_jobs where user_id = caller) then
    raise insufficient_privilege using message = 'Sign in again';
  end if;
  if reason_code not in ('harassment','sexual_content','hate','violence','illegal','spam','other')
    or char_length(coalesce(report_details,'')) > 2000 then
    raise check_violation using message = 'Choose a reason and use up to 2000 characters';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('report:' || caller::text, 0));
  if target_note_id is not null then
    select * into target_note from public.notes where id = target_note_id;
    if not found or not private.is_archive_member(target_note.archive_id)
      or not private.archived_note_visible(target_note.owner_id, target_note.archived_at)
      or not private.people_not_blocked(target_note.owner_id) then
      raise insufficient_privilege using message = 'This note is not available to report';
    end if;
    captured := jsonb_build_object('note',to_jsonb(target_note));
    reported_user := target_note.owner_id;
  end if;
  if target_comment_id is not null then
    select * into target_comment from public.note_comments where id = target_comment_id and note_id = target_note_id;
    if not found or not private.people_not_blocked(target_comment.author_id) then
      raise insufficient_privilege using message = 'This comment is not available to report';
    end if;
    captured := captured || jsonb_build_object('comment',to_jsonb(target_comment));
    reported_user := target_comment.author_id;
  end if;
  if target_note_id is null and not exists (
    select 1 from public.archive_members mine join public.archive_members theirs using(archive_id)
      where mine.user_id = caller and theirs.user_id = reported_user
  ) then raise insufficient_privilege using message = 'Choose a note or a member of your archive'; end if;
  if reported_user = caller then raise check_violation using message = 'You cannot report your own content'; end if;
  select r.id into report_id from private.safety_reports r where r.reporter_id = caller
    and r.note_id is not distinct from target_note_id and r.target_user_id is not distinct from reported_user
    and r.comment_id is not distinct from target_comment_id and r.reason = reason_code and r.status = 'pending'
    order by r.created_at limit 1;
  if report_id is not null then return report_id; end if;
  if (select count(*) from private.safety_reports where reporter_id = caller and created_at > now() - interval '1 hour') >= 10 then
    raise check_violation using message = 'Too many reports. Contact support for urgent concerns';
  end if;
  insert into private.safety_reports(reporter_id,target_user_id,note_id,comment_id,reason,details,snapshot)
    values(caller,reported_user,target_note_id,target_comment_id,reason_code,coalesce(report_details,''),captured)
    returning id into report_id;
  return report_id;
end;
$report_safety$;

create function public.review_safety_report(target_report_id uuid, hide_content boolean)
returns void language plpgsql security definer set search_path = ''
as $review_safety$
declare target_note_id uuid;
begin
  select note_id into target_note_id from private.safety_reports where id = target_report_id for update;
  if not found then raise exception 'Report not found'; end if;
  if hide_content and target_note_id is not null then
    insert into private.hidden_safety_notes(note_id,report_id) values(target_note_id,target_report_id) on conflict do nothing;
  end if;
  update private.safety_reports set status = case when hide_content then 'hidden' else 'dismissed' end,
    reviewed_at = now() where id = target_report_id;
end;
$review_safety$;

revoke all on function private.people_not_blocked(uuid), private.safety_note_visible(uuid) from public, anon;
grant execute on function private.people_not_blocked(uuid), private.safety_note_visible(uuid) to authenticated;
revoke all on function public.block_user(uuid), public.unblock_user(uuid),
  public.report_safety_issue(text,uuid,uuid,uuid,text) from public, anon;
grant execute on function public.block_user(uuid), public.unblock_user(uuid),
  public.report_safety_issue(text,uuid,uuid,uuid,text) to authenticated;
revoke all on function public.review_safety_report(uuid,boolean) from public, anon, authenticated;
grant execute on function public.review_safety_report(uuid,boolean) to service_role;
revoke all on function private.keep_note_author(), private.check_blocked_membership(),
  private.check_blocked_invitation(), private.check_blocked_mentions() from public, anon, authenticated;

-- Preserve automatic sharing for compatible people; a block must not make
-- creating a new archive fail by silently trying to seat the blocked person.
create or replace function private.create_archive(archive_name text)
returns uuid language plpgsql security definer set search_path = ''
as $safe_create_archive$
declare caller uuid := (select auth.uid()); result uuid; candidate uuid;
begin
  if caller is null then raise insufficient_privilege using message = 'Authentication required'; end if;
  if btrim(coalesce(archive_name,'')) = '' or char_length(btrim(archive_name)) > 80 then
    raise check_violation using message = 'An archive needs a name of up to 80 characters';
  end if;
  if (select count(*) from public.archive_members where user_id = caller) >= 20 then
    raise check_violation using message = 'You already belong to twenty archives';
  end if;
  insert into public.archives(name,settings) values(btrim(archive_name),'{}') returning id into result;
  insert into public.archive_members(archive_id,user_id) values(result,caller);
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

create function public.pending_safety_reports()
returns table(id uuid, reason text, created_at timestamptz, note_id uuid, target_user_id uuid)
language sql security definer set search_path = ''
as $pending_reports$
  select r.id,r.reason,r.created_at,r.note_id,r.target_user_id from private.safety_reports r
    where r.status = 'pending' order by r.created_at limit 100;
$pending_reports$;
create function public.safety_report_detail(target_report_id uuid)
returns jsonb language sql security definer set search_path = ''
as $report_detail$
  select jsonb_build_object('reason',r.reason,'details',r.details,'snapshot',r.snapshot)
    from private.safety_reports r where r.id = target_report_id;
$report_detail$;
revoke all on function public.pending_safety_reports(), public.safety_report_detail(uuid) from public, anon, authenticated;
grant execute on function public.pending_safety_reports(), public.safety_report_detail(uuid) to service_role;
