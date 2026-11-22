-- Accounts need a mailbox that lasts. Addresses at disposable ("temp mail")
-- providers are refused wherever an address reaches an account: sign-up, an
-- anonymous phone account saving itself, and an email change (the pending
-- `email_change` is checked before any link is sent).
--
-- The trigger is the boundary. `email_allowed()` only lets the app say why
-- before it asks; it reveals nothing that the public list does not.
-- The domains are loaded by 20261122030100 from the open
-- disposable-email-domains blocklist.

create table private.disposable_email_domains (
  domain text primary key
);

-- A subdomain of a listed provider (x.mailinator.com) counts as the provider.
create or replace function private.is_disposable_email(address text)
returns boolean
language sql
stable
set search_path = ''
as $is_disposable$
  with host as (
    -- `Name <box@host>` counts by its mailbox: keep the part after the last @, up to any `>`.
    select lower(pg_catalog.btrim(pg_catalog.split_part(
      pg_catalog.regexp_replace(address, '^.*@', ''), '>', 1))) as name
    where pg_catalog.strpos(address, '@') > 0
  )
  select exists (
    select 1
    from host, private.disposable_email_domains as listed
    where host.name <> ''
      and (host.name = listed.domain or host.name like '%.' || listed.domain)
  );
$is_disposable$;

-- Security definer: Auth writes `auth.users` as `supabase_auth_admin`, which
-- has no access to `private`.
create or replace function private.refuse_disposable_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $refuse$
begin
  -- On update only a changed address is judged, so an account on a listed
  -- provider can still move to a permanent mailbox.
  if (tg_op = 'INSERT' or new.email is distinct from old.email)
       and private.is_disposable_email(coalesce(new.email, ''))
     or (tg_op = 'INSERT' or new.email_change is distinct from old.email_change)
       and private.is_disposable_email(coalesce(new.email_change, '')) then
    raise check_violation using message = 'Disposable email addresses are not accepted';
  end if;
  return new;
end;
$refuse$;

create trigger refuse_disposable_email
before insert or update of email, email_change on auth.users
for each row execute function private.refuse_disposable_email();

create or replace function public.email_allowed(address text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $allowed$
  select not private.is_disposable_email(address);
$allowed$;

revoke all on function public.email_allowed(text) from public;
grant execute on function public.email_allowed(text) to anon, authenticated;
