import { useState } from "react";
import { passwordRecovery } from "@/lib/passwordRecovery";
import { changePassword } from "@/lib/session";
import { AccountField } from "@/components/AccountField";
import { EmailChange } from "@/components/EmailChange";

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

export function CredentialSettings({ email }: { email: string }) {
  const [open, setOpen] = useState<"email" | "password" | null>(null);
  const close = () => setOpen(null);

  return (
    <>
      <div className="appearance-row">
        <span>Sign-in email</span>
        <button type="button" className="account-delete-open" onClick={() => setOpen("email")}>
          Change email…
        </button>
      </div>
      <div className="appearance-row">
        <span>Password</span>
        <button type="button" className="account-delete-open" onClick={() => setOpen("password")}>
          Change password…
        </button>
      </div>
      {open === "email" && <EmailChange email={email} close={close} />}
      {open === "password" && <PasswordForm email={email} close={close} />}
    </>
  );
}
