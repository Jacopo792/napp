import { Link } from "@tanstack/react-router";
import {
  CheckoutElementsProvider,
  PaymentElement,
  useCheckoutElements,
} from "@stripe/react-stripe-js/checkout";
import type { Appearance } from "@stripe/stripe-js";
import { loadStripe } from "@stripe/stripe-js/pure";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";
import { ChevronLeft, Lock } from "@/components/icons";
import { PLUS_PRICE, type Interval } from "@/lib/checkout";
import { supabase } from "@/lib/supabaseClient";
import { loadAccountPlan } from "@/lib/plan";
import { stickerUrl } from "@/lib/stickers";
import { platform } from "@/platform";
import Login from "./Login";
import "./checkout.css";

const key = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;
const YEAR = PLUS_PRICE.year.amount * 12;

type Checkout = { clientSecret: string; email: string } | { status: "manage" | "active" };

async function billing<T>(action: "checkout" | "portal", interval?: Interval) {
  const { data, error } = await supabase.functions.invoke<T>("stripe-billing", {
    body: { action, interval },
  });
  if (error || !data) throw new Error("Billing is temporarily unavailable. Try again.");
  return data;
}

/** Stripe's fields in the palette chosen in Settings, read from checkout.css. */
function appearance(): Appearance {
  const stage = document.querySelector(".checkout-stage") ?? document.documentElement;
  const css = getComputedStyle(stage);
  const token = (name: string) => css.getPropertyValue(name).trim();
  return {
    theme: "night",
    variables: {
      colorPrimary: token("--co-accent"),
      colorBackground: token("--co-stage"),
      colorText: token("--co-ink"),
      colorTextSecondary: token("--co-ink-2"),
      colorTextPlaceholder: token("--co-ink-3"),
      colorDanger: token("--co-danger"),
      fontFamily: token("--font-sans"),
      borderRadius: "10px",
      spacingUnit: "4px",
    },
    rules: {
      ".Input": { border: `1px solid ${token("--co-line")}`, boxShadow: "none" },
      ".Input:focus": { borderColor: token("--co-accent"), boxShadow: "none" },
      ".Label": { color: token("--co-ink-2"), fontSize: "13px" },
      ".Tab": { border: `1px solid ${token("--co-line")}`, boxShadow: "none" },
    },
  };
}

const euro = (value: number) => `${value} €`;
const amount = new Intl.NumberFormat(undefined, { style: "currency", currency: "EUR" }).format;

function Stage({ children }: { children: ReactNode }) {
  return (
    <main className="checkout-stage checkout-night">
      <Link to="/notes" className="checkout-back">
        <ChevronLeft size={14} /> Back
      </Link>
      {/* Enters once; what changes inside (skeleton, period, fields) never replays it. */}
      <div className="checkout-enter">{children}</div>
    </main>
  );
}

function Note({
  sticker,
  title,
  children,
}: {
  sticker?: string;
  title: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="checkout-note" role="status">
      {sticker && <img className="checkout-sticker" src={stickerUrl(sticker)!} alt="" />}
      <h1>{title}</h1>
      {children}
    </section>
  );
}

type ChangePeriod = (next: Interval, indicatorOffset: number) => void;

function Periods({
  value,
  onChange,
  motionFrom,
}: {
  value: Interval;
  onChange: ChangePeriod;
  motionFrom?: number;
}) {
  const track = useRef<HTMLDivElement>(null);
  const indicator = useRef<HTMLSpanElement>(null);
  return (
    <div
      className="checkout-periods"
      ref={track}
      data-interval={value}
      role="radiogroup"
      aria-label="Billing period"
    >
      <span
        key={value}
        className="checkout-period-indicator"
        ref={indicator}
        aria-hidden="true"
        data-moving={motionFrom === undefined ? undefined : ""}
        style={
          motionFrom === undefined
            ? undefined
            : ({ "--period-from": `${motionFrom}px` } as CSSProperties)
        }
      />
      {(["month", "year"] as const).map((interval) => (
        <button
          key={interval}
          type="button"
          role="radio"
          aria-checked={value === interval}
          className="checkout-period"
          onClick={() => {
            const left = track.current?.getBoundingClientRect().left ?? 0;
            const marker = indicator.current?.getBoundingClientRect().left ?? left;
            onChange(interval, marker - left);
          }}
        >
          {interval === "year" && <span className="checkout-save">−25%</span>}
          <b>{euro(PLUS_PRICE[interval].amount)}</b> /month
          <br />
          {PLUS_PRICE[interval].note}
        </button>
      ))}
    </div>
  );
}

