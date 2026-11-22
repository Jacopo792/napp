import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  ChevronRight,
  ExternalLink,
  FileText,
  Key,
  LifeBuoy,
  Mail,
  ShieldCheck,
  Sparkle,
  Trash2,
} from "@/components/icons";
import { AccountDeletionForm } from "@/components/AccountDeletionForm";
import { UpgradeSheet } from "@/components/UpgradeSheet";
import { checkoutUrl } from "@/lib/checkout";
import { platform } from "@/platform";
import type { AccountPlan } from "@/lib/plan";
import { passwordRecovery } from "@/lib/passwordRecovery";
import { changePassword } from "@/lib/session";
import { AccountField } from "@/components/AccountField";
import { EmailChange } from "@/components/EmailChange";
import { policyUrl } from "@/lib/storePolicies";
import { OVERLAY_IN, OVERLAY_OUT } from "@/lib/motion";

const still = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const ARRIVE: Keyframe[] = [
  { opacity: 0, transform: "translateY(6px) scale(0.98)" },
  { opacity: 1, transform: "none" },
];

/** A small window over Settings for one change. Escape and a press outside
 *  close it without closing Settings underneath. */
function AccountDialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: (close: () => void) => ReactNode;
}) {
  const ground = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLElement>(null);
  const leaving = useRef(false);

  useLayoutEffect(() => {
    if (still()) return;
    const rise = card.current?.animate(ARRIVE, OVERLAY_IN);
    const fade = ground.current?.animate([{ opacity: 0 }, { opacity: 1 }], OVERLAY_IN);
    return () => {
      rise?.cancel();
      fade?.cancel();
    };
  }, []);

  const close = useCallback(() => {
    if (leaving.current) return;
    leaving.current = true;
    if (still() || !card.current || !ground.current) return onClose();
    const options = { ...OVERLAY_OUT, fill: "forwards" as const };
    card.current.animate([...ARRIVE].reverse(), options);
    const out = ground.current.animate([{ opacity: 1 }, { opacity: 0 }], options);
    const fallback = window.setTimeout(onClose, OVERLAY_OUT.duration + 150);
    void out.finished.then(() => {
      window.clearTimeout(fallback);
      onClose();
    });
  }, [onClose]);

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

  return createPortal(
    <div
      ref={ground}
      className="account-dialog-ground"
      onMouseDown={(event) => event.target === event.currentTarget && close()}
    >
      <section ref={card} className="account-dialog" role="dialog" aria-modal aria-label={title}>
        <h2>{title}</h2>
        {children(close)}
      </section>
    </div>,
    document.body,
  );
}

function PasswordForm({ email, close }: { email: string; close: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const run = async (task: () => Promise<void>, success: string) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await task();
      setDone(success);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Something went wrong. Try again");
    } finally {
      setBusy(false);
    }
  };

  if (done)
    return (
      <>
        <p className="account-dialog-status" role="status">
          {done}
        </p>
        <div className="account-dialog-actions">
          <button type="button" className="is-primary press" onClick={close}>
            Done
          </button>
        </div>
      </>
    );

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void run(() => changePassword(email, current, next), "Your password is changed.");
      }}
    >
      <AccountField
        label="Current password"
        type="password"
        autoComplete="current-password"
        required
        autoFocus
        disabled={busy}
        value={current}
        onChange={(event) => setCurrent(event.target.value)}
      />
      <AccountField
        label="New password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        required
        disabled={busy}
        placeholder="At least 8 characters"
        value={next}
        onChange={(event) => setNext(event.target.value)}
      />
      <button
        type="button"
        className="account-dialog-link press"
        disabled={busy}
        onClick={() =>
          void run(() => passwordRecovery().request(email), `Open the link sent to ${email}.`)
        }
      >
        Forgot it? Email me a link
      </button>
      {error && (
        <p className="account-dialog-error" role="alert">
          {error}
        </p>
      )}
      <div className="account-dialog-actions">
        <button type="button" className="press" disabled={busy} onClick={close}>
          Cancel
        </button>
        <button type="submit" className="is-primary press" disabled={busy}>
          {busy ? "Saving…" : "Change password"}
        </button>
      </div>
    </form>
  );
}

