import { useState, type FormEvent } from "react";
import { requestEmailChange } from "@/lib/session";
import { AccountField } from "@/components/AccountField";

export function EmailChange({ email, close }: { email: string; close: () => void }) {
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await requestEmailChange(email, next);
      setSent(next.trim());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not change the email");
    } finally {
      setBusy(false);
    }
  };

  if (sent)
    return (
      <>
        <p className="account-dialog-status" role="status">
          Open the links sent to {email} and {sent}.
        </p>
        <div className="account-dialog-actions">
          <button type="button" className="is-primary press" onClick={close}>
            Done
          </button>
        </div>
      </>
    );

  return (
    <form onSubmit={(event) => void submit(event)}>
      <AccountField label="Current email" type="email" value={email} readOnly tabIndex={-1} />
      <AccountField
        label="New email"
        type="email"
        autoComplete="email"
        required
        autoFocus
        disabled={busy}
        value={next}
        onChange={(event) => setNext(event.target.value)}
      />
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
          {busy ? "Sending…" : "Change email"}
        </button>
      </div>
    </form>
  );
}
