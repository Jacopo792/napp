-- Plus bought on iPhone through the App Store. The `apple-iap` function
-- verifies Apple's signed transaction, then records its latest state here,
-- both when the phone hands a purchase over and on every App Store Server
-- Notification (renewal, refund, revocation). The account is the transaction's
-- `appAccountToken`, which the phone sets to the Napp user id when buying.
--
-- A subscription bought with one Apple ID stays bound to the first Napp account
-- that recorded it: restoring it while signed in to another account is refused.

create unique index account_entitlements_apple_subscription_idx
  on public.account_entitlements (external_subscription_id) where source = 'apple';

create function public.record_apple_period(
  target_user_id uuid,
  original_transaction_id text,
  expires_at timestamptz,
  revoked boolean
)
returns text language plpgsql security definer set search_path = ''
as $apple$
declare entitlement public.account_entitlements;
begin
  if original_transaction_id is null or not isfinite(expires_at) then
    return 'invalid';
  end if;
  if exists (select 1 from public.account_entitlements
    where source = 'apple' and external_subscription_id = original_transaction_id
      and owner_id <> target_user_id) then
    return 'other_account';
  end if;
  select * into entitlement from public.account_entitlements
    where owner_id = target_user_id for update;
  if not found
     or exists (select 1 from private.account_erasure_jobs where user_id = target_user_id) then
    return 'no_account';
  end if;

  if entitlement.source = 'apple' and entitlement.external_subscription_id = original_transaction_id then
    if revoked then
      update public.account_entitlements
        set status = 'canceled', current_period_end = least(current_period_end, statement_timestamp())
        where owner_id = target_user_id;
      return 'revoked';
    end if;
    update public.account_entitlements
      set plan = 'plus', status = 'active',
          current_period_end = greatest(coalesce(current_period_end, '-infinity'), expires_at)
      where owner_id = target_user_id;
    return 'recorded';
  end if;

  if revoked or expires_at <= statement_timestamp() then
    return 'expired';
  end if;
  -- A paid web subscription keeps its place; the phone shows where to manage it.
  if entitlement.source = 'web'
     and coalesce(private.plan_deadline(entitlement), '-infinity') > statement_timestamp() then
    return 'web_active';
  end if;
  update public.account_entitlements
    set plan = 'plus', status = 'active', source = 'apple',
        external_customer_id = null,
        external_subscription_id = original_transaction_id,
        current_period_end = expires_at
    where owner_id = target_user_id;
  return 'recorded';
end;
$apple$;

revoke all on function public.record_apple_period(uuid, text, timestamptz, boolean)
  from public, anon, authenticated;
grant execute on function public.record_apple_period(uuid, text, timestamptz, boolean) to service_role;

create or replace function public.my_plan()
returns jsonb language sql stable security definer set search_path = ''
as $my_plan$
  select jsonb_build_object(
    'plan', private.effective_plan((select auth.uid())),
    'trial_ends_at', e.trial_ends_at,
    'days_left', case when e.status = 'trialing' and e.trial_ends_at > statement_timestamp()
      then ceil(extract(epoch from e.trial_ends_at - statement_timestamp()) / 86400)::int end,
    'access_ends_at', private.plan_deadline(e),
    'stripe_billing', coalesce(e.source = 'web' and e.external_customer_id is not null, false),
    'apple_billing', coalesce(e.source = 'apple', false)
  )
  from (select auth.uid() as id) caller
  left join public.account_entitlements e on e.owner_id = caller.id;
$my_plan$;
