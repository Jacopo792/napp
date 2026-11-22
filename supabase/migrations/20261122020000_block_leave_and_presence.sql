-- A block inside a shared archive: the people on both sides stop seeing each
-- other's live presence, and the person who blocked can end the shared space.
--
-- 1. `hidden_people()` lists the accounts on the other side of a block, in
--    either direction, so both clients drop that person's face and caret from
--    notes other members wrote. Ids only. It shows the blocked person that a
--    block exists, but their notes have already disappeared, so that is known anyway.
-- 2. `remove_blocked_member()` lets an archive's creator remove somebody they
--    have blocked. It is not a general way to remove members: the target must be
--    blocked by the caller. Leaving stays `leave_shared_archive()` for everybody.
--    The removed person's notes stay in the archive, as they do when someone leaves.

create or replace function public.hidden_people()
returns setof uuid language sql stable security definer set search_path = ''
as $hidden$
  select blocked_id from public.user_blocks where blocker_id = (select auth.uid())
  union
  select blocker_id from public.user_blocks where blocked_id = (select auth.uid());
$hidden$;
revoke all on function public.hidden_people() from public, anon;
grant execute on function public.hidden_people() to authenticated;

create or replace function public.remove_blocked_member(target_archive_id uuid, target_user_id uuid)
returns void language plpgsql security definer set search_path = ''
as $remove$
declare caller uuid := (select auth.uid());
begin
  if caller is null
    or not exists (select 1 from public.archives where id = target_archive_id and created_by = caller)
    or not exists (select 1 from public.user_blocks where blocker_id = caller and blocked_id = target_user_id)
  then
    raise insufficient_privilege using message = 'Only the archive''s creator can remove someone they blocked';
  end if;
  perform 1 from public.archive_members where archive_id = target_archive_id for update;
  delete from public.archive_members where archive_id = target_archive_id and user_id = target_user_id;
  if not found then raise check_violation using message = 'They are not in this archive'; end if;
end;
$remove$;
revoke all on function public.remove_blocked_member(uuid, uuid) from public, anon;
grant execute on function public.remove_blocked_member(uuid, uuid) to authenticated;
