-- Keep the existing billing-account cap for archive uploads, count avatars
-- against the uploader's plan, and enforce an archive's own cap separately.
create or replace function private.enforce_archive_storage_quota()
returns trigger language plpgsql security definer set search_path = ''
as $quota$
declare
  archive uuid := private.storage_archive_id(new.name);
  uploader uuid := coalesce(new.owner, new.owner_id::uuid, auth.uid());
  billing_account uuid;
  byte_count bigint := (new.metadata->>'size')::bigint;
  account_used numeric;
  archive_used numeric;
begin
  if new.bucket_id not in ('note-images', 'chat-media', 'avatars') then return new; end if;
  if new.bucket_id in ('note-images', 'chat-media') then
    if not private.archive_plan_writable(archive) then
      raise check_violation using message = 'This archive is view only';
    end if;
    select private.billing_owner(a) into billing_account from public.archives a where a.id = archive;
  end if;
  -- Storage's permission probe can omit metadata. Finalization supplies size.
  if byte_count is null then return new; end if;
  if byte_count < 0 then raise check_violation using message = 'Invalid object size'; end if;
  -- Lock accounts in the same order for all uploads, then the archive.
  perform pg_advisory_xact_lock(hashtextextended(account::text, 3))
    from (select distinct unnest(array[uploader, billing_account]) as account) accounts
    where account is not null order by account;
  if archive is not null and billing_account is not null then
    perform pg_advisory_xact_lock(hashtextextended(archive::text, 4));
  end if;

  if uploader is not null then
    select coalesce(sum((o.metadata->>'size')::bigint),0) into account_used
    from storage.objects o
    where (o.owner_id = uploader::text or o.owner = uploader)
      and o.bucket_id in ('note-images','chat-media','avatars') and o.id <> new.id;
    if account_used + byte_count > (case when private.effective_plan(uploader) = 'plus'
      then 20000000000 else 1000000000 end) then
      raise sqlstate 'PT413' using message = 'This account has reached its storage limit';
    end if;
  end if;

  if billing_account is not null then
    select coalesce(sum((o.metadata->>'size')::bigint),0),
      coalesce(sum((o.metadata->>'size')::bigint) filter (where a.id = archive),0)
    into account_used, archive_used
    from public.archives a join storage.objects o on o.name collate "C" like a.id::text || '/%'
    where private.billing_owner(a) = billing_account
      and o.bucket_id in ('note-images','chat-media') and o.id <> new.id
      and (o.bucket_id,o.name) <> (new.bucket_id,new.name);
    if account_used + byte_count > (case when private.effective_plan(billing_account) = 'plus'
      then 20000000000 else 1000000000 end) then
      raise sqlstate 'PT413' using message = 'This archive owner has reached their storage limit';
    end if;
    if archive_used + byte_count > (case when private.effective_plan(billing_account) = 'plus'
      then 5000000000 else 1000000000 end) then
      raise sqlstate 'PT413' using message = 'This archive has reached its storage limit';
    end if;
  end if;
  return new;
end;
$quota$;

update storage.buckets set allowed_mime_types = array_remove(allowed_mime_types, 'application/octet-stream')
where id = 'note-images';

alter table private.safety_retention add column scan_new_uploads boolean not null default false;
create table private.safety_scan_queue (
  object_id uuid primary key,
  bucket_id text not null,
  object_name text not null,
  uploader uuid,
  report_id uuid references private.safety_reports(id) on delete restrict,
  attempts integer not null default 0,
  retry_after timestamptz not null default now(),
  unique (bucket_id, object_name)
);

-- Cleanup claims are tombstones so a late post cannot publish a missing file.
create table private.retired_chat_media (
  object_name text primary key,
  removed_at timestamptz
);
create table private.safety_worker_lease (
  singleton boolean primary key default true check (singleton),
  token uuid not null,
  expires_at timestamptz not null
);
revoke all on private.safety_scan_queue, private.retired_chat_media,
  private.safety_worker_lease from public, anon, authenticated;

