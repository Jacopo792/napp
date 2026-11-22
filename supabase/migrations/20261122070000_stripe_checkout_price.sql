-- Recover the same Stripe creation request if a response was lost or another
-- tab chooses a different period while the request is in flight.
alter table public.stripe_billing_accounts add column checkout_price_id text;
