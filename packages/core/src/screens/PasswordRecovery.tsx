import { useEffect, useRef, useState, type FormEvent } from "react";
import { passwordRecovery } from "@/lib/passwordRecovery";
import { PolicyLinks } from "@/components/PolicyLinks";
import "@/components/accountDeletion.css";

export default function PasswordRecovery() {
  const [recovery] = useState(passwordRecovery);
  const [fragment] = useState(() => window.location.hash);
  const started = useRef<Promise<void> | null>(null);
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!fragment) return;
    // After capture, so StrictMode's repeated initializer sees the same value.
    // Tokens must not remain in browser history or outgoing links.
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    let live = true;
    started.current ??= recovery.verify(fragment);
    void started.current.then(
      () => live && setReady(true),
      (reason: Error) => live && setError(reason.message),
    );
    return () => {
      live = false;
    };
  }, [fragment, recovery]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (ready) {
        if (password !== repeat) throw new Error("The two passwords are different.");
        await recovery.save(password);
        setPassword("");
        setRepeat("");
        setReady(false);
        setDone(true);
        setMessage("Password updated. Return to Napp and sign in with your new password.");
      } else {
        await recovery.request(email);
        setMessage(
          "If an account uses this address, you will receive a recovery email. Check your inbox and spam folder.",
        );
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not recover this account.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="account-deletion-page">
      <h1>Reset your Napp password</h1>
      <form className="account-deletion" onSubmit={(event) => void submit(event)}>
        {ready ? (
          <>
            <label>
              New password
              <input
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={busy}
              />
            </label>
            <label>
              Repeat password
              <input
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={repeat}
                onChange={(event) => setRepeat(event.target.value)}
                disabled={busy}
              />
            </label>
          </>
        ) : !done ? (
          <label>
            Account email
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={busy}
            />
          </label>
        ) : null}
        {error ? <p role="alert">{error}</p> : null}
        {message ? <p role="status">{message}</p> : null}
        {!done ? (
          <button
            style={{ color: "var(--ink)" }}
            disabled={busy || (ready ? !password || !repeat : !email.trim())}
          >
            {busy ? "Please wait…" : ready ? "Save new password" : "Send recovery email"}
          </button>
        ) : null}
        <PolicyLinks />
      </form>
    </main>
  );
}
