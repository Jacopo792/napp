/* Per tab (sessionStorage): a checkout opened from the desktop starts fresh.
   Stand-in for Stripe's Checkout Elements: the preview has no Stripe keys or
   backend, so the Payment Element is drawn locally and confirm() just flips
   the preview account to Plus (see plan.mock.ts). */
import { useEffect, type ReactNode } from "react";

export const PREVIEW_PLUS = "napp-preview-stripe-plus";
export const loadStripe = async () => ({});

let yearly = true;
export function CheckoutElementsProvider({
  children,
  options,
}: {
  children: ReactNode;
  options: { clientSecret: string };
}) {
  yearly = !options.clientSecret.endsWith("month");
  return <>{children}</>;
}

const checkout = {
  get total() {
    return {
      total: {
        amount: new Intl.NumberFormat(undefined, { style: "currency", currency: "EUR" }).format(
          yearly ? 36 : 4,
        ),
      },
    };
  },
  get lineItems() {
    return [{
      recurring: { interval: yearly ? "year" : "month", intervalCount: 1 },
      unitAmount: this.total.total,
    }];
  },
  canConfirm: true,
  confirm: async () => {
    await new Promise((done) => setTimeout(done, 1200));
    sessionStorage.setItem(PREVIEW_PLUS, "1");
    return { type: "success", session: { id: "cs_preview" } };
  },
};
export const useCheckoutElements = () => ({ type: "success", checkout });

const field = {
  display: "grid",
  gap: 6,
  fontSize: 13,
  color: "var(--co-ink-2)",
} as const;
const input = {
  padding: "12px 12px",
  borderRadius: 10,
  height: 44,
  width: "100%",
  border: "1px solid var(--co-line)",
  background: "var(--co-stage)",
  color: "var(--co-ink)",
  font: "inherit",
  fontSize: 15,
} as const;

export function PaymentElement({ onReady }: { onReady?: () => void }) {
  /* Stripe's iframe takes a moment; so does this, to show the skeleton. */
  useEffect(() => {
    const timer = setTimeout(() => onReady?.(), 900);
    return () => clearTimeout(timer);
  }, [onReady]);
  return (
    <div style={{ display: "grid", gap: 12 }} data-preview="stripe-payment-element">
      <label style={field}>
        Card number
        <input style={input} inputMode="numeric" defaultValue="4242 4242 4242 4242" />
      </label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <label style={field}>
          Expiration
          <input style={input} defaultValue="12 / 34" />
        </label>
        <label style={field}>
          CVC
          <input style={input} defaultValue="123" />
        </label>
      </div>
      <label style={field}>
        Country
        <select style={input} defaultValue="IT">
          <option value="IT">Italy</option>
        </select>
      </label>
    </div>
  );
}
