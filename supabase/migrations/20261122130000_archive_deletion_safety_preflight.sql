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
  if not private.account_write_allowed() then
    return 'This account cannot delete a group';
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
  -- deleteSpace removes Storage files before asking Postgres to drop the
  -- archive. Refuse up front while any source or child row must be kept.
  if exists (select 1 from private.safety_reports r where r.legal_hold and (
    exists (select 1 from public.notes n where n.id = r.note_id and n.archive_id = target_archive_id)
    or exists (select 1 from public.archive_messages m where m.id = r.message_id and m.archive_id = target_archive_id)
    or exists (select 1 from public.archive_stickers s where s.id = r.sticker_id and s.archive_id = target_archive_id)
  )) or exists (
    select 1 from private.safety_evidence_objects e join private.safety_reports r on r.id = e.report_id
    where e.source_bucket in ('note-images','chat-media')
      and e.source_name collate "C" like target_archive_id::text || '/%'
      and (e.copied_at is null or r.legal_hold)
  ) or exists (
    select 1 from private.safety_scan_queue q where q.bucket_id in ('note-images','chat-media')
      and q.object_name collate "C" like target_archive_id::text || '/%'
  ) or exists (
    select 1 from storage.objects o join private.account_legal_holds h
      on (o.owner = h.user_id or o.owner_id = h.user_id::text)
    where o.bucket_id in ('note-images','chat-media')
      and o.name collate "C" like target_archive_id::text || '/%'
  ) then
    return 'This group has files or content that must be preserved';
  end if;
  return null;
end;
$refusal$;
