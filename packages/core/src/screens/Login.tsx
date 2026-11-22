import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, Eye, EyeOff, MailCheck, NotebookPen } from "@/components/icons";
import {
  authenticate,
  chooseArchive,
  confirmRegistration,
  confirmRegistrationAddress,
  ConfirmedAddressError,
  registerAccount,
  resendRegistrationCode,
  restoreSession,
  type ArchiveOption,
  type AuthenticationResult,
} from "@/lib/session";
import { stickerUrl } from "@/lib/stickers";
import { platform } from "@/platform";
import logoUrl from "../assets/napp-logo.png";
import { useAuthCaptcha } from "@/lib/useAuthCaptcha";
import { PolicyGate } from "@/components/PolicyGate";
import { PolicyLinks } from "@/components/PolicyLinks";
import { passwordRecoveryUrl } from "@/lib/passwordRecovery";

type Mode = "sign-in" | "sign-up";

/* The two things this page does are not variations of each other. Signing in
   opens an archive that exists; creating an account starts one. The old page
   said "Continue" to both and put the difference in a link under the fold,
   which is how somebody ends up typing a new password into the sign-in form.
   Two tabs, and every line of copy on the card belongs to the tab showing.

   The confirmation screen below is not dead code even though this project has
   email confirmation turned off: whether it appears is decided by whether
   Supabase hands back a session, which is a server fact. */
const COPY: Record<Mode, { title: string; lede: string; action: string }> = {
  "sign-in": {
    title: "Welcome back.",
    lede: "Sign in to your notes.",
    action: "Sign in",
  },
  "sign-up": {
    title: "Start a group.",
    lede: "Your notes, shared with whom you choose.",
    action: "Create account",
  },
};

