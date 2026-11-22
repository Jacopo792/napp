create table public.stripe_billing_accounts (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  customer_id text unique,
  checkout_attempt uuid not null default gen_random_uuid(),
  checkout_session_id text
);
alter table public.stripe_billing_accounts enable row level security;
revoke all on public.stripe_billing_accounts from public, anon, authenticated;
grant select, insert, update on public.stripe_billing_accounts to service_role;

create function public.prepare_stripe_billing(target_user_id uuid)
returns public.stripe_billing_accounts
language plpgsql security definer set search_path = ''
as $$
declare billing public.stripe_billing_accounts;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_user_id::text, 0));
  if exists (select 1 from private.account_erasure_jobs where user_id = target_user_id)
     or not exists (select 1 from auth.users where id = target_user_id and not is_anonymous) then
    return null;
  end if;
  insert into public.stripe_billing_accounts(owner_id) values (target_user_id)
    on conflict (owner_id) do nothing;
  select * into billing from public.stripe_billing_accounts where owner_id = target_user_id;
  return billing;
end;
$$;

create function public.bind_stripe_customer(target_user_id uuid, stripe_customer_id text)
returns text language plpgsql security definer set search_path = ''
as $$
declare linked_customer text;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_user_id::text, 0));
  if exists (select 1 from private.account_erasure_jobs where user_id = target_user_id) then
    return null;
  end if;
  update public.stripe_billing_accounts
    set customer_id = coalesce(customer_id, stripe_customer_id)
    where owner_id = target_user_id returning customer_id into linked_customer;
  return linked_customer;
end;
$$;

create function public.record_stripe_paid_period(
  stripe_customer_id text, stripe_subscription_id text, paid_through timestamptz
)
returns void language sql security definer set search_path = ''
as $$
  update public.account_entitlements e
  set plan = 'plus', status = 'active', source = 'web',
      external_customer_id = stripe_customer_id,
      external_subscription_id = stripe_subscription_id,
      current_period_end = paid_through
  from public.stripe_billing_accounts b
  where b.customer_id = stripe_customer_id and b.owner_id = e.owner_id
    and not exists (select 1 from private.account_erasure_jobs where user_id = e.owner_id)
    and isfinite(paid_through)
    and (
      (e.source = 'trial' and paid_through > now())
      or (e.source = 'web' and paid_through > coalesce(e.current_period_end, '-infinity'))
      or (coalesce(private.plan_deadline(e), '-infinity') <= now() and paid_through > now())
    );
$$;

revoke all on function public.prepare_stripe_billing(uuid),
  public.bind_stripe_customer(uuid, text),
  public.record_stripe_paid_period(text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.prepare_stripe_billing(uuid),
  public.bind_stripe_customer(uuid, text),
  public.record_stripe_paid_period(text, text, timestamptz) to service_role;

create or replace function public.my_plan()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'plan', private.effective_plan((select auth.uid())),
    'trial_ends_at', e.trial_ends_at,
    'days_left', case when e.status = 'trialing' and e.trial_ends_at > statement_timestamp()
      then ceil(extract(epoch from e.trial_ends_at - statement_timestamp()) / 86400)::int end,
    'access_ends_at', private.plan_deadline(e),
    'stripe_billing', coalesce(e.source = 'web' and e.external_customer_id is not null, false)
  )
  from (select auth.uid() as id) caller
  left join public.account_entitlements e on e.owner_id = caller.id;
$$;
