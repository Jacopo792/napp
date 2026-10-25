-- A mention can predate a block. Trusted erasure must be able to scrub an
-- unrelated deleted account from that comment without the old block aborting
-- its transaction. Authenticated clients keep the same restriction.
create or replace function private.check_blocked_mentions()
returns trigger language plpgsql security definer set search_path = ''
as $erasure_safe_mentions$
begin
  if (select auth.role()) is distinct from 'authenticated' then
    return new;
  end if;
  if exists (select 1 from unnest(new.mentions) mentioned(user_id) join public.user_blocks b
    on (b.blocker_id = new.author_id and b.blocked_id = mentioned.user_id)
      or (b.blocked_id = new.author_id and b.blocker_id = mentioned.user_id)) then
    raise check_violation using message = 'You cannot mention a blocked account';
  end if;
  return new;
end;
$erasure_safe_mentions$;
revoke all on function private.check_blocked_mentions() from public, anon, authenticated;