export default function Login({
  stayOnPage = false,
  confirmAddressOnly = false,
}: {
  stayOnPage?: boolean;
  confirmAddressOnly?: boolean;
}) {
  const navigate = useNavigate();
  const captcha = useAuthCaptcha();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [policiesAccepted, setPoliciesAccepted] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [addressConfirmed, setAddressConfirmed] = useState(false);
  const [code, setCode] = useState("");
  const [resendAt, setResendAt] = useState(0);
  const [codeSent, setCodeSent] = useState(false);
  const [archiveChoice, setArchiveChoice] = useState<{
    account: { userId: string; email: string };
    archives: ArchiveOption[];
  } | null>(null);
  const [pendingPolicies, setPendingPolicies] = useState<AuthenticationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const invited = Boolean(platform().inviteToken());
  const [restoring, setRestoring] = useState(!invited && !confirmAddressOnly);
  const [restoreError, setRestoreError] = useState("");
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const copy = COPY[mode];

  useEffect(() => {
    // Invitations must still go through the account flow that claims them.
    if (invited || confirmAddressOnly) return;
    let active = true;
    void restoreSession()
      .then((session) => {
        if (!active) return;
        if (session && !stayOnPage) void navigate({ to: "/notes", replace: true });
        else setRestoring(false);
      })
      .catch(() => {
        if (active) setRestoreError("Could not reconnect. Check your connection and try again.");
      });
    return () => {
      active = false;
    };
  }, [confirmAddressOnly, invited, navigate, restoreAttempt, stayOnPage]);

  useEffect(() => {
    if (!resendAt) return;
    const timer = setTimeout(() => setResendAt(0), Math.max(0, resendAt - Date.now()));
    return () => clearTimeout(timer);
  }, [resendAt]);

  function switchMode(next: Mode) {
    setMode(next);
    setError("");
    setPassword("");
    setRevealed(false);
  }

  function finishSignIn(result: AuthenticationResult) {
    setPassword("");
    setLoading(false);
    if (result.continueAfterPolicies) setPendingPolicies(result);
    else if (!result.session) {
      setArchiveChoice({ account: result.account, archives: result.archives });
    } else if (!stayOnPage) {
      void navigate({ to: "/notes", replace: true });
    }
  }

  async function handleSubmit() {
    if (!email.trim() || !password || !captcha.ready) return;
    setLoading(true);
    setError("");
    try {
      let result;
      if (mode === "sign-up") {
        if (password.length < 8) throw new Error("Use at least 8 characters");
        result = await registerAccount(email.trim(), password, policiesAccepted, captcha.token);
        if (result.confirmationRequired) {
          setConfirmation(email.trim());
          setCode("");
          setCodeSent(false);
          setResendAt(Date.now() + 60_000);
          setPassword("");
          setLoading(false);
          return;
        }
      } else {
        const inviteToken = platform().inviteToken();
        result = await authenticate(email.trim(), password, inviteToken, captcha.token);
      }
      finishSignIn(result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sign in failed");
      setLoading(false);
    } finally {
      captcha.reset();
    }
  }

  async function handleConfirmation() {
    setLoading(true);
    setError("");
    setCodeSent(false);
    try {
      if (confirmAddressOnly) {
        await confirmRegistrationAddress(email.trim(), code);
        setAddressConfirmed(true);
        return;
      }
      const result = await confirmRegistration(confirmation, code);
      setConfirmation("");
      finishSignIn(result);
    } catch (reason) {
      if (reason instanceof ConfirmedAddressError) {
        setConfirmation("");
        switchMode("sign-in");
      }
      setError(reason instanceof Error ? reason.message : "Could not confirm your email");
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (!captcha.ready) return;
    setLoading(true);
    setError("");
    setCodeSent(false);
    try {
      await resendRegistrationCode(confirmAddressOnly ? email.trim() : confirmation, captcha.token);
      setResendAt(Date.now() + 60_000);
      setCodeSent(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not send a new code");
    } finally {
      captcha.reset();
      setLoading(false);
    }
  }

  async function handleArchiveChoice(archiveId: string) {
    if (!archiveChoice) return;
    setLoading(true);
    setError("");
    try {
      await chooseArchive(archiveChoice.account, archiveId);
      if (!stayOnPage) void navigate({ to: "/notes" });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not open that group");
      setLoading(false);
    }
  }

  if (pendingPolicies?.continueAfterPolicies) {
    const resume = pendingPolicies.continueAfterPolicies;
    return (
      <PolicyGate
        pendingUserId={pendingPolicies.account.userId}
        onAccepted={async () => {
          const result = await resume();
          setPendingPolicies(null);
          finishSignIn(result);
        }}
      />
    );
  }

  if (restoring) {
    return (
      <LoginFrame>
        <LoginMark />
        <h1 className="login-title">Opening your notes</h1>
        {restoreError ? (
          <>
            <p role="alert" className="login-lede">
              {restoreError}
            </p>
            <button
              type="button"
              className="login-submit label"
              onClick={() => {
                setRestoreError("");
                setRestoreAttempt((attempt) => attempt + 1);
              }}
            >
              Try again <ArrowRight size={16} />
            </button>
          </>
        ) : (
          <p role="status" className="login-lede">
            Restoring your session…
          </p>
        )}
      </LoginFrame>
    );
  }

  if (archiveChoice) {
    return (
      <LoginFrame>
        <LoginMark />
        <h1 className="login-title">Choose a group</h1>
        <p className="login-lede">This account belongs to more than one group.</p>
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
              <ArrowRight size={16} />
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

  if (addressConfirmed) {
    return (
      <LoginFrame>
        <h1 className="login-title">Address confirmed</h1>
        <p className="login-lede">Return to the app and sign in with your email and password.</p>
        <a className="login-code-action" href={platform().webOrigin()}>
          Open Napp on the web
        </a>
      </LoginFrame>
    );
  }

  if (confirmation || confirmAddressOnly) {
    return (
      <LoginFrame>
        <span className="login-mark is-quiet">
          <MailCheck size={20} />
        </span>
        <h1 className="login-title">Confirm your address</h1>
        <p className="login-address">{confirmation}</p>
        <form
          className="login-form"
          onSubmit={(event) => {
            event.preventDefault();
            void handleConfirmation();
          }}
        >
          {confirmAddressOnly && (
            <div className="login-field">
              <label className="label" htmlFor="signup-confirm-email">
                Email
              </label>
              <input
                id="signup-confirm-email"
                className="login-input"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={loading}
              />
            </div>
          )}
          <div className="login-field">
            <label className="label" htmlFor="signup-code">
              Verification code
            </label>
            <input
              id="signup-code"
              className="login-input"
              autoFocus={!confirmAddressOnly}
              autoComplete="one-time-code"
              inputMode="numeric"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              disabled={loading}
            />
          </div>
          {error && (
            <p role="alert" className="readout text-danger">
              {error}
            </p>
          )}
          {codeSent && (
            <p role="status" className="login-note">
              New code requested.
            </p>
          )}
          <button
            type="submit"
            className="login-submit label"
            disabled={
              loading ||
              (confirmAddressOnly && !email.trim()) ||
              !/^\d{8}$/.test(code.replace(/\s/g, ""))
            }
          >
            Verify email
          </button>
          {captcha.widget}
          <button
            type="button"
            className="login-code-action"
            disabled={
              loading ||
              !captcha.ready ||
              Boolean(resendAt) ||
              (confirmAddressOnly && !email.trim())
            }
            onClick={() => void handleResend()}
          >
            Resend code
          </button>
          {confirmAddressOnly ? (
            <a className="login-code-action" href={platform().webOrigin()}>
              Back to sign in
            </a>
          ) : (
            <button
              type="button"
              className="login-code-action"
              disabled={loading}
              onClick={() => {
                setConfirmation("");
                switchMode("sign-in");
              }}
            >
              Back to sign in
            </button>
          )}
        </form>
      </LoginFrame>
    );
  }

  return (
    <LoginFrame>
      <h1 className="login-title">{copy.title}</h1>
      <p className="login-lede">{copy.lede}</p>

      {invited && (
        <p className="login-invite-note">
          You followed an invitation.{" "}
          {mode === "sign-in"
            ? "Sign in with the invited address to join that group."
            : "Create the account with the invited address — the invitation is claimed as soon as it exists."}
        </p>
      )}

      {/* The phone's shape: the title stands on the ground, and the choice,
          the fields and the button are one card under it. */}
      <div className="login-panel">
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

          {mode === "sign-up" ? (
            <label
              className="login-note"
              style={{ display: "flex", gap: 10, alignItems: "flex-start" }}
            >
              <input
                type="checkbox"
                checked={policiesAccepted}
                onChange={(event) => setPoliciesAccepted(event.target.checked)}
                disabled={loading}
              />
              I agree to the Terms of Use and have read the Privacy Policy.
            </label>
          ) : null}
          {mode === "sign-in" ? (
            <a
              href={passwordRecoveryUrl()}
              className="login-note"
              target="_blank"
              rel="noopener noreferrer"
            >
              Forgot password?
            </a>
          ) : null}
          <PolicyLinks />
          {captcha.widget}
          <button
            type="submit"
            disabled={
              loading ||
              !captcha.ready ||
              !email.trim() ||
              !password ||
              (mode === "sign-up" && !policiesAccepted)
            }
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
                {copy.action} <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>
      </div>

      {error && (
        <p role="alert" className="readout login-error">
          {error}
        </p>
      )}
    </LoginFrame>
  );
}

/* about.nappnote.com's line, set as the site sets it: the plain half bold,
   the other half in the reading serif. Two of the chat's stickers sit on the
   door as they sit on the site, one on the words and one on the card. */
function Pitch() {
  return (
    <section className="login-pitch">
      <span className="login-wordmark">
        <img src={logoUrl} alt="" width={28} height={28} />
        Napp
      </span>
      <p className="login-headline">
        Write it down,
        <br />
        <em>
          together.
          <img className="login-sticker is-bear" src={stickerUrl("bear.hi") ?? ""} alt="" />
        </em>
      </p>
    </section>
  );
}

function LoginFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="login-shell">
      <Pitch />
      <main className="login-main">
        <div className="login-card">
          <img className="login-sticker is-bunny" src={stickerUrl("bunny.love") ?? ""} alt="" />
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
