-- A seat held by an unclaimed invitation is a seat nobody can use, and the cap
-- added in `20260830020000_two_seat_archive.sql` made waiting seven days for it
-- the only way out. Withdrawing one is the missing half of issuing one.
--
-- Removing the row is right: the digest is the only thing stored, the token it
-- matches becomes unredeemable the moment the row is gone, and a withdrawn
-- invitation is not a record anyone wants to keep. Direct writes on the table
-- stay revoked; this is the narrow door, and it checks the same editor rule
-- that issuing checks.

create or replace function private.withdraw_archive_invite(invite_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $withdraw$
declare
  target_archive_id uuid;
begin
  select archive_id into target_archive_id
  from public.archive_invites
  where id = invite_id
    and claimed_at is null;

  if target_archive_id is null then
    raise invalid_parameter_value using message = 'That invitation is no longer pending';
  end if;

  if not private.can_write_archive(target_archive_id) then
    raise insufficient_privilege using message = 'Editor role required';
  end if;

  delete from public.archive_invites where id = invite_id;
end;
$withdraw$;

create or replace function public.revoke_archive_invite(invite_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $withdraw_rpc$
  select private.withdraw_archive_invite(invite_id);
$withdraw_rpc$;

revoke all on function private.withdraw_archive_invite(uuid) from public, anon;
revoke all on function public.revoke_archive_invite(uuid) from public, anon;
grant execute on function private.withdraw_archive_invite(uuid) to authenticated;
grant execute on function public.revoke_archive_invite(uuid) to authenticated;
