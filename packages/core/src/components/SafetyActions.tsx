import { useEffect, useState, type FormEvent } from "react";
import {
  BLOCK_CONSEQUENCES,
  blockUser,
  loadBlockedUsers,
  REPORT_REASONS,
  reportSafetyIssue,
  unblockUser,
  type BlockedUser,
  type ReportReason,
} from "@/lib/storeSafety";
import { NAPP_SUPPORT_EMAIL } from "@/lib/storePolicies";
import "./accountDeletion.css";

const changed = () => window.dispatchEvent(new Event("napp:safety-change"));

export function SafetyActions({
  noteId,
  userId,
  commentId,
  compact = false,
}: {
  noteId?: string;
  userId?: string;
  commentId?: string;
  compact?: boolean;
}) {
  const [reason, setReason] = useState<ReportReason>("harassment");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const report = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await reportSafetyIssue({ noteId, userId, commentId, reason, details });
      setStatus("Report submitted for review.");
      changed();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not submit report");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section>
      <details>
        <summary>Report {commentId ? "comment" : noteId ? "note" : "user"}</summary>
        <form className="account-deletion" onSubmit={(event) => void report(event)}>
          <label>
            Reason
            <select
              value={reason}
              disabled={busy}
              onChange={(event) => setReason(event.target.value as ReportReason)}
            >
              {REPORT_REASONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Details (optional)
            <textarea
              value={details}
              maxLength={2000}
              disabled={busy}
              onChange={(event) => setDetails(event.target.value)}
            />
          </label>
          <p>
            The developer can review the reported content.{" "}
            {noteId ? "The note is hidden from you while the report is pending." : ""}
          </p>
          <button type="submit" disabled={busy}>
            {busy ? "Sending…" : "Submit report"}
          </button>
        </form>
      </details>
      {userId && !compact ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (!window.confirm(BLOCK_CONSEQUENCES)) return;
            setBusy(true);
            setError("");
            void blockUser(userId)
              .then(() => {
                setStatus("Account blocked.");
                changed();
              })
              .catch((reason: Error) => setError(reason.message))
              .finally(() => setBusy(false));
          }}
        >
          Block user
        </button>
      ) : null}
      {status ? <p role="status">{status}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      {!compact ? (
        <p>
          <a href={`mailto:${NAPP_SUPPORT_EMAIL}`}>Contact support</a>
        </p>
      ) : null}
    </section>
  );
}

export function BlockedAccounts() {
  const [users, setUsers] = useState<BlockedUser[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    void loadBlockedUsers()
      .then((users) => {
        if (live) setUsers(users);
      })
      .catch((reason: Error) => {
        if (live) setError(reason.message);
      });
    return () => {
      live = false;
    };
  }, [attempt]);
  return (
    <section>
      <h3>Blocked accounts</h3>
      {error ? (
        <p role="alert">
          {error}{" "}
          <button
            onClick={() => {
              setError("");
              setAttempt((n) => n + 1);
            }}
          >
            Try again
          </button>
        </p>
      ) : !users.length ? (
        <p>No blocked accounts.</p>
      ) : null}
      {users.map((user) => (
        <div key={user.blocked_id} className="appearance-row">
          <span>{user.blocked_name || "Member"}</span>
          <button
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setError("");
              void unblockUser(user.blocked_id)
                .then(() => {
                  setAttempt((n) => n + 1);
                  changed();
                })
                .catch((reason: Error) => setError(reason.message))
                .finally(() => setBusy(false));
            }}
          >
            Unblock
          </button>
        </div>
      ))}
    </section>
  );
}
