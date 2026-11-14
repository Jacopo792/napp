-- The assignment/block hardening must retain the trusted erasure bypass:
-- an old mention may predate a block, and removing a deleted account from it
-- cannot be refused because another, unrelated blocked mention remains.
create or replace function private.check_blocked_mentions()
returns trigger language plpgsql security definer set search_path = ''
as $erasure_safe_assignees$
begin
  if (select auth.role()) is distinct from 'authenticated' then
    return new;
  end if;
  if exists (select 1 from unnest(new.mentions || new.assignee_id) named(user_id)
    join public.user_blocks b
    on (b.blocker_id = new.author_id and b.blocked_id = named.user_id)
      or (b.blocked_id = new.author_id and b.blocker_id = named.user_id)) then
    raise check_violation using message = 'You cannot mention a blocked account';
  end if;
  return new;
end;
$erasure_safe_assignees$;
revoke all on function private.check_blocked_mentions() from public, anon, authenticated;
