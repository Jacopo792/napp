/* Who is waiting to be let in, and the way to ask somebody new.
 *
 * Settings → Members and the archive's sheet both offer it, so it is written
 * once. Neither path hands the one-time token to a third party: the link is
 * copied by hand, and the message is composed and sent by the member's own
 * mail app. */
import { useState } from "react";
import { Copy, Mail, ShieldCheck, Undo2, UserPlus } from "@/components/icons";

/** Seven days is the invitation's whole life, so what is left of it is said in
 *  days rather than as a date nobody can subtract at a glance. */
function expiresIn(expiresAt: string): string {
  const days = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000);
  if (days <= 0) return "expires today";
  if (days === 1) return "expires tomorrow";
  return `expires in ${days} days`;
}

/** The message is composed and sent by the member's own mail app: the token
 *  reaches the invited address without passing through anything of ours, and
 *  there is no server here to send it with. */
function inviteMailto(email: string, link: string): string {
  const subject = "An invitation to a shared notes archive";
  const body = [
    "You have been invited to a private notes archive.",
    "",
    "Open this link, then create an account with this address (or sign in, if you already have one):",
    link,
    "",
    "The link works once and expires in seven days.",
  ].join("\n");
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(
    subject,
  )}&body=${encodeURIComponent(body)}`;
}

export function Invitations({
  invites,
  seatsFull,
  canManage,
  onCreate,
  onRevoke,
}: {
  invites: { id: string; email: string; expiresAt: string }[];
  /** A seat is held by a member or by an invitation waiting to be claimed —
   *  the same arithmetic the database enforces, so the form is closed before
   *  the write is refused rather than after. */
  seatsFull: boolean;
  canManage: boolean;
  onCreate: (email: string) => Promise<string>;
  onRevoke: (inviteId: string) => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [link, setLink] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    const target = email.trim();
    if (!target) return;
    setBusy(true);
    setStatus("");
    try {
      setLink(await onCreate(target));
      setStatus("Invitation ready. Copy the link or send it by email.");
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : "Invitation failed");
    } finally {
      setBusy(false);
    }
  }

  async function withdraw(inviteId: string) {
    setBusy(true);
    setStatus("");
    try {
      await onRevoke(inviteId);
      setLink("");
      setStatus("Invitation withdrawn. Its link no longer works.");
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : "Could not withdraw it");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {invites.length > 0 && (
        <>
          <h3>Waiting to be claimed</h3>
          <div className="member-role-list">
            {invites.map((invite) => (
              <div key={invite.id}>
                <span>
                  <b>{invite.email}</b>
                  <small>{expiresIn(invite.expiresAt)}</small>
                </span>
                {canManage && (
                  <button
                    type="button"
                    className="invite-withdraw"
                    disabled={busy}
                    onClick={() => void withdraw(invite.id)}
                  >
                    <Undo2 size={16} />
                    Withdraw
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <h3>Invite someone</h3>
      {!canManage ? (
        <dl className="settings-facts">
          <div>
            <span className="settings-lead" aria-hidden="true">
              <ShieldCheck size={16} />
            </span>
            <span className="settings-label">
              <dt>Editors only</dt>
              <dd>An editor in this archive can invite the other person.</dd>
            </span>
          </div>
        </dl>
      ) : seatsFull ? (
        <dl className="settings-facts">
          <div>
            <span className="settings-lead" aria-hidden="true">
              <UserPlus size={16} />
            </span>
            <span className="settings-label">
              <dt>No seat free</dt>
              <dd>Withdraw an invitation nobody claimed and its seat comes back.</dd>
            </span>
          </div>
        </dl>
      ) : (
        <div className="invite-form">
          <label>
            <span>Email address</span>
            <input
              type="email"
              value={email}
              placeholder="person@example.com"
              disabled={busy}
              onChange={(event) => {
                setEmail(event.target.value);
                setLink("");
                setStatus("");
              }}
              onKeyDown={(event) => event.key === "Enter" && void create()}
            />
          </label>
          <button type="button" disabled={busy || !email.trim()} onClick={() => void create()}>
            <UserPlus size={16} />
            {busy ? "Creating…" : "Create invitation"}
          </button>
        </div>
      )}

      {link && (
        <div className="invite-ready">
          <div className="invite-link-row">
            <input aria-label="Invitation link" readOnly value={link} />
            <button
              type="button"
              aria-label="Copy invitation link"
              onClick={() => {
                void navigator.clipboard.writeText(link).then(() => {
                  setStatus("Copied. The link expires in 7 days.");
                });
              }}
            >
              <Copy size={16} />
            </button>
          </div>
          <a className="invite-mail" href={inviteMailto(email, link)}>
            <Mail size={16} />
            Send it by email
          </a>
        </div>
      )}
      {status && (
        <p className="profile-note" role="status">
          {status}
        </p>
      )}
    </>
  );
}
