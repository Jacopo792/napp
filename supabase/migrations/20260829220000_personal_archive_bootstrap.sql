-- A new account has no membership, while every direct insert into archives is
-- correctly refused by RLS until a membership already exists. Bootstrap the
-- archive and its first membership in one transaction, using a private
-- security-definer function with a public security-invoker RPC as the narrow
-- door the browser may call.

create or replace function private.bootstrap_personal_archive()
returns uuid
language plpgsql
security definer
set search_path = ''
as $bootstrap$
declare
  current_user_id uuid := (select auth.uid());
  existing_archive_id uuid;
  new_archive_id uuid;
begin
  if current_user_id is null then
    raise insufficient_privilege using message = 'Authentication required';
  end if;

  -- Two tabs completing the same first sign-in must not create two archives.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(current_user_id::text, 0)
  );

  select member.archive_id
  into existing_archive_id
  from public.archive_members as member
  where member.user_id = current_user_id
  order by member.created_at, member.archive_id
  limit 1;

  if existing_archive_id is not null then
    return existing_archive_id;
  end if;

  insert into public.archives (name, settings)
  values ('My notes', '{}'::jsonb)
  returning id into new_archive_id;

  insert into public.archive_members (archive_id, user_id)
  values (new_archive_id, current_user_id);

  return new_archive_id;
end;
$bootstrap$;

create or replace function public.ensure_personal_archive()
returns uuid
language sql
security invoker
set search_path = ''
as $rpc$
  select private.bootstrap_personal_archive();
$rpc$;

revoke all on function private.bootstrap_personal_archive() from public, anon;
revoke all on function public.ensure_personal_archive() from public, anon;
grant execute on function private.bootstrap_personal_archive() to authenticated;
grant execute on function public.ensure_personal_archive() to authenticated;