function Skeleton({ height, width }: { height: number; width?: string }) {
  return (
    <div className="skeleton checkout-skeleton" style={{ height, width }} aria-hidden="true" />
  );
}

/* The Payment Element's own outline: card number, expiry and CVC, country. */
function PaymentSkeleton() {
  const field = (
    <div style={{ display: "grid", gap: 6 }}>
      <Skeleton height={19.5} width="38%" />
      <Skeleton height={44} />
    </div>
  );
  return (
    <div className="checkout-placeholder" style={{ display: "grid", gap: 12 }} aria-hidden="true">
      {field}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {field}
        {field}
      </div>
      {field}
    </div>
  );
}

/** Both columns. The summary never empties: until Stripe answers it shows
    the listed price, then the session's own total. */
function Layout({
  interval,
  onInterval,
  payment,
  total,
  planPrice,
  error,
  action,
  onSubmit,
  motionFrom,
}: {
  interval: Interval;
  onInterval: ChangePeriod;
  payment: ReactNode;
  total?: string;
  planPrice?: string;
  error?: string;
  action: ReactNode;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  motionFrom?: number;
}) {
  const yearly = interval === "year";
  const price = yearly ? YEAR : PLUS_PRICE.month.amount;
  return (
    <form className="checkout-card" onSubmit={onSubmit ?? ((event) => event.preventDefault())}>
      <section className="checkout-pay">
        <h1>Checkout</h1>
        <Periods value={interval} onChange={onInterval} motionFrom={motionFrom} />
        <span className="checkout-label">Pay with</span>
        {payment}
      </section>
      <aside className="checkout-summary">
        <span className="checkout-plan">
          Napp <span className="serif">Plus</span>
        </span>
        <span className="checkout-price">
          {planPrice ?? euro(price)} <small>/{interval}</small>
        </span>
        <div className="checkout-rule" />
        <div className="checkout-row">
          <span>{yearly ? "Yearly plan" : "Monthly plan"}</span>
          <span>{planPrice ?? amount(price)}</span>
        </div>
        <div className="checkout-row is-total">
          <span>Due today</span>
          <span>{total ?? amount(price)}</span>
        </div>
        <p className="checkout-terms">
          Renews every {interval} until you cancel. Cancel anytime from Settings › Account; Plus
          stays until the end of the paid period.{" "}
          <a href="https://about.nappnote.com/terms/" target="_blank" rel="noreferrer">
            Terms
          </a>{" "}
          ·{" "}
          <a href="https://about.nappnote.com/privacy/" target="_blank" rel="noreferrer">
            Privacy
          </a>
        </p>
        {error && (
          <p className="checkout-error" role="alert">
            {error}
          </p>
        )}
        {action}
        <span className="checkout-secure">
          <Lock size={13} /> Payments are handled by Stripe
        </span>
      </aside>
    </form>
  );
}

function Loading({
  interval,
  onInterval,
  motionFrom,
}: {
  interval: Interval;
  onInterval: ChangePeriod;
  motionFrom?: number;
}) {
  return (
    <Layout
      interval={interval}
      onInterval={onInterval}
      motionFrom={motionFrom}
      payment={<PaymentSkeleton />}
      action={
        <button type="button" className="checkout-pill" disabled>
          Opening secure payment…
        </button>
      }
    />
  );
}

