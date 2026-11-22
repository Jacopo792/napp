-- The Plus trial began at sign-up, before the address was confirmed, and again
-- for every new account. It now begins when the address is confirmed, and an
-- address that already had a trial gets the Free plan instead.
--
-- `private.trial_claims` keeps a SHA-256 of the normalised address, not the
-- address, and survives account erasure on purpose: it is the anti-abuse
-- record that stops delete-and-sign-up-again (GDPR art. 6(1)(f); the hash
-- alone does not identify anyone without the address).
-- ponytail: normalisation is lowercase plus dropping a `+tag`; provider dot
-- rules (Gmail) are not folded. Add them if trials are farmed that way.

create table private.trial_claims (
  address_hash bytea primary key,
  claimed_at timestamptz not null default now()
);
revoke all on private.trial_claims from public, anon, authenticated;

create function private.trial_address_hash(address text)
returns bytea language sql immutable set search_path = ''
as $hash$
  select pg_catalog.sha256(pg_catalog.convert_to(
    regexp_replace(lower(btrim(address)), '\+[^@]*@', '@'), 'UTF8'));
$hash$;
revoke all on function private.trial_address_hash(text) from public, anon, authenticated;

insert into private.trial_claims(address_hash)
select distinct private.trial_address_hash(u.email)
from auth.users u join public.account_entitlements e on e.owner_id = u.id
where u.email is not null
on conflict do nothing;

create or replace function private.start_account_trial()
returns trigger language plpgsql security definer set search_path = ''
as $trial$
declare first_trial boolean;
begin
  if new.is_anonymous or new.email is null or new.email_confirmed_at is null
     or exists (select 1 from public.account_entitlements where owner_id = new.id) then
    return new;
  end if;
  insert into private.trial_claims(address_hash) values (private.trial_address_hash(new.email))
    on conflict do nothing;
  first_trial := found;
  -- A row either way: billing records paid periods against an existing row.
  insert into public.account_entitlements(owner_id, plan, status, trial_ends_at, source)
  values (new.id,
    case when first_trial then 'plus' else 'free' end,
    case when first_trial then 'trialing' else 'expired' end,
    case when first_trial then statement_timestamp() + interval '720 hours' end,
    'trial')
  on conflict (owner_id) do nothing;
  return new;
end;
$trial$;

drop trigger if exists start_account_trial on auth.users;
create trigger start_account_trial
after insert or update of is_anonymous, email, email_confirmed_at on auth.users
for each row execute function private.start_account_trial();

-- A full refund or a dispute on a Stripe charge ends the web plan now, instead
-- of at the end of the period it paid for.
create function public.end_stripe_period(stripe_customer_id text)
returns void language sql security definer set search_path = ''
as $end_stripe$
  update public.account_entitlements
  set status = 'canceled', current_period_end = least(current_period_end, statement_timestamp())
  where source = 'web' and external_customer_id = stripe_customer_id;
$end_stripe$;
revoke all on function public.end_stripe_period(text) from public, anon, authenticated;
grant execute on function public.end_stripe_period(text) to service_role;
