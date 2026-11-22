import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { createStripe } from "../_shared/stripe.ts";
import { paidPeriod } from "./paidPeriod.ts";

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
const endpointSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
const prices = new Set(
  [Deno.env.get("STRIPE_PLUS_PRICE_ID"), Deno.env.get("STRIPE_PLUS_PRICE_ID_MONTHLY")].filter(
    (price): price is string => Boolean(price),
  ),
);
const stripe = secret ? createStripe(secret) : null;
const cryptoProvider = Stripe.createSubtleCryptoProvider();

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response(null, { status: 405 });
  if (!stripe || !endpointSecret || !prices.size) return new Response(null, { status: 503 });
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response(null, { status: 400 });

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      await request.text(),
      signature,
      endpointSecret,
      undefined,
      cryptoProvider,
    );
  } catch {
    return new Response(null, { status: 400 });
  }

  if (event.type === "charge.refunded" || event.type === "charge.dispute.created") {
    try {
      const object = event.data.object;
      const charge =
        object.object === "charge"
          ? object
          : await stripe.charges.retrieve(
              typeof object.charge === "string" ? object.charge : object.charge.id,
            );
      // A partial refund is a goodwill credit; access ends on a full refund.
      if (
        (event.type === "charge.dispute.created" || charge.refunded) &&
        typeof charge.customer === "string"
      ) {
        const { error } = await admin.rpc("end_stripe_period", {
          stripe_customer_id: charge.customer,
        });
        if (error) throw error;
      }
      return new Response(null, { status: 204 });
    } catch {
      console.error("Stripe refund reconciliation failed", event.id);
      return new Response(null, { status: 500 });
    }
  }
  if (event.type !== "invoice.paid") return new Response(null, { status: 204 });
  try {
    // Retrieve using the SDK's pinned API version so invoice fields don't
    // depend on the version configured on the webhook destination.
    const invoice = await stripe.invoices.retrieve(event.data.object.id);
    const lines = invoice.lines.has_more
      ? await stripe.invoices
          .listLineItems(invoice.id, { limit: 100 })
          .autoPagingToArray({ limit: 1000 })
      : invoice.lines.data;
    const period = paidPeriod(invoice, lines, prices);
    if (period) {
      const { error } = await admin.rpc("record_stripe_paid_period", period);
      if (error) throw error;
    }
    return new Response(null, { status: 204 });
  } catch {
    console.error("Stripe invoice reconciliation failed", event.id);
    return new Response(null, { status: 500 });
  }
});
