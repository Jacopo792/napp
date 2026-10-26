-- A deletion request is a durable instruction, not a sign-out or a claim that
-- deletion has already finished. Operations must process this queue before a
-- release enables the interface. Deleting auth.users removes the request too.
create table public.account_deletion_requests (
  user_id uuid primary key references auth.users (id) on delete cascade,
  requested_at timestamptz not null default now()
);

alter table public.account_deletion_requests enable row level security;
revoke all on public.account_deletion_requests from public, anon, authenticated;
grant select on public.account_deletion_requests to authenticated;
grant all on public.account_deletion_requests to service_role;

create policy account_deletion_requests_read_own
  on public.account_deletion_requests for select to authenticated
  using (user_id = (select auth.uid()));

create function private.request_account_deletion(expected_user_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $request$
declare
  caller uuid := (select auth.uid());
  received_at timestamptz;
begin
  -- expected_user_id is an account-switch guard, never a deletion target.
  -- A still-unexpired JWT belonging to a deleted account is refused as well.
  if caller is null or expected_user_id is distinct from caller
     or not exists (select 1 from auth.users where id = caller) then
    raise insufficient_privilege using message = 'Sign in to this account again';
  end if;

  insert into public.account_deletion_requests (user_id)
  values (caller)
  on conflict (user_id) do nothing;

  select requested_at into received_at
    from public.account_deletion_requests where user_id = caller;
  return received_at;
end;
$request$;

create function public.request_account_deletion(expected_user_id uuid)
returns timestamptz
language sql
security invoker
set search_path = ''
as $rpc$
  select private.request_account_deletion(expected_user_id);
$rpc$;

revoke all on function private.request_account_deletion(uuid) from public, anon;
revoke all on function public.request_account_deletion(uuid) from public, anon;
grant execute on function private.request_account_deletion(uuid) to authenticated;
grant execute on function public.request_account_deletion(uuid) to authenticated;
