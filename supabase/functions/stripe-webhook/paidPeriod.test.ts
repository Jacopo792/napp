import assert from "node:assert/strict";
import { test } from "node:test";
import type Stripe from "stripe";
import { paidPeriod } from "./paidPeriod.ts";

const prices = new Set(["price_year", "price_month"]);
const invoice = {
  status: "paid",
  customer: "cus_napp",
  parent: { subscription_details: { subscription: "sub_napp" } },
} as Stripe.Invoice;

function line(price: string, end: number, proration = false, subscription = "sub_napp") {
  return {
    parent: { subscription_item_details: { subscription, proration } },
    pricing: { price_details: { price } },
    period: { end },
  } as Stripe.InvoiceLineItem;
}

for (const price of prices) {
  test(`grants access through the latest paid period for ${price}`, () => {
    const end = 1_800_000_000;
    assert.deepEqual(
      paidPeriod(
        invoice,
        [
          line(price, end),
          line(price, end - 100),
          line(price, end + 500, true),
          line(price, end + 500, false, "sub_other"),
          line("price_other", end + 500),
        ],
        prices,
      ),
      {
        stripe_customer_id: "cus_napp",
        stripe_subscription_id: "sub_napp",
        paid_through: new Date(end * 1000).toISOString(),
      },
    );
  });
}

test("ignores unpaid invoices and paid invoices for other products", () => {
  assert.equal(paidPeriod({ ...invoice, status: "open" }, [line("price_year", 100)], prices), null);
  assert.equal(paidPeriod(invoice, [line("price_other", 100)], prices), null);
});
