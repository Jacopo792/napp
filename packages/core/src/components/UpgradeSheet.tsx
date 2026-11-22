import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Books, History, Palette, Paperclip, Users, X } from "@/components/icons";
import { OVERLAY_IN, OVERLAY_OUT } from "@/lib/motion";
import { loadAccountPlan, type AccountPlan } from "@/lib/plan";
import { PLUS_PRICE, type Interval } from "@/lib/checkout";
import { SkeletonRows } from "@/components/Skeleton";
import "@/screens/checkout.css";

const still = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
/* The page never fades with opacity: that suspends its backdrop-filter, and
   the app behind showed through sharp for the length of the entrance. The
   glass deepens from a soft blur, and only the content
   fades. */
const GLASS: Keyframe[] = [
  {
    backgroundColor: "transparent",
    backdropFilter: "blur(12px) saturate(1)",
    WebkitBackdropFilter: "blur(12px) saturate(1)",
  },
  {},
];
const CONTENT: Keyframe[] = [{ opacity: 0 }, { opacity: 1 }];
const CONTENT_SELECTOR = ".plans-head, .plans-card-slot, .plans-foot";

/** Plus in the landing's shape and the Settings palette: one offer, the period above it, Free as a line. */
export function UpgradeSheet({
  account: cached,
  onCheckout,
  onManage,
  onClose,
}: {
  account: AccountPlan;
  onCheckout?: (interval: Interval) => void;
  onManage?: () => void;
  onClose: () => void;
}) {
  const [interval, setInterval] = useState<Interval>("year");
  const price = PLUS_PRICE[interval];
  /* Opened from a plan read earlier: ask again, so the trial days and the
     plan are the server's answer now. Its outline shows until then; if the
     request fails, the plan Settings already had stands. */
  const [fresh, setFresh] = useState<AccountPlan | null>();
  useEffect(() => {
    let alive = true;
    loadAccountPlan().then(
      (plan) => alive && setFresh(plan),
      () => alive && setFresh(null),
    );
    return () => {
      alive = false;
    };
  }, []);
  const account = fresh ?? cached;
  const loading = fresh === undefined;
  const onPlus = account.plan === "plus" && account.days_left == null;
  const trialDays = account.days_left;

  const page = useRef<HTMLDivElement>(null);
  const leaving = useRef(false);

  useLayoutEffect(() => {
    if (still()) return;
    const node = page.current;
    const glass = node?.animate(GLASS, OVERLAY_IN);
    const content = Array.from(node?.querySelectorAll(CONTENT_SELECTOR) ?? [], (part) =>
      part.animate(CONTENT, OVERLAY_IN),
    );
    return () => {
      glass?.cancel();
      content.forEach((animation) => animation.cancel());
    };
  }, []);

  const close = useCallback(() => {
    if (leaving.current) return;
    leaving.current = true;
    const node = page.current;
    if (!node || still()) return onClose();
    const leave = { ...OVERLAY_OUT, fill: "forwards" } as const;
    node.querySelectorAll(CONTENT_SELECTOR).forEach((part) => {
      part.animate([...CONTENT].reverse(), leave);
    });
    const out = node.animate([...GLASS].reverse(), leave);
    const fallback = window.setTimeout(onClose, OVERLAY_OUT.duration + 150);
    void out.finished.then(() => {
      window.clearTimeout(fallback);
      onClose();
    });
  }, [onClose]);

  /* Captured first and marked handled, so Settings underneath stays open. */
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      close();
    };
    window.addEventListener("keydown", escape, true);
    return () => window.removeEventListener("keydown", escape, true);
  }, [close]);

  const plus = (
    [
      [Books, "#e9965b", "Books and theses", "Readers inside, chapter by chapter"],
      [Users, "#9fd68b", "Groups of up to 8", "Only the creator pays"],
      [History, "#7cc3e8", "Every version, kept", "No 30-day limit on history"],
      [Paperclip, "#f2b13a", "20 GB of files", "Images, drawings and chat media"],
    ] as const
  ).map(([Icon, color, title, line]) => (
    <li key={title}>
      <span className="plans-icon" style={{ color }} aria-hidden="true">
        <Icon size={16} />
      </span>
      <span>
        <b>{title}</b>
        {line}
      </span>
    </li>
  ));

  return createPortal(
    <div
      ref={page}
      className="checkout-stage plans-page"
      role="dialog"
      aria-modal
      aria-label="Napp Plus"
    >
      <button
        type="button"
        className="checkout-back plans-close"
        aria-label="Close"
        autoFocus
        onClick={close}
      >
        <X size={14} />
      </button>
      <div className="plans">
        <header className="plans-head">
          <h1>
            Napp <span className="serif">Plus</span>
          </h1>
          <div className="plans-interval" role="radiogroup" aria-label="Billing period">
            <span className="plans-thumb" data-at={interval} aria-hidden="true" />
            <button
              type="button"
              role="radio"
              aria-checked={interval === "month"}
              onClick={() => setInterval("month")}
            >
              Monthly
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={interval === "year"}
              onClick={() => setInterval("year")}
            >
              Yearly <span>−25%</span>
            </button>
          </div>
        </header>

        <section
          className="plans-card"
          role={loading ? "status" : undefined}
          aria-label={loading ? "Loading plans" : undefined}
        >
          <div className="plans-card-slot">
            <div className="plans-offer" inert={loading}>
              <span className="plans-status">
                Plus
                {trialDays != null ? (
                  <em>
                    Trial · {trialDays} {trialDays === 1 ? "day" : "days"} left
                  </em>
                ) : onPlus ? (
                  <em>Your plan</em>
                ) : null}
              </span>
              <span className="plans-price" key={interval}>
                {price.amount} € <small>/month</small>
              </span>
              <span className="plans-note">{price.note}</span>
              {onPlus ? (
                account.stripe_billing && onManage ? (
                  <button type="button" className="checkout-pill" onClick={onManage}>
                    Manage subscription
                  </button>
                ) : (
                  <span className="checkout-pill plans-current">Your current plan</span>
                )
              ) : (
                <button
                  type="button"
                  className="checkout-pill"
                  disabled={!onCheckout}
                  onClick={() => onCheckout?.(interval)}
                >
                  {trialDays != null ? "Keep Plus" : "Get Plus"}
                </button>
              )}
            </div>
            {loading && (
              <div className="plans-offer plans-placeholder" aria-hidden="true">
                <div className="skeleton" style={{ height: 14, width: "46%" }} />
                <div
                  className="skeleton"
                  style={{ height: 46, width: "52%", margin: "6px 0 2px" }}
                />
                <div className="skeleton" style={{ height: 12, width: "40%", marginBottom: 14 }} />
                <div className="skeleton" style={{ height: 44 }} />
              </div>
            )}
          </div>
          <div className="plans-card-slot">
            <ul className="plans-features" inert={loading}>
              {plus}
            </ul>
            {loading && (
              <div className="plans-placeholder" aria-hidden="true">
                <SkeletonRows rows={4} lead />
              </div>
            )}
          </div>
          <div className="plans-card-slot plans-free-slot">
            <p className="plans-free" inert={loading}>
              <Palette size={14} aria-hidden="true" />
              {account.plan === "free" ? "You're on Free: " : "Free keeps "}
              every editor tool and theme, one group of two, 30 days of history and 1 GB of files.
            </p>
            {loading && (
              <div className="plans-free plans-placeholder" aria-hidden="true">
                <div className="skeleton" style={{ height: 20, width: "70%" }} />
              </div>
            )}
          </div>
        </section>
        <p className="plans-foot">
          Only a group&apos;s creator pays; invited people join free. Plans renew until you cancel.
        </p>
      </div>
    </div>,
    document.body,
  );
}
