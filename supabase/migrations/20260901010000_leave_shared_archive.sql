-- Leaving is deliberately narrower than direct membership deletion: only the
-- caller can remove themselves, the archive cannot become orphaned, and an
-- editor cannot leave behind an all-viewer archive. The remaining editor can
-- then use the existing invitation flow to fill the freed seat.

create or replace function private.leave_shared_archive(target_archive_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $leave$
declare
  current_user_id uuid := (select auth.uid());
  current_role text;
  member_count integer;
  remaining_editors integer;
begin
  if current_user_id is null then
    raise insufficient_privilege using message = 'Authentication required';
  end if;

  -- Lock the roster as one set. A role change or another leave cannot slip
  -- between the count and the delete below.
  perform 1
  from public.archive_members
  where archive_id = target_archive_id
  for update;

  select role into current_role
  from public.archive_members
  where archive_id = target_archive_id and user_id = current_user_id;
  if current_role is null then
    raise insufficient_privilege using message = 'You are not a member of this archive';
  end if;

  select count(*) into member_count
  from public.archive_members
  where archive_id = target_archive_id;
  if member_count <= 1 then
    raise check_violation using message = 'Invite another editor before leaving the last seat';
  end if;

  if current_role = 'editor' then
    select count(*) into remaining_editors
    from public.archive_members
    where archive_id = target_archive_id
      and user_id <> current_user_id
      and role = 'editor';
    if remaining_editors = 0 then
      raise check_violation using message = 'Promote another member to editor before leaving';
    end if;
  end if;

  delete from public.archive_members
  where archive_id = target_archive_id and user_id = current_user_id;
end;
$leave$;

create or replace function public.leave_shared_archive(archive_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $leave_rpc$
  select private.leave_shared_archive(archive_id);
$leave_rpc$;

revoke all on function private.leave_shared_archive(uuid) from public, anon;
revoke all on function public.leave_shared_archive(uuid) from public, anon;
grant execute on function private.leave_shared_archive(uuid) to authenticated;
grant execute on function public.leave_shared_archive(uuid) to authenticated;
