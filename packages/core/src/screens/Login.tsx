import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, Eye, EyeOff, MailCheck, NotebookPen } from "lucide-react";
import { authenticate, chooseArchive, registerAccount, type ArchiveOption } from "@/lib/session";
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
const COPY: Record<Mode, { title: string; lede: string; action: string; footnote: string }> = {
  "sign-in": {
    title: "Sign in to your notes",
    lede: "Your account opens the archive it belongs to.",
    action: "Sign in",
    footnote: "Signed in on this device until you sign out or the session times out.",
  },
  "sign-up": {
    title: "Start an archive",
    lede: "The account and the archive are made together, in one step.",
    action: "Create account",
    footnote: "At least 8 characters. Nobody can reset a password you have not written down.",
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
        const inviteToken = platform().inviteToken();
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
        <h1 className="login-title">Confirm your address</h1>
        <p className="login-address">{confirmation}</p>
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
          className="login-submit label"
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
      {/* Which of the two you are doing is decided before anything is typed,
          and the whole card answers to it — heading, explanation, button and
          footnote — so creating an account is never the sign-in page wearing
          a different word. */}
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
        <span className="login-tabs-marker" data-mode={mode} />
      </div>

      <h1 className="login-title">{copy.title}</h1>
      <p className="login-lede">{copy.lede}</p>

      {invited && (
        <p className="login-invite-note">
          You followed an invitation.{" "}
          {mode === "sign-in"
            ? "Sign in with the invited address to join that archive."
            : "Create the account with the invited address — the invitation is claimed as soon as it exists."}
        </p>
      )}

      <form
        className="login-form"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit();
        }}
      >
        {/* Ruled fields, not boxes. Two outlined rectangles on a plane inside a
            plane is three frames deep before a single character is typed. */}
        <div className="login-field">
          <label className="label" htmlFor="email">
            Email
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
        </div>

        <div className="login-field login-secret">
          <label className="label" htmlFor="password">
            Password
            {mode === "sign-up" && <span className="login-hint">8 characters or more</span>}
          </label>
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
          className="login-submit label"
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
        <p role="alert" className="readout login-error">
          {error}
        </p>
      )}
      <p className="login-note login-footnote">{copy.footnote}</p>
    </LoginFrame>
  );
}

/* The day, as a string. `toDateString()` and not the clock, so the plate is
   settled for as long as the reader is looking at it. */
function plantOfTheDay(): ReturnType<typeof flowerFor> {
  return flowerFor(new Date().toDateString());
}

function LoginFrame({ children }: { children: React.ReactNode }) {
  const plant = plantOfTheDay();
  return (
    <div className="login-shell flex min-h-screen flex-col">
      {/* Two plates of one plant: the near one climbing the right of the
          window, a smaller one behind the shoulder of the card. They are the
          ground the card sits on, never a layer over it.

          Which flower it is turns with the date — a lotus, a narcissus, a
          lycoris or a peony. Seeded by the day and not by chance, so a door
          that changes never changes while you are standing in it. The plain
          sprig that used to take every other day is gone: this is the one
          surface in the app that gets to be a drawing, and a twig was not
          spending it. */}
      <div className="login-garden" aria-hidden="true">
        <BotanicalFlower flower={plant} className="is-near" />
        <BotanicalFlower flower={plant} className="is-far" />
      </div>

      <main className="login-main">
        <div className="login-card">
          <img className="login-brand" src={logoUrl} alt="Notes" width={96} height={96} />
          {children}
        </div>
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
