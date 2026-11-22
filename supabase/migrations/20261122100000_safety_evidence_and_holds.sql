-- Keep the account IDs as restricted tombstones for the retention period.
alter table private.safety_reports
  drop constraint safety_reports_reporter_id_fkey,
  drop constraint safety_reports_target_user_id_fkey,
  drop constraint safety_reports_reason_check,
  alter column reporter_id drop not null,
  add column sticker_id uuid references public.archive_stickers(id) on delete set null,
  add column legal_hold boolean not null default false,
  add constraint safety_reports_reason_check check (reason in
    ('harassment','sexual_content','hate','violence','illegal','spam','other','child_safety'));

create table private.account_legal_holds (
  user_id uuid primary key references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
create table private.safety_retention (
  singleton boolean primary key default true check (singleton),
  child_safety_days integer not null default 365 check (child_safety_days > 0),
  other_report_days integer not null default 90 check (other_report_days > 0)
);
insert into private.safety_retention default values;

insert into storage.buckets(id, name, public)
values ('safety-evidence', 'safety-evidence', false);

create table private.safety_evidence_objects (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references private.safety_reports(id) on delete restrict,
  source_bucket text not null,
  source_name text not null,
  source_owner uuid,
  copied_at timestamptz,
  retry_after timestamptz not null default now(),
  quarantine boolean not null default false,
  unique (report_id, source_bucket, source_name)
);
create index safety_evidence_source on private.safety_evidence_objects(source_bucket, source_name);

revoke all on private.account_legal_holds, private.safety_retention,
  private.safety_evidence_objects from public, anon, authenticated;

-- Even if ordinary Storage policies become more permissive, the evidence
-- bucket stays exclusive to the worker and operators with service credentials.
create policy safety_evidence_private on storage.objects as restrictive for all to anon, authenticated
using (bucket_id <> 'safety-evidence') with check (bucket_id <> 'safety-evidence');

create function private.capture_report_files(report private.safety_reports)
returns void language sql security definer set search_path = ''
as $evidence$
  insert into private.safety_evidence_objects(report_id, source_bucket, source_name, source_owner)
  select report.id, o.bucket_id, o.name, coalesce(o.owner, o.owner_id::uuid)
  from storage.objects o
  where (o.bucket_id = 'note-images' and report.comment_id is null and report.message_id is null
    and o.name like (report.snapshot #>> '{note,archive_id}') || '/%'
    and position(split_part(o.name, '/', 2) in (report.snapshot->'note')::text) > 0)
    or (o.bucket_id = 'chat-media' and (
      o.name = report.snapshot #>> '{sticker,path}'
      or o.name = report.snapshot #>> '{message,sticker,path}'
      or exists (
        select 1 from jsonb_array_elements(coalesce(report.snapshot #> '{message,attachments}',
          report.snapshot #> '{comment,attachments}', '[]'::jsonb)) item where item->>'path' = o.name
      )))
    or (o.bucket_id = 'avatars' and o.name = report.snapshot #>> '{profile,avatar_path}')
  for share of o
  on conflict do nothing;
$evidence$;

create function private.preserve_reported_files()
returns trigger language plpgsql security definer set search_path = ''
as $evidence$
begin
  perform private.capture_report_files(new);
  return new;
end;
$evidence$;
revoke all on function private.preserve_reported_files(), private.capture_report_files(private.safety_reports) from public, anon, authenticated;
create trigger preserve_reported_files after insert on private.safety_reports
for each row execute function private.preserve_reported_files();

select private.capture_report_files(r) from private.safety_reports r;

create function private.guard_held_storage()
returns trigger language plpgsql security definer set search_path = ''
as $held$
begin
  if tg_op = 'UPDATE' and (new.bucket_id, new.name, new.version, new.metadata)
      is not distinct from (old.bucket_id, old.name, old.version, old.metadata) then return new; end if;
  if exists (
      select 1 from private.safety_evidence_objects e join private.safety_reports r on r.id = e.report_id
      where (e.source_bucket = old.bucket_id and e.source_name = old.name
        and (e.copied_at is null or (r.legal_hold and not e.quarantine)))
      or (old.bucket_id = 'safety-evidence' and old.name = e.id::text and r.legal_hold)
    ) or exists (select 1 from private.account_legal_holds h
      where (h.user_id = old.owner or h.user_id::text = old.owner_id)
      and not exists (select 1 from private.safety_evidence_objects e
        where e.source_bucket = old.bucket_id and e.source_name = old.name
          and e.quarantine and e.copied_at is not null))
  then
    raise sqlstate 'PT423' using message = 'This file must be preserved';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$held$;
create trigger guard_held_storage before update or delete on storage.objects
for each row execute function private.guard_held_storage();
revoke all on function private.guard_held_storage() from public, anon, authenticated;

create function private.guard_held_content()
returns trigger language plpgsql security definer set search_path = ''
as $held$
begin
  if exists (select 1 from private.safety_reports r where r.legal_hold and (
    (tg_table_name = 'notes' and r.note_id = old.id and r.comment_id is null)
    or (tg_table_name = 'note_comments' and r.comment_id = old.id)
    or (tg_table_name = 'archive_messages' and r.message_id = old.id)
    or (tg_table_name = 'archive_stickers' and r.sticker_id = old.id)
  )) then
    raise sqlstate 'PT423' using message = 'This content must be preserved';
  end if;
  return old;
end;
$held$;
revoke all on function private.guard_held_content() from public, anon, authenticated;
create trigger guard_held_notes before delete on public.notes
for each row execute function private.guard_held_content();
create trigger guard_held_comments before delete on public.note_comments
for each row execute function private.guard_held_content();
create trigger guard_held_messages before delete on public.archive_messages
for each row execute function private.guard_held_content();
create trigger guard_held_stickers before delete on public.archive_stickers
for each row execute function private.guard_held_content();

create function public.account_erasure_held(target_user_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $held$
  select exists (select 1 from private.account_legal_holds where user_id = target_user_id)
    or exists (select 1 from private.safety_reports where target_user_id = account_erasure_held.target_user_id and legal_hold)
    or exists (select 1 from private.safety_evidence_objects e join private.safety_reports r on r.id = e.report_id
      where (e.source_owner = account_erasure_held.target_user_id or r.target_user_id = account_erasure_held.target_user_id)
        and (e.copied_at is null or (r.legal_hold and not e.quarantine)));
$held$;
-- Enforce at both entry points, including a direct Auth Admin deletion.
create function private.guard_held_account()
returns trigger language plpgsql security definer set search_path = ''
as $held$
begin
  if public.account_erasure_held(old.id) then
    raise sqlstate 'PT423' using message = 'Account erasure is on hold';
  end if;
  return old;
end;
$held$;
create trigger guard_held_account before delete on auth.users
for each row execute function private.guard_held_account();

alter function public.begin_account_erasure(uuid,uuid) set schema private;
revoke all on function private.begin_account_erasure(uuid,uuid) from service_role;
create function public.begin_account_erasure(target_user_id uuid, request_token uuid)
returns uuid language plpgsql security definer set search_path = ''
as $held$
begin
  perform pg_advisory_xact_lock(hashtextextended(target_user_id::text, 0));
  if public.account_erasure_held(target_user_id) then
    raise sqlstate 'PT423' using message = 'Account erasure is on hold';
  end if;
  return private.begin_account_erasure(target_user_id, request_token);
end;
$held$;
revoke all on function public.account_erasure_held(uuid), private.guard_held_account(),
  public.begin_account_erasure(uuid,uuid) from public, anon, authenticated;
grant execute on function public.account_erasure_held(uuid), public.begin_account_erasure(uuid,uuid) to service_role;

create or replace function private.purge_reviewed_safety_reports()
returns void language sql security definer set search_path = ''
as $purge$
  delete from private.safety_reports r using private.safety_retention settings
  where not r.legal_hold
    and r.reviewed_at < now() - make_interval(days => case when r.reason = 'child_safety'
      then settings.child_safety_days else settings.other_report_days end)
    and not exists (select 1 from private.safety_evidence_objects e where e.report_id = r.id);
$purge$;

create table private.hidden_safety_comments (
  comment_id uuid primary key references public.note_comments(id) on delete cascade
);
create table private.hidden_safety_stickers (
  sticker_id uuid primary key references public.archive_stickers(id) on delete cascade
);
revoke all on private.hidden_safety_comments, private.hidden_safety_stickers from public, anon, authenticated;

create or replace function private.safety_note_visible(target_note_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $safety_note_visible$
  select not exists (select 1 from private.hidden_safety_notes where note_id = target_note_id)
    and not exists (select 1 from private.safety_reports
      where reporter_id = (select auth.uid()) and note_id = target_note_id
        and comment_id is null and not (snapshot ? 'comment') and status = 'pending');
$safety_note_visible$;

create function private.safety_comment_visible(target_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $visible$
  select not exists (select 1 from private.hidden_safety_comments where comment_id = target_id);
$visible$;
create function private.safety_sticker_visible(target_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $visible$
  select not exists (select 1 from private.hidden_safety_stickers where sticker_id = target_id);
$visible$;
revoke all on function private.safety_comment_visible(uuid), private.safety_sticker_visible(uuid) from public, anon;
grant execute on function private.safety_comment_visible(uuid), private.safety_sticker_visible(uuid) to authenticated;

create policy comments_moderation_filter on public.note_comments as restrictive for all to authenticated
using (private.safety_comment_visible(id)) with check (private.safety_comment_visible(id));
create policy stickers_moderation_filter on public.archive_stickers as restrictive for all to authenticated
using (private.safety_sticker_visible(id)) with check (private.safety_sticker_visible(id));
create policy chat_moderated_media on storage.objects as restrictive for select to authenticated
using (bucket_id <> 'chat-media' or (
  private.safety_message_visible(private.chat_media_message_id(name))
  and private.safety_comment_visible(private.chat_media_message_id(name))
  and private.safety_sticker_visible(private.chat_media_message_id(name))
));

create or replace function public.review_safety_report(target_report_id uuid, hide_content boolean)
returns void language plpgsql security definer set search_path = ''
as $review$
declare report private.safety_reports%rowtype;
begin
  select * into report from private.safety_reports where id = target_report_id for update;
  if not found then raise exception 'Report not found'; end if;
  if hide_content then
    if report.comment_id is not null then
      insert into private.hidden_safety_comments values (report.comment_id) on conflict do nothing;
    elsif report.message_id is not null then
      insert into private.hidden_safety_messages(message_id,report_id)
      values (report.message_id,target_report_id) on conflict do nothing;
    elsif report.sticker_id is not null then
      insert into private.hidden_safety_stickers values (report.sticker_id) on conflict do nothing;
    elsif report.note_id is not null and not (report.snapshot ? 'comment') then
      insert into private.hidden_safety_notes(note_id,report_id)
      values (report.note_id,target_report_id) on conflict do nothing;
    end if;
  end if;
  update private.safety_reports set status = case when hide_content then 'hidden' else 'dismissed' end,
    reviewed_at = now() where id = target_report_id;
end;
$review$;

create or replace function public.pending_safety_reports()
returns table(id uuid, reason text, created_at timestamptz, note_id uuid, target_user_id uuid)
language sql security definer set search_path = ''
as $pending$
  select r.id,r.reason,r.created_at,r.note_id,r.target_user_id from private.safety_reports r
  where r.status = 'pending' order by (r.reason = 'child_safety') desc, r.created_at limit 100;
$pending$;

create or replace function public.safety_report_detail(target_report_id uuid)
returns jsonb language sql security definer set search_path = ''
as $detail$
  select jsonb_build_object('reason',r.reason,'details',r.details,'snapshot',r.snapshot,'legal_hold',r.legal_hold,
    'evidence', coalesce((select jsonb_agg(jsonb_build_object('path', e.id,
      'source_bucket', e.source_bucket, 'source_name', e.source_name, 'copied_at', e.copied_at))
      from private.safety_evidence_objects e where e.report_id = r.id), '[]'::jsonb))
  from private.safety_reports r where r.id = target_report_id;
$detail$;

drop function public.report_safety_issue(text,uuid,uuid,uuid,text,uuid);
create function public.report_safety_issue(reason_code text, target_note_id uuid default null,
  target_user_id uuid default null, target_comment_id uuid default null,
  report_details text default '', target_message_id uuid default null, target_sticker_id uuid default null)
returns uuid language plpgsql security definer set search_path = ''
as $report_safety$
declare
  caller uuid := (select auth.uid());
  target_note public.notes%rowtype;
  target_comment public.note_comments%rowtype;
  target_message public.archive_messages%rowtype;
  target_sticker public.archive_stickers%rowtype;
  report_id uuid;
  captured jsonb := '{}'::jsonb;
  reported_user uuid := target_user_id;
begin
  if not private.account_write_allowed() then
    raise insufficient_privilege using message = 'Sign in again';
  end if;
  if reason_code = 'spam' and not private.account_can_share() then
    raise insufficient_privilege using message = 'A confirmed email is required to report spam';
  end if;
  if reason_code not in ('harassment','sexual_content','hate','violence','illegal','spam','other','child_safety')
    or char_length(coalesce(report_details,'')) > 2000 then
    raise check_violation using message = 'Choose a reason and use up to 2000 characters';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('report:' || caller::text, 0));
  if num_nonnulls(target_note_id, target_message_id, target_sticker_id) > 1
    or (target_comment_id is not null and target_note_id is null) then
    raise check_violation using message = 'Choose one item to report';
  end if;
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
    if not found or not private.safety_comment_visible(target_comment.id)
      or not private.people_not_blocked(target_comment.author_id) then
      raise insufficient_privilege using message = 'This comment is not available to report';
    end if;
    captured := jsonb_build_object('comment',to_jsonb(target_comment));
    reported_user := target_comment.author_id;
  end if;
  if target_message_id is not null then
    select * into target_message from public.archive_messages where id = target_message_id;
    if not found or not private.is_archive_member(target_message.archive_id)
      or not private.people_not_blocked(target_message.author_id) then
      raise insufficient_privilege using message = 'This message is not available to report';
    end if;
    captured := captured || jsonb_build_object('message',to_jsonb(target_message));
    reported_user := target_message.author_id;
  end if;
  if target_sticker_id is not null then
    if num_nonnulls(target_note_id, target_comment_id, target_message_id, target_user_id) <> 0 then
      raise check_violation using message = 'Choose one item to report';
    end if;
    select * into target_sticker from public.archive_stickers where id = target_sticker_id;
    if not found or not private.safety_sticker_visible(target_sticker.id)
      or not private.is_archive_member(target_sticker.archive_id)
      or not private.people_not_blocked(target_sticker.owner_id) then
      raise insufficient_privilege using message = 'This sticker is not available to report';
    end if;
    captured := jsonb_build_object('sticker',to_jsonb(target_sticker));
    reported_user := target_sticker.owner_id;
  end if;
  if num_nonnulls(target_note_id, target_message_id, target_sticker_id) = 0 and not exists (
    select 1 from public.archive_members mine join public.archive_members theirs using(archive_id)
      where mine.user_id = caller and theirs.user_id = reported_user
  ) then raise insufficient_privilege using message = 'Choose a note or a member of your archive'; end if;
  if captured = '{}'::jsonb then
    select jsonb_build_object('profile', jsonb_build_object('avatar_path',
      p.user_id::text || '/' || p.avatar_object::text, 'nickname', p.nickname))
      into captured from public.profiles p where p.user_id = reported_user;
    captured := coalesce(captured, '{}'::jsonb);
  end if;
  if reported_user = caller then raise check_violation using message = 'You cannot report your own content'; end if;
  select r.id into report_id from private.safety_reports r where r.reporter_id = caller
    and r.note_id is not distinct from target_note_id and r.target_user_id is not distinct from reported_user
    and r.comment_id is not distinct from target_comment_id
    and r.message_id is not distinct from target_message_id
    and r.sticker_id is not distinct from target_sticker_id
    and r.reason = reason_code and r.status = 'pending'
    order by r.created_at limit 1;
  if report_id is not null then return report_id; end if;
  if (select count(*) from private.safety_reports where reporter_id = caller and created_at > now() - interval '1 hour') >= 10 then
    raise check_violation using message = 'Too many reports. Contact support for urgent concerns';
  end if;
  insert into private.safety_reports(reporter_id,target_user_id,note_id,comment_id,message_id,sticker_id,reason,details,snapshot)
    values(caller,reported_user,target_note_id,target_comment_id,target_message_id,target_sticker_id,reason_code,coalesce(report_details,''),captured)
    returning id into report_id;
  return report_id;
end;
$report_safety$;
revoke all on function public.report_safety_issue(text,uuid,uuid,uuid,text,uuid,uuid) from public, anon;
grant execute on function public.report_safety_issue(text,uuid,uuid,uuid,text,uuid,uuid) to authenticated;
