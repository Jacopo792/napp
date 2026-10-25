import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowRight, MailCheck } from "@/components/icons";
import {
  authenticate,
  chooseArchive,
  otherAccounts,
  registerAccount,
  restoreSession,
  switchAccount,
  type ArchiveOption,
} from "@/lib/session";
import { BotanicalFlower } from "@/components/BotanicalFlowers";
import { flowerFor } from "@/lib/botanical";
import { platform } from "@/platform";
import logoUrl from "../assets/logo-n-botanical-transparent.png";

type Mode = "sign-in" | "sign-up";

/* The two things this page does are not variations of each other. Signing in
   opens an archive that exists; creating an account starts one. The old page
   said "Continue" to both and put the difference in a link under the fold,
   which is how somebody ends up typing a new password into the sign-in form.
   Two tabs, and every line of copy on the card belongs to the tab showing.

   The confirmation screen below is not dead code even though this project has
   email confirmation turned off: whether it appears is decided by whether
   Supabase hands back a session, which is a server fact. Configure SMTP and
   turn confirmations back on and it is correct again. */
/* The phone's words (`SignIn.tsx`), so the door says the same thing on both. */
const COPY: Record<Mode, { title: string; lede: string; action: string }> = {
  "sign-in": {
    title: "Welcome back.",
    lede: "Sign in to your notes.",
    action: "Sign In",
  },
  "sign-up": {
    title: "Start an archive.",
    lede: "Your notes, shared with whom you choose.",
    action: "Create Account",
  },
};

