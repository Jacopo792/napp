import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { createSession } from "@/lib/session";
import { ThemeToggle } from "@/components/ThemeToggle";

export const Route = createFileRoute("/")({
  component: Login,
});

/* A calm, explicit unlock screen. The access bundle remains session-only. */

function Login() {
  const navigate = useNavigate();
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleUnlock() {
    if (!token.trim()) return;
    setLoading(true);
    setError("");
    try {
      await createSession(token.trim());
      navigate({ to: "/notes" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "That key was not readable");
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <header className="flex h-14 shrink-0 items-center justify-between px-5">
        <span
          className="font-display text-[15px] text-ink"
          style={{ fontVariationSettings: '"wght" 640, "opsz" 16', letterSpacing: "-0.02em" }}
        >
          Notes
        </span>
        <ThemeToggle />
      </header>

      <main className="flex flex-1 items-center justify-center px-6 pb-14">
        <div className="soft-pane w-full max-w-[30rem] bg-page p-8">
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
            Unlock your notes
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-3">
            Paste your access bundle. It stays in this browser tab and unlocks your encrypted
            archive locally.
          </p>

          <label className="field-row mt-7 mb-2">
            <span className="label text-ink-2">Access bundle</span>
            <span className="readout text-ink-4">{token.trim().length || 0} ch</span>
          </label>

          <textarea
            autoFocus
            rows={3}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleUnlock();
            }}
            placeholder="eyJ0eXBlIjoidTEi…"
            aria-label="Access bundle"
            spellCheck={false}
            className="w-full resize-none rounded-xl border border-rule bg-paper px-3.5 py-3 font-mono text-[12px] leading-relaxed text-ink outline-none transition-colors focus:border-accent focus:bg-page placeholder:text-ink-4"
          />

          <button
            disabled={loading || !token.trim()}
            onClick={handleUnlock}
            className="label mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3 text-on-accent transition-colors hover:bg-accent-strong disabled:opacity-30"
          >
            {loading ? (
              <>
                <span className="animate-spin inline-block h-3 w-3 rounded-full border-2 border-current border-t-transparent" />
                Unlocking
              </>
            ) : (
              <>
                Unlock
                <ArrowRight size={12} strokeWidth={2.5} />
              </>
            )}
          </button>

          {error && (
            <p role="alert" className="readout mt-3 text-danger">
              {error}
            </p>
          )}

          <p className="mt-5 flex items-center gap-2 text-xs text-ink-3">
            <ShieldCheck size={13} className="shrink-0 text-ok" />
            Decryption happens in this tab. <span className="ml-auto readout text-ink-4">⌘↵</span>
          </p>
        </div>
      </main>
    </div>
  );
}
