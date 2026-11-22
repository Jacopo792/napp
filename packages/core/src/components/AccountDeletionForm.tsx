import { useRef, useState, type FormEvent } from "react";
import {
  ACCOUNT_DELETION_CONSEQUENCES,
  eraseAccount,
  eraseAccountWithPassword,
  type AccountErasureReceipt,
} from "@/lib/accountDeletion";
import { purgeErasedAccount } from "@/lib/erasureLocal";
import { clearSession } from "@/lib/session";
import { SESSION_KEY } from "@/lib/sessionRestore";
import { supabase } from "@/lib/supabaseClient";
import "./accountDeletion.css";
import { useAuthCaptcha } from "@/lib/useAuthCaptcha";
import { PolicyLinks } from "./PolicyLinks";

export function AccountDeletionForm({
  accountEmail,
  onErased,
  onCancel,
}: {
  accountEmail?: string;
  onErased?: () => void;
  /** Given by Settings, which draws the form in its own rows. */
  onCancel?: () => void;
}) {
  const captcha = useAuthCaptcha();
  const reauth = useAuthCaptcha();
  const captchaReady = onCancel ? captcha.ready : captcha.ready && reauth.ready;
  const [email, setEmail] = useState(accountEmail ?? "");
  const [password, setPassword] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<AccountErasureReceipt | null>(null);
  const submitting = useRef(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting.current || !confirmed || !password || !email.trim() || !captchaReady) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const key = `napp:erasure-receipt:${email.trim().toLowerCase()}`;
      const token = sessionStorage.getItem(key) ?? crypto.randomUUID();
      sessionStorage.setItem(key, token);
      const current = (await supabase.auth.getSession()).data.session?.user;
      if (onCancel && current?.email?.toLowerCase() !== email.trim().toLowerCase())
        throw new Error("Sign in to this account again.");
      const result =
        onCancel && current
          ? await eraseAccount(current.id, password, token, supabase, captcha.token)
          : await eraseAccountWithPassword(email, password, token, captcha.token, reauth.token);
      setPassword("");
      let storedEmail: string | undefined;
      try {
        storedEmail = JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null")?.email;
      } catch {
        /* malformed navigation cache */
      }
      const activeEmail = current?.email ?? storedEmail;
      if ("userId" in result && typeof result.userId === "string")
        await purgeErasedAccount(result.userId);
      if (result.status === "completed") sessionStorage.removeItem(key);
      setReceipt(result);
      if (activeEmail?.toLowerCase() === email.trim().toLowerCase()) {
        if (current) await purgeErasedAccount(current.id);
        await clearSession();
        onErased?.();
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not delete this account");
    } finally {
      captcha.reset();
      reauth.reset();
      setBusy(false);
      submitting.current = false;
    }
  };

  if (receipt)
    return (
      <div className="account-deletion" role="status">
        <h2>{receipt.status === "completed" ? "Account deleted" : "Deletion in progress"}</h2>
        <p>
          {receipt.status === "completed"
            ? "Your account has been deleted. Other people’s documents and retained safety evidence may remain."
            : "Deletion continues automatically. You do not need to keep this page open."}
        </p>
      </div>
    );

  const ready = !busy && captchaReady && confirmed && Boolean(password) && Boolean(email.trim());

  /* Inside Settings: the account is already known, and the policy links sit
     in the row above, so neither is asked for again. */
  if (onCancel)
    return (
      <form className="account-deletion-rows" onSubmit={(event) => void submit(event)}>
        <p className="account-deletion-consequences">{ACCOUNT_DELETION_CONSEQUENCES}</p>
        <input type="email" autoComplete="username" value={email} readOnly hidden />
        <label className="appearance-row">
          Password
          <input
            className="profile-field"
            type="password"
            autoComplete="current-password"
            required
            autoFocus
            disabled={busy}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <label className="appearance-row account-deletion-check">
          <input
            type="checkbox"
            checked={confirmed}
            disabled={busy}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          Delete my notes too, including shared ones
        </label>
        {error ? (
          <p className="account-deletion-consequences text-danger" role="alert">
            {error}
          </p>
        ) : null}
        {captcha.widget}
        <div className="appearance-row account-deletion-actions">
          <button type="button" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="is-danger" disabled={!ready}>
            {busy ? "Deleting…" : "Delete Account"}
          </button>
        </div>
      </form>
    );

  return (
    <form className="account-deletion is-erase" onSubmit={(event) => void submit(event)}>
      <p className="account-deletion-warning">{ACCOUNT_DELETION_CONSEQUENCES}</p>
      <label>
        Email
        <input
          type="email"
          autoComplete="username"
          required
          readOnly={Boolean(accountEmail)}
          disabled={busy}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
      <label>
        Account password
        <input
          type="password"
          autoComplete="current-password"
          required
          disabled={busy}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      <label className="account-deletion-confirm">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={busy}
          onChange={(event) => setConfirmed(event.target.checked)}
        />
        Delete my account and my notes permanently, including my shared notes.
      </label>
      {error ? (
        <p className="text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {captcha.widget}
      {reauth.widget}
      <button type="submit" disabled={!ready}>
        {busy ? "Deleting…" : "Delete account permanently"}
      </button>
      <PolicyLinks />
    </form>
  );
}
