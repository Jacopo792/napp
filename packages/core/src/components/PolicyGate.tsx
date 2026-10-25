import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabaseClient";
import { acceptPolicies, loadPolicyAcceptance } from "@/lib/policyAcceptance";
import { PolicyLinks } from "./PolicyLinks";
import "./accountDeletion.css";

/** Existing accounts must accept the same rules before creating more UGC. */
export function PolicyGate({ children }: { children: ReactNode }) {
  const [accepted, setAccepted] = useState(false);
  const [userId, setUserId] = useState("");
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [asked, setAsked] = useState(false);
  useEffect(() => {
    let live = true;
    void (async () => {
      const current = await supabase.auth.getUser();
      if (current.error) throw new Error("Account unavailable");
      if (!current.data.user) {
        if (live) setAccepted(true);
        return;
      }
      const result = await loadPolicyAcceptance(current.data.user.id);
      if (live) {
        setUserId(current.data.user.id);
        setAccepted(result);
      }
    })()
      .catch(() => {
        if (live) setError("Could not load your account. Please try again.");
      })
      .finally(() => {
        if (live) {
          setBusy(false);
          setAsked(true);
        }
      });
    return () => {
      live = false;
    };
  }, [attempt]);
  if (accepted) return children;
  /* Nothing until Auth has answered: a form flashed on every load at somebody
     who agreed long ago reads as being asked again. */
  if (!asked) return null;
  return (
    <main className="account-deletion-page">
      <h1>Before you continue</h1>
      <div className="account-deletion">
        <p>Read Napp's terms and privacy policy before creating or sharing content.</p>
        <PolicyLinks />
        <label className="account-deletion-confirm">
          <input
            type="checkbox"
            disabled={busy}
            checked={checked}
            onChange={(event) => setChecked(event.target.checked)}
          />
          I agree to the Terms of Use and have read the Privacy Policy.
        </label>
        {error ? <p role="alert">{error}</p> : null}
        {error && !userId ? (
          <button
            onClick={() => {
              setError("");
              setBusy(true);
              setAttempt((n) => n + 1);
            }}
          >
            Try again
          </button>
        ) : (
          <button
            disabled={busy || !checked || !userId}
            onClick={() => {
              setBusy(true);
              setError("");
              void acceptPolicies(userId)
                .then(() => setAccepted(true))
                .catch((reason: Error) => setError(reason.message))
                .finally(() => setBusy(false));
            }}
          >
            {busy ? "Checking…" : "Agree and continue"}
          </button>
        )}
      </div>
    </main>
  );
}