function CheckoutForm({
  email,
  interval,
  onInterval,
  onComplete,
}: {
  email: string;
  interval: Interval;
  onInterval: ChangePeriod;
  onComplete: (id: string) => void;
}) {
  const state = useCheckoutElements();
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  if (state.type === "error")
    return (
      <Layout
        interval={interval}
        onInterval={onInterval}
        payment={<PaymentSkeleton />}
        error={state.error.message}
        action={null}
      />
    );
  const checkout = state.type === "loading" ? null : state.checkout;
  const line = checkout?.lineItems[0];
  const matchesPeriod =
    checkout?.lineItems.length === 1 &&
    line?.recurring?.interval === interval &&
    line.recurring.intervalCount === 1;
  const canSubmit = ready && matchesPeriod && checkout?.canConfirm;
  const total = matchesPeriod ? checkout.total.total.amount : undefined;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!checkout || !canSubmit || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await checkout.confirm({ email, redirect: "if_required" });
      if (result.type === "error") setError(result.error.message);
      else onComplete(result.session.id);
    } catch {
      setError("Couldn't confirm the payment. Check your connection and try again.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  /* The Element mounts hidden under its skeleton and is shown when it says
     it is ready, so the swap is one fade and nothing moves. */
  return (
    <Layout
      interval={interval}
      onInterval={(next, offset) => {
        if (!submitting.current) onInterval(next, offset);
      }}
      total={total}
      planPrice={matchesPeriod ? line?.unitAmount.amount : undefined}
      error={
        checkout && !matchesPeriod
          ? "This billing period is unavailable. Choose another plan."
          : error
      }
      onSubmit={submit}
      payment={
        <div style={{ display: "grid" }}>
          {!ready && (
            <div style={{ gridArea: "1 / 1" }}>
              <PaymentSkeleton />
            </div>
          )}
          {checkout && (
            <div
              className={ready ? "checkout-ready" : undefined}
              style={{ gridArea: "1 / 1", visibility: ready ? "visible" : "hidden" }}
            >
              <PaymentElement
                options={{ layout: "tabs", paymentMethodOrder: ["card"] }}
                onReady={() => setReady(true)}
              />
            </div>
          )}
        </div>
      }
      action={
        <button type="submit" className="checkout-pill" disabled={busy || !canSubmit}>
          {busy
            ? "Confirming…"
            : ready && total
              ? `Subscribe · ${total}`
              : ready
                ? "Subscribe"
                : "Opening secure payment…"}
        </button>
      }
    />
  );
}

function PaymentStatus({ reset }: { reset: () => void }) {
  const [status, setStatus] = useState<"pending" | "active" | "waiting">("pending");
  const [renews, setRenews] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const until = Date.now() + 30_000;
    async function refresh() {
      const plan = await loadAccountPlan().catch(() => null);
      if (!alive) return;
      if (plan?.plan === "plus" && plan.stripe_billing) {
        setRenews(plan.access_ends_at);
        setStatus("active");
      } else if (Date.now() >= until) setStatus("waiting");
      else timer = setTimeout(() => void refresh(), 2_000);
    }
    void refresh();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [attempt]);

  if (status === "active")
    return (
      <Note
        sticker="cat.hi"
        title={
          <>
            Welcome to <span className="serif">Plus.</span>
          </>
        }
      >
        {renews && (
          <p>
            Renews on {new Date(renews).toLocaleDateString(undefined, { dateStyle: "medium" })} ·
            the receipt is in your email
          </p>
        )}
        <Link to="/notes" className="checkout-pill">
          Back to your notes
        </Link>
      </Note>
    );
  if (status === "waiting")
    return (
      <Note title="Still confirming">
        <p>Your bank hasn't confirmed the payment yet. Nothing is charged twice.</p>
        <button
          className="checkout-pill"
          onClick={() => {
            setStatus("pending");
            setAttempt((value) => value + 1);
          }}
        >
          Check again
        </button>
        <button className="checkout-back" style={{ position: "static" }} onClick={reset}>
          Return to checkout
        </button>
      </Note>
    );
  return (
    <Note
      title={
        <>
          Activating <span className="serif">Plus…</span>
        </>
      }
    >
      <p>This takes a few seconds.</p>
    </Note>
  );
}

