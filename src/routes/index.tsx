import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, NotebookPen } from "lucide-react";
import { authenticate, chooseArchive, registerAccount, type ArchiveOption } from "@/lib/session";

export const Route = createFileRoute("/")({ component: Login });

function Login() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [archiveChoice, setArchiveChoice] = useState<{
    account: { userId: string; email: string };
    archives: ArchiveOption[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    if (!email.trim() || !password) return;
    setLoading(true);
    setError("");
    try {
      if (mode === "sign-up") {
        if (password.length < 8) throw new Error("Use at least 8 characters");
        const result = await registerAccount(email.trim(), password);
        if (result.confirmationRequired) {
          setConfirmation(email.trim());
          setPassword("");
          setLoading(false);
          return;
        }
      } else {
        const inviteToken = new URL(window.location.href).searchParams.get("invite") ?? undefined;
        const result = await authenticate(email.trim(), password, inviteToken);
        if (!result.session) {
          setArchiveChoice({ account: result.account, archives: result.archives });
          setPassword("");
          setLoading(false);
          return;
        }
      }
      setPassword("");
      navigate({ to: "/notes" });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sign in failed");
      setLoading(false);
    }
  }

  async function handleArchiveChoice(archiveId: string) {
    if (!archiveChoice) return;
    setLoading(true);
    setError("");
    try {
      await chooseArchive(archiveChoice.account, archiveId);
      navigate({ to: "/notes" });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not open that archive");
      setLoading(false);
    }
  }

  if (archiveChoice) {
    return (
      <div className="login-shell flex min-h-screen flex-col">
        <LoginHeader />
        <main className="flex flex-1 items-center justify-center px-5 pb-16">
          <div className="login-card w-full max-w-[28rem] p-8 sm:p-10">
            <LoginMark />
            <h1
              className="font-display mt-6 text-[2rem] leading-tight text-ink"
              style={{ letterSpacing: "-0.035em", fontWeight: 700 }}
            >
              Choose an archive
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-ink-3">
              This account belongs to more than one archive.
            </p>
            <div className="archive-choice-list mt-6">
              {archiveChoice.archives.map((archive) => (
                <button
                  key={archive.archiveId}
                  type="button"
                  disabled={loading}
                  onClick={() => void handleArchiveChoice(archive.archiveId)}
                >
                  <span>{archive.name}</span>
                  <small>
                    Joined{" "}
                    {new Date(archive.joinedAt).toLocaleDateString(undefined, {
                      month: "short",
                      year: "numeric",
                    })}
                  </small>
                  <ArrowRight size={14} />
                </button>
              ))}
            </div>
            {error && (
              <p role="alert" className="readout mt-3 text-danger">
                {error}
              </p>
            )}
          </div>
        </main>
      </div>
    );
  }

  if (confirmation) {
    return (
      <div className="login-shell flex min-h-screen flex-col">
        <LoginHeader />
        <main className="flex flex-1 items-center justify-center px-5 pb-16">
          <div className="login-card w-full max-w-[28rem] p-8 sm:p-10">
            <LoginMark />
            <h1
              className="font-display mt-6 text-[2rem] leading-tight text-ink"
              style={{ letterSpacing: "-0.035em", fontWeight: 700 }}
            >
              Check your email
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-ink-3">
              If an account can be created for {confirmation}, a confirmation link is on its way.
            </p>
            <button
              type="button"
              className="login-submit label mt-6 flex w-full items-center justify-center py-3"
              onClick={() => {
                setConfirmation("");
                setMode("sign-in");
              }}
            >
              Back to sign in
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="login-shell flex min-h-screen flex-col">
      <LoginHeader />

      <main className="flex flex-1 items-center justify-center px-5 pb-16">
        <div className="login-card w-full max-w-[28rem] p-8 sm:p-10">
          <LoginMark />

          <h1
            className="font-display mt-6 text-[2rem] leading-tight text-ink"
            style={{
              letterSpacing: "-0.035em",
              fontWeight: 700,
            }}
          >
            {mode === "sign-up" ? "Create your account" : "Sign in to your notes"}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-3">
            Your notes, shared only with people you invite.
          </p>

          <form
            className="mt-7"
            onSubmit={(event) => {
              event.preventDefault();
              void handleSubmit();
            }}
          >
            <label className="field-row mb-2" htmlFor="email">
              <span className="label text-ink-2">Email</span>
            </label>
            <input
              id="email"
              autoFocus
              type="email"
              autoComplete="email"
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
              autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
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
                  {mode === "sign-up" ? "Create account" : "Continue"} <ArrowRight size={14} />
                </>
              )}
            </button>
          </form>

          {error && (
            <p role="alert" className="readout mt-3 text-danger">
              {error}
            </p>
          )}
          <p className="mt-5 text-xs text-ink-3">
            {mode === "sign-up"
              ? "A private archive will be created after you confirm your address."
              : "Your account controls access to notes and files."}
          </p>
          <button
            type="button"
            className="login-mode label mt-4 text-accent"
            onClick={() => {
              setMode((current) => (current === "sign-in" ? "sign-up" : "sign-in"));
              setError("");
            }}
          >
            {mode === "sign-in" ? "Create an account" : "I already have an account"}
          </button>
        </div>
      </main>
    </div>
  );
}

function LoginHeader() {
  return (
    <header className="flex h-16 shrink-0 items-center px-6">
      <span
        className="font-display text-[15px] text-ink"
        style={{ fontWeight: 650, letterSpacing: "-0.02em" }}
      >
        Notes
      </span>
    </header>
  );
}

function LoginMark() {
  return (
    <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-glass-border bg-accent-wash text-accent">
      <NotebookPen size={20} />
    </div>
  );
}
