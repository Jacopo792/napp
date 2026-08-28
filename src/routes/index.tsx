import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, ArrowRight, ShieldCheck } from "lucide-react";
import { authenticate, unlockSession, type PendingUnlock } from "@/lib/session";

export const Route = createFileRoute("/")({ component: Login });

function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [pending, setPending] = useState<PendingUnlock | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSignIn() {
    if (!email.trim() || !password) return;
    setLoading(true);
    setError("");
    try {
      setPending(await authenticate(email.trim(), password));
      setPassword("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sign in failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleUnlock() {
    if (!passphrase) return;
    setLoading(true);
    setError("");
    try {
      await unlockSession(passphrase);
      navigate({ to: "/notes" });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The archive could not be unlocked");
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-14 shrink-0 items-center px-5">
        <span
          className="font-display text-[15px] text-ink"
          style={{ fontVariationSettings: '"wght" 640, "opsz" 16', letterSpacing: "-0.02em" }}
        >
          Notes
        </span>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 pb-14">
        <div className="soft-pane pane-glass w-full max-w-[30rem] p-8">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-wash text-accent">
            <ShieldCheck size={21} strokeWidth={1.8} />
          </div>

          <h1
            className="font-display mt-6 text-[2rem] leading-tight text-ink"
            style={{
              letterSpacing: "-0.035em",
              fontVariationSettings: '"wght" 650, "opsz" 36',
            }}
          >
            {pending ? "Unlock your archive" : "Sign in to your notes"}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-3">
            {pending
              ? `Signed in as ${pending.email}. Your passphrase decrypts the shared archive only in this tab.`
              : "Use the email and password created for this private archive."}
          </p>

          {pending ? (
            <>
              <label className="field-row mt-7 mb-2" htmlFor="archive-passphrase">
                <span className="label text-ink-2">Archive passphrase</span>
              </label>
              <input
                id="archive-passphrase"
                autoFocus
                type="password"
                autoComplete="current-password"
                value={passphrase}
                onChange={(event) => setPassphrase(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && void handleUnlock()}
                className="w-full rounded-xl border border-rule bg-paper px-3.5 py-3 text-sm text-ink outline-none transition-colors focus:border-accent focus:bg-page"
              />
              <button
                disabled={loading || !passphrase}
                onClick={() => void handleUnlock()}
                className="label mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3 text-on-accent transition-colors hover:bg-accent-strong disabled:opacity-30"
              >
                {loading ? (
                  "Unlocking…"
                ) : (
                  <>
                    Unlock <ArrowRight size={12} strokeWidth={2.5} />
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPending(null);
                  setPassphrase("");
                  setError("");
                }}
                className="label mt-3 flex items-center gap-1.5 text-ink-3 transition-colors hover:text-accent"
              >
                <ArrowLeft size={12} /> Different account
              </button>
            </>
          ) : (
            <>
              <label className="field-row mt-7 mb-2" htmlFor="email">
                <span className="label text-ink-2">Email</span>
              </label>
              <input
                id="email"
                autoFocus
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-xl border border-rule bg-paper px-3.5 py-3 text-sm text-ink outline-none transition-colors focus:border-accent focus:bg-page"
              />
              <label className="field-row mt-4 mb-2" htmlFor="password">
                <span className="label text-ink-2">Password</span>
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && void handleSignIn()}
                className="w-full rounded-xl border border-rule bg-paper px-3.5 py-3 text-sm text-ink outline-none transition-colors focus:border-accent focus:bg-page"
              />
              <button
                disabled={loading || !email.trim() || !password}
                onClick={() => void handleSignIn()}
                className="label mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3 text-on-accent transition-colors hover:bg-accent-strong disabled:opacity-30"
              >
                {loading ? (
                  "Signing in…"
                ) : (
                  <>
                    Continue <ArrowRight size={12} strokeWidth={2.5} />
                  </>
                )}
              </button>
            </>
          )}

          {error && (
            <p role="alert" className="readout mt-3 text-danger">
              {error}
            </p>
          )}
          <p className="mt-5 flex items-center gap-2 text-xs text-ink-3">
            <ShieldCheck size={13} className="shrink-0 text-ok" />
            Notes are decrypted locally. Supabase stores ciphertext only.
          </p>
        </div>
      </main>
    </div>
  );
}
