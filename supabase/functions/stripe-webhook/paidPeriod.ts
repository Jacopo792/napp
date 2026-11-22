import type Stripe from "stripe";

export function paidPeriod(
  invoice: Stripe.Invoice,
  lines: Stripe.InvoiceLineItem[],
  prices: ReadonlySet<string>,
) {
  const customer = invoice.customer;
  const subscription = invoice.parent?.subscription_details?.subscription;
  if (invoice.status !== "paid" || typeof customer !== "string" || typeof subscription !== "string")
    return null;
  const ends = lines
    .filter((line) => {
      const item = line.parent?.subscription_item_details;
      const price = line.pricing?.price_details?.price;
      return (
        item?.subscription === subscription &&
        !item.proration &&
        typeof price === "string" &&
        prices.has(price)
      );
    })
    .map((line) => line.period.end);
  if (!ends.length) return null;
  return {
    stripe_customer_id: customer,
    stripe_subscription_id: subscription,
    paid_through: new Date(Math.max(...ends) * 1000).toISOString(),
  };
}