create function private.wake_safety_worker()
returns void language plpgsql security definer set search_path = ''
as $wake$
declare endpoint text; worker_key text;
begin
  if to_regclass('vault.decrypted_secrets') is null
    or to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then return; end if;
  select decrypted_secret into endpoint from vault.decrypted_secrets where name = 'napp_safety_worker_endpoint';
  select decrypted_secret into worker_key from vault.decrypted_secrets where name = 'napp_safety_worker_key';
  if endpoint is null or worker_key is null then return; end if;
  perform net.http_post(url := endpoint, headers := jsonb_build_object(
    'Authorization', 'Bearer ' || worker_key, 'Content-Type','application/json'),
    body := '{}'::jsonb, timeout_milliseconds := 55000);
exception when others then
  raise warning 'Safety worker wake failed (%)', sqlstate;
end;
$wake$;

create function private.queue_upload_scan()
returns trigger language plpgsql security definer set search_path = ''
as $queue$
begin
  if new.bucket_id in ('note-images','chat-media','avatars') and new.metadata->>'size' is not null
    and (tg_op = 'INSERT' or new.version is distinct from old.version)
    and (select scan_new_uploads from private.safety_retention) then
    insert into private.safety_scan_queue(object_id,bucket_id,object_name,uploader)
    values (new.id,new.bucket_id,new.name,coalesce(new.owner,new.owner_id::uuid));
    if pg_try_advisory_xact_lock(hashtextextended('napp-safety-wake', 0)) then
      perform private.wake_safety_worker();
    end if;
  end if;
  return new;
end;
$queue$;
create trigger queue_upload_scan after insert or update of version on storage.objects
for each row execute function private.queue_upload_scan();

create function private.safety_upload_visible(bucket text, path text)
returns boolean language sql stable security definer set search_path = ''
as $visible$
  select not exists (select 1 from private.safety_scan_queue q where q.bucket_id = bucket and q.object_name = path)
    and (bucket <> 'chat-media' or not exists
      (select 1 from private.retired_chat_media where object_name = path));
$visible$;
create policy safety_upload_read on storage.objects as restrictive for select to authenticated
using (private.safety_upload_visible(bucket_id, name));
revoke all on function private.safety_upload_visible(text,text) from public, anon;
grant execute on function private.safety_upload_visible(text,text) to authenticated;

create function private.guard_pending_safety_upload()
returns trigger language plpgsql security definer set search_path = ''
as $guard$
begin
  if tg_op <> 'INSERT' and (tg_op = 'DELETE' or
    (new.bucket_id,new.name,new.version,new.metadata) is distinct from (old.bucket_id,old.name,old.version,old.metadata))
    and exists (select 1 from private.safety_scan_queue q where q.object_id = old.id
      and (q.report_id is null or tg_op <> 'DELETE' or auth.uid() is not null)) then
    raise sqlstate 'PT423' using message = 'This upload is temporarily unavailable';
  end if;
  if tg_op <> 'DELETE' and new.bucket_id = 'chat-media'
    and exists (select 1 from private.retired_chat_media where object_name = new.name) then
    raise check_violation using message = 'This upload has expired';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$guard$;
create trigger guard_pending_safety_upload before insert or update or delete on storage.objects
for each row execute function private.guard_pending_safety_upload();

-- Serializes cleanup with the insert of its message, note comment or sticker.
create function private.lock_chat_media_target()
returns trigger language plpgsql security definer set search_path = ''
as $lock$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.id::text, 5));
  if exists (select 1 from private.retired_chat_media
    where object_name collate "C" like new.archive_id::text || '/' || new.id::text || '.%') then
    raise check_violation using message = 'An attachment expired. Upload it again.';
  end if;
  return new;
end;
$lock$;
create trigger lock_archive_message_media before insert on public.archive_messages
for each row execute function private.lock_chat_media_target();
create trigger lock_note_comment_media before insert on public.note_comments
for each row execute function private.lock_chat_media_target();
create trigger lock_archive_sticker_media before insert on public.archive_stickers
for each row execute function private.lock_chat_media_target();

