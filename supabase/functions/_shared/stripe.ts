import Stripe from "stripe";

export function createStripe(key: string): Stripe {
  return new Stripe(key, {
    httpClient: Stripe.createFetchHttpClient(),
    timeout: 8_000,
    maxNetworkRetries: 1,
  });
}