function BillingAccount() {
  const query = new URLSearchParams(window.location.search);
  const manage = query.get("manage") === "1";
  const [interval, setInterval] = useState<Interval>(
    query.get("interval") === "month" ? "month" : "year",
  );
  const [sessionId, setSessionId] = useState(query.get("session_id"));
  const [motionFrom, setMotionFrom] = useState<number>();
  const [checkout, setCheckout] = useState<Checkout>();
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (sessionId || manage) return;
    let alive = true;
    setCheckout(undefined);
    setError("");
    billing<Checkout>("checkout", interval).then(
      (result) => alive && setCheckout(result),
      (reason: Error) => alive && setError(reason.message),
    );
    return () => {
      alive = false;
    };
  }, [sessionId, manage, interval, attempt]);

  function choose(next: Interval, offset: number) {
    if (next === interval) return;
    setMotionFrom(offset);
    setCheckout(undefined);
    setError("");
    setInterval(next);
    const url = new URL(window.location.href);
    url.searchParams.set("interval", next);
    window.history.replaceState(window.history.state, "", url);
  }

  async function openPortal() {
    setBusy(true);
    setError("");
    try {
      const { url } = await billing<{ url: string }>("portal");
      window.location.assign(url);
    } catch {
      setError("Couldn't open subscription management. Try again.");
      setBusy(false);
    }
  }

  if (sessionId)
    return (
      <PaymentStatus
        reset={() => {
          const url = new URL(window.location.href);
          url.searchParams.delete("session_id");
          window.history.replaceState(window.history.state, "", url);
          setSessionId(null);
        }}
      />
    );
  if (manage || (checkout && "status" in checkout && checkout.status === "manage"))
    return (
      <Note title="Manage subscription">
        <p>Invoices, payment method and cancellation are in Stripe's billing portal.</p>
        {error && (
          <p className="checkout-error" role="alert">
            {error}
          </p>
        )}
        <button className="checkout-pill" disabled={busy} onClick={() => void openPortal()}>
          {busy ? "Opening…" : "Open billing portal"}
        </button>
      </Note>
    );
  if (checkout && "status" in checkout)
    return (
      <Note
        sticker="cat.hi"
        title={
          <>
            Plus is <span className="serif">on.</span>
          </>
        }
      >
        <Link to="/notes" className="checkout-pill">
          Back to your notes
        </Link>
      </Note>
    );
  return (
    <>
      {error ? (
        <Layout
          interval={interval}
          onInterval={choose}
          payment={<PaymentSkeleton />}
          error={error}
          action={
            <button
              type="button"
              className="checkout-pill"
              onClick={() => setAttempt((value) => value + 1)}
            >
              Try again
            </button>
          }
        />
      ) : checkout ? (
        <StripeCheckout
          key={checkout.clientSecret}
          clientSecret={checkout.clientSecret}
          email={checkout.email}
          interval={interval}
          onInterval={choose}
          onComplete={(id) => {
            const url = new URL(window.location.href);
            url.searchParams.set("session_id", id);
            window.history.replaceState(window.history.state, "", url);
            setSessionId(id);
          }}
        />
      ) : (
        <Loading interval={interval} onInterval={choose} motionFrom={motionFrom} />
      )}
    </>
  );
}

function StripeCheckout({
  clientSecret,
  email,
  interval,
  onInterval,
  onComplete,
}: {
  clientSecret: string;
  email: string;
  interval: Interval;
  onInterval: ChangePeriod;
  onComplete: (id: string) => void;
}) {
  const [stripe] = useState(() => loadStripe(key!));
  const [style] = useState(appearance);
  return (
    <CheckoutElementsProvider
      stripe={stripe}
      options={{ clientSecret, defaultValues: { email }, elementsOptions: { appearance: style } }}
    >
      <CheckoutForm
        email={email}
        interval={interval}
        onInterval={onInterval}
        onComplete={onComplete}
      />
    </CheckoutElementsProvider>
  );
}

export default function Billing() {
  const [accountId, setAccountId] = useState<string | null>();
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setAccountId(session?.user && !session.user.is_anonymous ? session.user.id : null);
    });
    return () => subscription.unsubscribe();
  }, []);
  if (!key || platform().kind !== "web")
    return (
      <Stage>
        <Note title="Billing is unavailable">
          <Link to="/" className="checkout-pill">
            Back to Napp
          </Link>
        </Note>
      </Stage>
    );
  if (accountId === null) return <Login stayOnPage />;
  const pendingPeriod = new URLSearchParams(window.location.search).get("interval");
  return (
    <Stage>
      {accountId === undefined ? (
        <Loading interval={pendingPeriod === "month" ? "month" : "year"} onInterval={() => {}} />
      ) : (
        <BillingAccount key={accountId} />
      )}
    </Stage>
  );
}
