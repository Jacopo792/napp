import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, Eye, EyeOff, MailCheck, NotebookPen } from "lucide-react";
import { authenticate, chooseArchive, registerAccount, type ArchiveOption } from "@/lib/session";

export const Route = createFileRoute("/")({ component: Login });

type Mode = "sign-in" | "sign-up";

/* The two things this page does are not variations of each other. Signing in
   opens an archive that exists; creating an account starts one, by way of an
   address you have to confirm first. The old page said "Continue" to both and
   put the difference in a link under the fold, which is how somebody ends up
   typing a new password into the sign-in form. Two tabs, and every line of
   copy on the card belongs to the tab that is showing. */
const COPY: Record<Mode, { title: string; lede: string; action: string; footnote: string }> = {
  "sign-in": {
    title: "Sign in to your notes",
    lede: "The account you confirmed opens the archive it belongs to.",
    action: "Sign in",
    footnote: "Signed in on this device until you sign out or the session times out.",
  },
  "sign-up": {
    title: "Create your account",
    lede: "A private archive is created for you, and stays private until you invite someone.",
    action: "Create account",
    footnote: "At least 8 characters. Confirm your address, then the archive is made for you.",
  },
};

function Login() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [archiveChoice, setArchiveChoice] = useState<{
    account: { userId: string; email: string };
    archives: ArchiveOption[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const invited = Boolean(new URL(window.location.href).searchParams.get("invite"));
  const copy = COPY[mode];

  function switchMode(next: Mode) {
    setMode(next);
    setError("");
    setPassword("");
    setRevealed(false);
  }

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
      <LoginFrame>
        <LoginMark />
        <h1 className="login-title">Choose an archive</h1>
        <p className="login-lede">This account belongs to more than one archive.</p>
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
      </LoginFrame>
    );
  }

  if (confirmation) {
    return (
      <LoginFrame>
        <span className="login-mark is-quiet">
          <MailCheck size={20} />
        </span>
        <h1 className="login-title">Confirm {confirmation}</h1>
        <p className="login-lede">
          A message is on its way. Opening the link in it proves the address is yours and finishes
          the account.
        </p>
        <ol className="login-steps">
          <li>Open the message and follow its link — it brings you back here.</li>
          <li>Sign in with the same address and password.</li>
          <li>
            {invited
              ? "The invitation you followed is claimed, and the shared archive opens."
              : "Your own private archive is created the first time you sign in."}
          </li>
        </ol>
        <p className="login-note">
          Nothing arrived? Check the spam folder. The link works for 24 hours; after that, create
          the account again with the same address.
        </p>
        <button
          type="button"
          className="login-submit label mt-6 flex w-full items-center justify-center py-3"
          onClick={() => {
            setConfirmation("");
            switchMode("sign-in");
          }}
        >
          Back to sign in
        </button>
      </LoginFrame>
    );
  }

  return (
    <LoginFrame>
      <LoginMark />

      <div className="login-tabs" role="group" aria-label="Sign in or create an account">
        <button
          type="button"
          aria-pressed={mode === "sign-in"}
          className={mode === "sign-in" ? "is-active" : ""}
          onClick={() => switchMode("sign-in")}
        >
          Sign in
        </button>
        <button
          type="button"
          aria-pressed={mode === "sign-up"}
          className={mode === "sign-up" ? "is-active" : ""}
          onClick={() => switchMode("sign-up")}
        >
          Create account
        </button>
      </div>

      <h1 className="login-title">{copy.title}</h1>
      <p className="login-lede">{copy.lede}</p>

      {invited && (
        <p className="login-invite-note">
          You followed an invitation.{" "}
          {mode === "sign-in"
            ? "Sign in with the invited address to join that archive."
            : "Create the account with the invited address — the invitation is claimed once you confirm it."}
        </p>
      )}

      <form
        className="mt-6"
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
          {mode === "sign-up" && <span className="login-hint">8 characters or more</span>}
        </label>
        <div className="login-secret">
          <input
            id="password"
            type={revealed ? "text" : "password"}
            autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="login-input"
          />
          <button
            type="button"
            className="login-reveal"
            aria-label={revealed ? "Hide password" : "Show password"}
            aria-pressed={revealed}
            onClick={() => setRevealed((current) => !current)}
          >
            {revealed ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>

        <button
          type="submit"
          disabled={loading || !email.trim() || !password}
          className="login-submit label mt-5 flex w-full items-center justify-center gap-2 py-3"
        >
          {loading ? (
            mode === "sign-up" ? (
              "Creating…"
            ) : (
              "Opening…"
            )
          ) : (
            <>
              {copy.action} <ArrowRight size={14} />
            </>
          )}
        </button>
      </form>

      {error && (
        <p role="alert" className="readout mt-3 text-danger">
          {error}
        </p>
      )}
      <p className="login-note mt-5">{copy.footnote}</p>
    </LoginFrame>
  );
}

function LoginFrame({ children }: { children: React.ReactNode }) {
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
        <div className="login-card w-full max-w-[28rem] p-8 sm:p-10">{children}</div>
      </main>
    </div>
  );
}

function LoginMark() {
  return (
    <span className="login-mark">
      <NotebookPen size={20} />
    </span>
  );
}