create function private.claim_chat_orphans()
returns void language plpgsql security definer set search_path = ''
as $orphans$
declare file record;
begin
  for file in select o.name, private.chat_media_message_id(o.name) as target from storage.objects o
    where o.bucket_id = 'chat-media' and o.created_at < now() - interval '1 day'
      and not exists (select 1 from private.retired_chat_media where object_name = o.name)
      and not exists (select 1 from private.safety_scan_queue q where q.object_id = o.id)
      and not exists (select 1 from private.safety_evidence_objects e
        where e.source_bucket = o.bucket_id and e.source_name = o.name)
      and not exists (select 1 from private.account_legal_holds h
        where h.user_id = o.owner or h.user_id::text = o.owner_id)
      and not exists (select 1 from public.archive_messages m where m.id = private.chat_media_message_id(o.name))
      and not exists (select 1 from public.note_comments c where c.id = private.chat_media_message_id(o.name))
      and not exists (select 1 from public.archive_stickers s where s.path = o.name)
    order by o.created_at limit 25
  loop
    if file.target is not null and not pg_try_advisory_xact_lock(hashtextextended(file.target::text, 5)) then
      continue;
    end if;
    if not exists (select 1 from public.archive_messages where id = file.target)
      and not exists (select 1 from public.note_comments where id = file.target)
      and not exists (select 1 from public.archive_stickers where path = file.name) then
      insert into private.retired_chat_media(object_name) values (file.name) on conflict do nothing;
    end if;
  end loop;
end;
$orphans$;

