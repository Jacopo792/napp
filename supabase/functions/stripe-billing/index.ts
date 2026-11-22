import { createClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { createStripe } from "../_shared/stripe.ts";

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Promise<Response>): void;
};

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  {
    auth: { persistSession: false, autoRefreshToken: false },
  },
);
const secret = Deno.env.get("STRIPE_SECRET_KEY");
const prices = {
  month: Deno.env.get("STRIPE_PLUS_PRICE_ID_MONTHLY"),
  year: Deno.env.get("STRIPE_PLUS_PRICE_ID"),
};
const web = Deno.env.get("STRIPE_NAPP_WEB_URL");
const stripe = secret ? createStripe(secret) : null;

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};

function reply(status: number, body: object) {
  return Response.json(body, { status, headers });
}

interface BillingAccount {
  owner_id: string;
  customer_id: string | null;
  checkout_attempt: string;
  checkout_session_id: string | null;
  checkout_price_id: string | null;
}

async function prepare(userId: string): Promise<BillingAccount | null> {
  const { data, error } = await admin.rpc("prepare_stripe_billing", { target_user_id: userId });
  if (error) throw error;
  return data?.owner_id ? data : null;
}

async function customerFor(stripe: Stripe, billing: BillingAccount) {
  if (billing.customer_id) return billing.customer_id;
  const customer = await stripe.customers.create(
    {},
    { idempotencyKey: `napp-customer-${billing.owner_id}` },
  );
  const { data, error } = await admin.rpc("bind_stripe_customer", {
    target_user_id: billing.owner_id,
    stripe_customer_id: customer.id,
  });
  if (error) throw error;
  if (!data) throw new Error("Billing account changed");
  return data as string;
}

async function checkout(
  stripe: Stripe,
  billing: BillingAccount,
  customer: string,
  price: string,
  returnUrl: string,
): Promise<Stripe.Checkout.Session | null> {
  if (!billing.checkout_price_id) {
    const { data, error } = await admin
      .from("stripe_billing_accounts")
      .update({ checkout_price_id: price })
      .eq("owner_id", billing.owner_id)
      .eq("checkout_attempt", billing.checkout_attempt)
      .is("checkout_price_id", null)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    billing = data;
  }
  if (!billing.checkout_price_id) throw new Error("Checkout price was not reserved");
  const session = await stripe.checkout.sessions.create(
    {
      mode: "subscription",
      ui_mode: "elements",
      customer,
      client_reference_id: billing.owner_id,
      line_items: [{ price: billing.checkout_price_id, quantity: 1 }],
      return_url: returnUrl,
    },
    { idempotencyKey: `napp-checkout-${billing.checkout_attempt}` },
  );
  const { data, error } = await admin
    .from("stripe_billing_accounts")
    .update({ checkout_session_id: session.id })
    .eq("owner_id", billing.owner_id)
    .eq("checkout_attempt", billing.checkout_attempt)
    .select("checkout_session_id")
    .maybeSingle();
  if (error) throw error;
  return data ? session : null;
}

async function restartCheckout(billing: BillingAccount, price: string) {
  const { data, error } = await admin
    .from("stripe_billing_accounts")
    .update({
      checkout_attempt: crypto.randomUUID(),
      checkout_session_id: null,
      checkout_price_id: price,
    })
    .eq("owner_id", billing.owner_id)
    .eq("checkout_attempt", billing.checkout_attempt)
    .eq("checkout_session_id", billing.checkout_session_id)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data as BillingAccount | null;
}

async function expireOpenSession(stripe: Stripe, sessionId: string) {
  try {
    return await stripe.checkout.sessions.expire(sessionId);
  } catch (error) {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.status === "open") throw error;
    return session;
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return reply(405, { error: "Use POST." });
  if (!stripe || !web) return reply(503, { error: "Billing is unavailable." });
  const token = request.headers.get("Authorization")?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token) return reply(401, { error: "Sign in to manage your plan." });

  try {
    const {
      data: { user },
      error,
    } = await admin.auth.getUser(token);
    if (error || !user || user.is_anonymous || !user.email)
      return reply(401, { error: "Sign in to a registered Napp account." });
    const { action, interval = "year" } = (await request.json()) ?? {};
    if (
      action !== "portal" &&
      (action !== "checkout" || (interval !== "month" && interval !== "year"))
    )
      return reply(400, { error: "Invalid billing request." });
    const billing = await prepare(user.id);
    if (!billing) return reply(403, { error: "Billing is unavailable for this account." });

    const returnUrl = new URL(web);
    returnUrl.search = "?action=billing";
    returnUrl.hash = "";
    if (action === "portal") {
      if (!billing.customer_id) return reply(404, { error: "No Stripe subscription found." });
      const portal = await stripe.billingPortal.sessions.create({
        customer: billing.customer_id,
        return_url: returnUrl.toString(),
      });
      return reply(200, { url: portal.url });
    }
    const price = interval === "month" ? prices.month : prices.year;
    if (!price) return reply(503, { error: "This billing period is unavailable." });
    const { data: entitlement, error: entitlementError } = await admin
      .from("account_entitlements")
      .select("source,current_period_end")
      .eq("owner_id", user.id)
      .single();
    if (entitlementError) throw entitlementError;
    if (
      entitlement.source !== "trial" &&
      Date.parse(entitlement.current_period_end ?? "") > Date.now()
    )
      return reply(200, { status: entitlement.source === "web" ? "manage" : "active" });

    const customer = await customerFor(stripe, billing);
    // Check the tracked session first. A session that completes after listing
    // subscriptions must never be replaced on the strength of that old list.
    const prior = billing.checkout_session_id
      ? await stripe.checkout.sessions.retrieve(billing.checkout_session_id)
      : null;
    const subscriptions = stripe.subscriptions.list({ customer, status: "all" });
    for await (const subscription of subscriptions) {
      if (!["canceled", "incomplete_expired"].includes(subscription.status))
        return reply(200, { status: "manage" });
    }
    const checkoutUrl = `${returnUrl}&session_id={CHECKOUT_SESSION_ID}`;
    let session = prior ?? (await checkout(stripe, billing, customer, price, checkoutUrl));
    const checkoutChanged = () =>
      reply(409, { error: "Checkout changed in another tab. Try again." });
    if (!session) return checkoutChanged();

    if (session.status === "open") {
      const items = await stripe.checkout.sessions.listLineItems(session.id, { limit: 2 });
      if (items.data.length === 1 && items.data[0]?.price?.id === price && session.client_secret)
        return reply(200, { clientSecret: session.client_secret, email: user.email });

      // Close the old session at Stripe before changing its reservation in Postgres.
      // If payment won the race, we must not create a second subscription.
      session = await expireOpenSession(stripe, session.id);
      if (session.status !== "expired") return reply(200, { status: "manage" });
    } else if (!prior && session.status !== "expired") {
      return reply(200, { status: "manage" });
    }

    const next = await restartCheckout({ ...billing, checkout_session_id: session.id }, price);
    if (!next) return checkoutChanged();
    session = await checkout(stripe, next, customer, price, checkoutUrl);
    if (!session) return checkoutChanged();
    if (session.status !== "open" || !session.client_secret)
      return reply(200, { status: "manage" });
    return reply(200, { clientSecret: session.client_secret, email: user.email });
  } catch (error) {
    console.error(
      "Stripe billing request failed",
      error instanceof Error ? error.name : "DatabaseError",
    );
    return reply(503, { error: "Billing is temporarily unavailable. Please try again." });
  }
});