function Row({
  icon,
  label,
  value,
  danger,
  trailing = <ChevronRight size={16} />,
  onClick,
  href,
}: {
  icon: ReactNode;
  label: string;
  value?: string;
  danger?: boolean;
  trailing?: ReactNode;
  onClick?: () => void;
  href?: string;
}) {
  const inner = (
    <>
      <span className="account-tile" aria-hidden="true">
        {icon}
      </span>
      <span className={`account-row-label ${danger ? "is-danger" : ""}`}>{label}</span>
      {value && <span className="account-row-value">{value}</span>}
      {(onClick || href) && (
        <span className="account-row-trailing" aria-hidden="true">
          {trailing}
        </span>
      )}
    </>
  );
  return href ? (
    <a className="account-row" href={href} target="_blank" rel="noopener noreferrer">
      {inner}
    </a>
  ) : (
    <button type="button" className="account-row" onClick={onClick} disabled={!onClick}>
      {inner}
    </button>
  );
}

type Open = "plans" | "email" | "password" | "delete" | null;

/** Account as the phone lays out Settings: a few named groups, a
 *  glyph per row, and every change in a window of its own. */
export function AccountSettings({
  email,
  plan,
  onErased,
}: {
  email?: string;
  plan?: AccountPlan;
  onErased?: () => void;
}) {
  const [open, setOpen] = useState<Open>(null);
  const checkout = checkoutUrl();
  const shut = () => setOpen(null);
  const days = plan?.days_left ?? null;
  const planName = !plan
    ? "Plan"
    : days != null
      ? "Plus trial"
      : plan.plan === "plus"
        ? "Plus"
        : "Free";
  const planValue = !plan
    ? "Unavailable"
    : days != null
      ? `${days} ${days === 1 ? "day" : "days"} left`
      : plan.plan === "free"
        ? "See plans"
        : plan.access_ends_at
          ? `Through ${new Date(plan.access_ends_at).toLocaleDateString(undefined, { dateStyle: "medium" })}`
          : undefined;

  return (
    <div className="account-groups">
      <h3>Plan</h3>
      <div className="account-group">
        <Row
          icon={<Sparkle size={16} />}
          label={planName}
          value={planValue}
          onClick={plan ? () => setOpen("plans") : undefined}
        />
      </div>

      {email && (
        <>
          <h3>Sign-in</h3>
          <div className="account-group">
            <Row
              icon={<Mail size={16} />}
              label="Email"
              value={email}
              onClick={() => setOpen("email")}
            />
            <Row icon={<Key size={16} />} label="Password" onClick={() => setOpen("password")} />
          </div>
        </>
      )}

      <h3>More</h3>
      <div className="account-group">
        <Row
          icon={<ShieldCheck size={16} />}
          label="Privacy"
          href={policyUrl("privacy")}
          trailing={<ExternalLink size={15} />}
        />
        <Row
          icon={<FileText size={16} />}
          label="Terms"
          href={policyUrl("terms")}
          trailing={<ExternalLink size={15} />}
        />
        <Row
          icon={<LifeBuoy size={16} />}
          label="Support"
          href={policyUrl("support")}
          trailing={<ExternalLink size={15} />}
        />
        <Row
          icon={<Trash2 size={16} />}
          label="Delete account"
          danger
          onClick={() => setOpen("delete")}
        />
      </div>

      {open === "plans" && plan && (
        <UpgradeSheet
          account={plan}
          onCheckout={
            checkout
              ? (interval) => {
                  const url = checkoutUrl(interval);
                  if (!url) return;
                  if (platform().kind === "web") window.location.assign(url);
                  else window.open(url, "_blank", "noreferrer");
                }
              : undefined
          }
          onManage={
            checkout
              ? () => {
                  const url = new URL(checkout);
                  url.searchParams.set("manage", "1");
                  if (platform().kind === "web") window.location.assign(url.href);
                  else window.open(url.href, "_blank", "noreferrer");
                }
              : undefined
          }
          onClose={shut}
        />
      )}
      {open === "email" && email && (
        <AccountDialog title="Change email" onClose={shut}>
          {(close) => <EmailChange email={email} close={close} />}
        </AccountDialog>
      )}
      {open === "password" && email && (
        <AccountDialog title="Change password" onClose={shut}>
          {(close) => <PasswordForm email={email} close={close} />}
        </AccountDialog>
      )}
      {open === "delete" && (
        <AccountDialog title="Delete account" onClose={shut}>
          {(close) => (
            <AccountDeletionForm accountEmail={email} onErased={onErased} onCancel={close} />
          )}
        </AccountDialog>
      )}
    </div>
  );
}
