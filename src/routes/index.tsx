import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { authenticate } from "@/lib/session";

export const Route = createFileRoute("/")({ component: Login });

function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSignIn() {
    if (!email.trim() || !password) return;
    setLoading(true);
    setError("");
    try {
      await authenticate(email.trim(), password);
      setPassword("");
      navigate({ to: "/notes" });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sign in failed");
      setLoading(false);
    }
  }

  return (
    <div className="login-shell flex min-h-screen flex-col">
      <header className="flex h-16 shrink-0 items-center px-6">
        <span
          className="font-display text-[15px] text-ink"
          style={{ fontWeight: 650, letterSpacing: "-0.02em" }}
        >
          Notes
        </span>
      </header>

      <main className="flex flex-1 items-center justify-center px-5 pb-16">
        <div className="login-card w-full max-w-[28rem] p-8 sm:p-10">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-glass-border bg-accent-wash text-accent">
            <ShieldCheck size={21} strokeWidth={1.8} />
          </div>

          <h1
            className="font-display mt-6 text-[2rem] leading-tight text-ink"
            style={{
              letterSpacing: "-0.035em",
              fontWeight: 700,
            }}
          >
            Sign in to your notes
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-3">
            One private workspace. Your email and password handle both access and decryption.
          </p>

          <form
            className="mt-7"
            onSubmit={(event) => {
              event.preventDefault();
              void handleSignIn();
            }}
          >
            <label className="field-row mb-2" htmlFor="email">
              <span className="label text-ink-2">Email</span>
            </label>
            <input
              id="email"
              autoFocus
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="login-input"
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
              className="login-input"
            />
            <button
              type="submit"
              disabled={loading || !email.trim() || !password}
              className="login-submit label mt-4 flex w-full items-center justify-center gap-2 py-3"
            >
              {loading ? (
                "Opening…"
              ) : (
                <>
                  Continue <ArrowRight size={13} strokeWidth={2.5} />
                </>
              )}
            </button>
          </form>

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