create or replace function public.account_erasure_held(target_user_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $held$
  select exists (select 1 from private.account_legal_holds where user_id = target_user_id)
    or exists (select 1 from private.safety_scan_queue where uploader = target_user_id)
    or exists (select 1 from private.safety_reports where target_user_id = account_erasure_held.target_user_id and legal_hold)
    or exists (select 1 from private.safety_evidence_objects e join private.safety_reports r on r.id = e.report_id
      where (e.source_owner = account_erasure_held.target_user_id or r.target_user_id = account_erasure_held.target_user_id)
        and (e.copied_at is null or (r.legal_hold and not e.quarantine)));
$held$;
-- Service-only result transition. The scan match is processed before any
-- external Auth or Storage calls, so a worker crash cannot publish the file.
create function public.flag_safety_scan(target_object_id uuid)
returns uuid language plpgsql security definer set search_path = ''
as $match$
declare item private.safety_scan_queue%rowtype; report uuid;
begin
  select * into item from private.safety_scan_queue where object_id = target_object_id for update;
  if not found then raise exception 'Safety scan is missing'; end if;
  if item.report_id is not null then return item.report_id; end if;
  insert into private.safety_reports(target_user_id,reason,snapshot,legal_hold)
    values(item.uploader,'child_safety',jsonb_build_object('upload',
      jsonb_build_object('bucket',item.bucket_id,'path',item.object_name)),true)
    returning id into report;
  insert into private.safety_evidence_objects(report_id,source_bucket,source_name,source_owner,quarantine)
    values(report,item.bucket_id,item.object_name,item.uploader,true);
  update private.safety_scan_queue set report_id = report where object_id = target_object_id;
  insert into private.erased_storage_paths(path_hash)
    values(sha256(convert_to(item.bucket_id || ':' || item.object_name,'UTF8'))) on conflict do nothing;
  if exists (select 1 from auth.users where id = item.uploader) then
    perform public.set_account_suspension(item.uploader,true);
  end if;
  return report;
end;
$match$;

create function public.safety_worker_start()
returns uuid language plpgsql security definer set search_path = ''
as $start$
declare lease uuid := gen_random_uuid();
begin
  insert into private.safety_worker_lease(singleton,token,expires_at)
    values (true,lease,clock_timestamp() + interval '90 seconds')
    on conflict (singleton) do update set token = excluded.token, expires_at = excluded.expires_at
    where private.safety_worker_lease.expires_at <= clock_timestamp();
  if not found then return null; end if;
  perform private.claim_chat_orphans();
  return lease;
end;
$start$;

create function public.safety_worker_finish(lease uuid)
returns void language sql security definer set search_path = ''
as $finish$
  delete from private.safety_worker_lease where token = lease;
$finish$;

create function public.safety_worker_jobs()
returns table(kind text, id uuid, bucket text, path text, uploader uuid)
language sql security definer set search_path = ''
as $jobs$
  (select 'scan', q.object_id, q.bucket_id, q.object_name, q.uploader from private.safety_scan_queue q
    where q.report_id is null and q.retry_after <= now() order by q.retry_after limit 3)
  union all
  (select 'copy', e.id, e.source_bucket, e.source_name, e.source_owner from private.safety_evidence_objects e
    join private.safety_reports r on r.id = e.report_id where e.copied_at is null and e.retry_after <= now()
    order by (r.reason = 'child_safety') desc, r.created_at limit 15)
  union all
  (select 'quarantine', q.object_id, q.bucket_id, q.object_name, q.uploader from private.safety_scan_queue q
    where q.report_id is not null and q.retry_after <= now()
      and not exists (select 1 from private.safety_evidence_objects e where e.source_bucket = q.bucket_id
        and e.source_name = q.object_name and e.copied_at is null) order by q.retry_after limit 5)
  union all
  (select 'orphan', null, 'chat-media', o.object_name, null from private.retired_chat_media o
    where o.removed_at is null limit 25)
  union all
  (select 'expire', e.id, 'safety-evidence', e.id::text, null from private.safety_evidence_objects e
    join private.safety_reports r on r.id = e.report_id cross join private.safety_retention settings
    where e.copied_at is not null and not r.legal_hold
      and not exists (select 1 from private.safety_scan_queue q where q.report_id = r.id)
      and r.reviewed_at < now() - make_interval(days => case when r.reason = 'child_safety'
        then settings.child_safety_days else settings.other_report_days end)
    order by r.reviewed_at limit 25);
$jobs$;

create function public.safety_worker_ack(job_kind text, job_id uuid, job_path text)
returns void language plpgsql security definer set search_path = ''
as $ack$
begin
  case job_kind
    when 'copy' then
      if not exists (select 1 from storage.objects where bucket_id = 'safety-evidence' and name = job_id::text) then
        raise exception 'Safety evidence has not been copied';
      end if;
      update private.safety_evidence_objects set copied_at = now() where id = job_id;
    when 'defer_copy' then
      update private.safety_evidence_objects set retry_after = now() + interval '5 minutes' where id = job_id;
    when 'scan' then
      delete from private.safety_scan_queue where object_id = job_id and report_id is null;
    when 'quarantine' then
      if exists (select 1 from storage.objects where id = job_id) then
        raise exception 'Quarantine source still exists';
      end if;
      delete from private.safety_scan_queue where object_id = job_id;
    when 'orphan' then update private.retired_chat_media set removed_at = now() where object_name = job_path;
    when 'expire' then
      if exists (select 1 from storage.objects where bucket_id = 'safety-evidence' and name = job_id::text) then
        raise exception 'Safety evidence has not been removed';
      end if;
      delete from private.safety_evidence_objects where id = job_id;
    else raise invalid_parameter_value;
  end case;
end;
$ack$;

create function public.safety_scan_retry(target_object_id uuid)
returns void language sql security definer set search_path = ''
as $retry$
  update private.safety_scan_queue set attempts = attempts + 1,
    retry_after = now() + make_interval(mins => least(60, 1 + attempts * 2))
  where object_id = target_object_id;
$retry$;

revoke all on function private.wake_safety_worker(), private.queue_upload_scan(),
  private.guard_pending_safety_upload(), private.lock_chat_media_target(), private.claim_chat_orphans(),
  public.flag_safety_scan(uuid), public.safety_worker_start(), public.safety_worker_jobs(),
  public.safety_worker_ack(text,uuid,text), public.safety_scan_retry(uuid) from public, anon, authenticated;
grant execute on function public.flag_safety_scan(uuid), public.safety_worker_start(),
  public.safety_worker_jobs(), public.safety_worker_ack(text,uuid,text),
  public.safety_scan_retry(uuid), public.safety_worker_finish(uuid) to service_role;

do $schedule$
begin
  if to_regclass('cron.job') is not null then
    perform cron.schedule('napp-safety-worker', '* * * * *', 'select private.wake_safety_worker()');
  end if;
end;
$schedule$;
