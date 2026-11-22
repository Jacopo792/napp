import { platform } from "@/platform";

export type Interval = "month" | "year";

/* ponytail: prices are the 2026-11-22 proposal, not final; Stripe's session
   is what is charged, these only label the choice before it loads. */
export const PLUS_PRICE: Record<Interval, { amount: number; per: string; note: string }> = {
  month: { amount: 4, per: "per month", note: "Billed monthly" },
  year: { amount: 3, per: "per month", note: "36 € billed yearly" },
};

/** The web checkout for Plus, when the build has one: the in-app Stripe page
    on web, the same page in the browser from the desktop. */
export function checkoutUrl(interval: Interval = "year") {
  if (!import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY) return null;
  try {
    const url = new URL(
      (import.meta.env.VITE_PREVIEW_CHECKOUT_URL as string | undefined) ||
        (platform().kind === "web"
          ? new URL(import.meta.env.BASE_URL, window.location.origin).href
          : platform().webOrigin()),
    );
    url.search = `?action=billing&interval=${interval}`;
    if (platform().kind === "web" || import.meta.env.VITE_PREVIEW_CHECKOUT_URL) return url.href;
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}
