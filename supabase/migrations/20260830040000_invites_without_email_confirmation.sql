-- Email confirmation is turned off for this project: Supabase's built-in mail
-- service only delivers to the project's own team addresses, so the message
-- never arrived for anybody else and nobody could finish signing up. Jacopo
-- runs this for himself and a couple of friends and asked for it gone.
--
-- Redemption checked `email_confirmed_at is not null`, so leaving that in place
-- would have made every invitation permanently unclaimable — the archive would
-- have looked fine and simply refused every new member. It checks the address
-- alone now.
--
-- What that costs, stated plainly: the confirmed address used to prove the
-- caller owned the mailbox the invitation was addressed to. Without it, the
-- 64-hex one-time token is the whole of the secret, and anyone holding the link
-- who signs up with the invited address gets the membership. The token is still
-- shown once, still stored only as a SHA-256 digest, still expires in seven
-- days, still single-use, and still never passes through anything of ours —
-- it is copied by hand or handed to the member's own mail client. This is the
-- ordinary invite-link model; it is not the stronger one it replaced.

create or replace function private.redeem_archive_invite(invite_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $redeem_unconfirmed$
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
  return invitation.archive_id;
end;
$redeem_unconfirmed$;

revoke all on function private.redeem_archive_invite(text) from public, anon;
grant execute on function private.redeem_archive_invite(text) to authenticated;
