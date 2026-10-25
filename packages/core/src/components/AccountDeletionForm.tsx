import { useRef, useState, type FormEvent } from "react";
import {
  ACCOUNT_DELETION_CONSEQUENCES,
  eraseAccountWithPassword,
  type AccountErasureReceipt,
} from "@/lib/accountDeletion";
import { purgeErasedAccount } from "@/lib/erasureLocal";
import { clearSession } from "@/lib/session";
import { SESSION_KEY } from "@/lib/sessionRestore";
import { supabase } from "@/lib/supabaseClient";
import "./accountDeletion.css";
import { PolicyLinks } from "./PolicyLinks";

export function AccountDeletionForm({
  accountEmail,
  onErased,
}: {
  accountEmail?: string;
  onErased?: () => void;
}) {
  const [email, setEmail] = useState(accountEmail ?? "");
  const [password, setPassword] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<AccountErasureReceipt | null>(null);
  const submitting = useRef(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting.current || !confirmed || !password || !email.trim()) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const key = `napp:erasure-receipt:${email.trim().toLowerCase()}`;
      const token = sessionStorage.getItem(key) ?? crypto.randomUUID();
      sessionStorage.setItem(key, token);
      const result = await eraseAccountWithPassword(email, password, token);
      setPassword("");
      const current = (await supabase.auth.getSession()).data.session?.user;
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
            ? "Your account and its data have been deleted. Documents created by other people have been kept."
            : "Deletion continues automatically. You do not need to keep this page open."}
        </p>
      </div>
    );

  return (
    <form className="account-deletion" onSubmit={(event) => void submit(event)}>
      <p>{ACCOUNT_DELETION_CONSEQUENCES}</p>
      <PolicyLinks />
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
      <button type="submit" disabled={busy || !confirmed || !password || !email.trim()}>
        {busy ? "Deleting…" : "Delete account permanently"}
      </button>
    </form>
  );
}