export default function Login() {
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

  const invited = Boolean(platform().inviteToken());
  const [restoring, setRestoring] = useState(!invited);
  const [restoreError, setRestoreError] = useState("");
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const copy = COPY[mode];
  /* Accounts this computer keeps signed in beside the one that left: one
     press back into each, as the phone's "Saved on this phone". */
  const [saved] = useState(() => otherAccounts(""));

  useEffect(() => {
    // Invitations must still go through the account flow that claims them.
    if (invited) return;
    let active = true;
    void restoreSession()
      .then((session) => {
        if (!active) return;
        if (session) void navigate({ to: "/notes", replace: true });
        else setRestoring(false);
      })
      .catch(() => {
        if (active) setRestoreError("Could not reconnect. Check your connection and try again.");
      });
    return () => {
      active = false;
    };
  }, [invited, navigate, restoreAttempt]);

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
      let result;
      if (mode === "sign-up") {
        if (password.length < 8) throw new Error("Use at least 8 characters");
        result = await registerAccount(email.trim(), password);
        if (result.confirmationRequired) {
          setConfirmation(email.trim());
          setPassword("");
          setLoading(false);
          return;
        }
      } else {
        const inviteToken = platform().inviteToken();
        result = await authenticate(email.trim(), password, inviteToken);
      }
      if (!result.session) {
        setArchiveChoice({ account: result.account, archives: result.archives });
        setPassword("");
        setLoading(false);
        return;
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

  if (restoring) {
    return (
      <LoginFrame title="Opening your notes." lede={restoreError || "Restoring your session…"}>
        {restoreError && (
          <button
            type="button"
            className="login-submit"
            onClick={() => {
              setRestoreError("");
              setRestoreAttempt((attempt) => attempt + 1);
            }}
          >
            Try Again <ArrowRight size={18} />
          </button>
        )}
      </LoginFrame>
    );
  }

  if (archiveChoice) {
    return (
      <LoginFrame title="Your spaces." lede="Choose your archive">
        <div className="login-choices">
          {archiveChoice.archives.map((archive) => (
            <button
              key={archive.archiveId}
              type="button"
              className="login-choice press"
              disabled={loading}
              onClick={() => void handleArchiveChoice(archive.archiveId)}
            >
              <span>{archive.name}</span>
              <small>Open</small>
            </button>
          ))}
        </div>
        {error && (
          <p role="alert" className="login-error">
            {error}
          </p>
        )}
        <button
          type="button"
          className="login-quiet press"
          disabled={loading}
          onClick={() => {
            setArchiveChoice(null);
            setError("");
          }}
        >
          Use another account
        </button>
      </LoginFrame>
    );
  }

  if (confirmation) {
    return (
      <LoginFrame title="Confirm your address." lede={confirmation}>
        <span className="login-mark">
          <MailCheck size={22} />
        </span>
        <ol className="login-steps">
          <li>Open the message and follow its link — it brings you back here.</li>
          <li>Sign in with the same address and password.</li>
          <li>
            {invited
              ? "The invitation you followed is claimed, and the shared archive opens."
              : "Your own private archive is created the first time you sign in."}
          </li>
        </ol>
        <button
          type="button"
          className="login-submit"
          onClick={() => {
            setConfirmation("");
            switchMode("sign-in");
          }}
        >
          Back to Sign In <ArrowRight size={18} />
        </button>
      </LoginFrame>
    );
  }

  return (
    <LoginFrame title={copy.title} lede={copy.lede}>
      {/* Which of the two you are doing is decided before anything is typed:
          the phone's switch, a plate that travels between two words, and the
          whole card — title, button, the password's hint — answers to it. */}
      <div className="login-switch" role="group" aria-label="Sign in or create an account">
        <span className="login-switch-plate" data-mode={mode} aria-hidden="true" />
        <button
          type="button"
          aria-pressed={mode === "sign-in"}
          onClick={() => switchMode("sign-in")}
        >
          Sign In
        </button>
        <button
          type="button"
          aria-pressed={mode === "sign-up"}
          onClick={() => switchMode("sign-up")}
        >
          Create Account
        </button>
      </div>

      {invited && (
        <p className="login-invite-note">
          {mode === "sign-in"
            ? "Sign in with the invited address to join that archive."
            : "Create the account with the invited address to join that archive."}
        </p>
      )}

      <form
        className="login-form"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit();
        }}
      >
        <label className="login-field" htmlFor="email">
          <span className="login-field-label">Email</span>
          <input
            id="email"
            autoFocus
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="login-input"
          />
        </label>

        <label className="login-field" htmlFor="password">
          <span className="login-field-label">
            Password
            <button
              type="button"
              className="login-reveal"
              aria-pressed={revealed}
              onClick={(event) => {
                event.preventDefault();
                setRevealed((current) => !current);
              }}
            >
              {revealed ? "Hide" : "Show"}
            </button>
          </span>
          <input
            id="password"
            type={revealed ? "text" : "password"}
            autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
            placeholder={mode === "sign-up" ? "At least 8 characters" : "Your password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="login-input"
          />
        </label>

        <button
          type="submit"
          disabled={loading || !email.trim() || !password}
          className="login-submit"
        >
          {loading ? (
            <span className="login-ring" aria-label={mode === "sign-up" ? "Creating" : "Opening"} />
          ) : (
            <>
              {copy.action} <ArrowRight size={18} />
            </>
          )}
        </button>
      </form>

      {error && (
        <p role="alert" className="login-error">
          {error}
        </p>
      )}

      {saved.length > 0 && mode === "sign-in" && (
        <section className="login-saved" aria-label="Saved on this computer">
          <h2>Saved on this computer</h2>
          {saved.map((account) => (
            <button
              key={account.userId}
              type="button"
              className="login-choice press"
              disabled={loading}
              onClick={() => {
                setLoading(true);
                void switchAccount(account.userId).catch((reason: unknown) => {
                  setError(reason instanceof Error ? reason.message : "Could not open it");
                  setLoading(false);
                });
              }}
            >
              <span>{account.email}</span>
              <ArrowRight size={18} />
            </button>
          ))}
        </section>
      )}
    </LoginFrame>
  );
}

/* The day, as a string. `toDateString()` and not the clock, so the plate is
   settled for as long as the reader is looking at it. */
function plantOfTheDay(): ReturnType<typeof flowerFor> {
  return flowerFor(new Date().toDateString());
}

/* The phone's door: a dark wall with the plant of the day drawn on it twice,
   the mark and the name in the corner, the title over a frosted card that
   holds the form. Dark in every theme, as the phone's is: nobody has chosen a
   palette yet, and the plate is drawn for a dark ground. */
function LoginFrame({
  title,
  lede,
  children,
}: {
  title: string;
  lede: string;
  children: ReactNode;
}) {
  const plant = plantOfTheDay();
  return (
    <div className="login-shell">
      <div className="login-garden" aria-hidden="true">
        <BotanicalFlower flower={plant} className="is-near" />
        <BotanicalFlower flower={plant} className="is-far" />
      </div>
      <span className="login-brand">
        <img src={logoUrl} alt="" width={30} height={30} />
        napp
      </span>
      <main className="login-main">
        <div className="login-column">
          <header className="login-intro">
            <h1 key={title} className="login-title">
              {title}
            </h1>
            <p className="login-lede">{lede}</p>
          </header>
          <div className="login-card">{children}</div>
        </div>
      </main>
    </div>
  );
}
