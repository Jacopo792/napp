import { Clock3, ShieldCheck, UserRound } from "lucide-react";
import { useState } from "react";
import { Avatar } from "@/components/WorkspaceMenus";
import { useDismiss } from "@/components/useDismiss";

interface Props {
  avatarUrl: string | null;
  name: string;
  active: boolean;
  typing: boolean;
  noteJoinedAt: string;
  archiveJoinedAt?: string;
  role?: "editor" | "viewer";
  color: string;
  wash: string;
}

function timeLabel(value: string): string {
  return new Date(value).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function memberSince(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function MemberPresenceCard({
  avatarUrl,
  name,
  active,
  typing,
  noteJoinedAt,
  archiveJoinedAt,
  role,
  color,
  wash,
}: Props) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const ref = useDismiss<HTMLSpanElement>(open, close);

  return (
    <span
      ref={ref}
      className="member-presence relative"
      style={{ "--presence-color": color, "--presence-wash": wash } as React.CSSProperties}
    >
      <button
        type="button"
        className={`note-reader has-custom-presence press ${typing ? "is-typing" : ""}`}
        aria-label={`Open ${name}'s profile`}
        aria-expanded={open}
        title={typing ? `${name} is writing` : `${name} has this note open`}
        onClick={() => setOpen((current) => !current)}
      >
        <Avatar url={avatarUrl} name={name} email="" compact online={active} />
        {typing && <i className="note-reader-caret" aria-hidden="true" />}
      </button>

      {open && (
        <span
          className="member-presence-popover popover"
          role="dialog"
          aria-label={`${name} profile`}
        >
          <span className="member-presence-heading">
            <Avatar url={avatarUrl} name={name} email="" large online={active} />
            <span>
              <strong>{name}</strong>
              <small className={active ? "is-active" : ""}>
                <i aria-hidden="true" />
                {typing ? "Writing now" : active ? "Active now" : "Offline"}
              </small>
            </span>
          </span>

          <span className="member-presence-facts">
            <span>
              <Clock3 size={15} />
              <span>
                <small>In this note since</small>
                <strong>{timeLabel(noteJoinedAt)}</strong>
              </span>
            </span>
            {archiveJoinedAt && (
              <span>
                <UserRound size={15} />
                <span>
                  <small>Archive member since</small>
                  <strong>{memberSince(archiveJoinedAt)}</strong>
                </span>
              </span>
            )}
            {role && (
              <span>
                <ShieldCheck size={15} />
                <span>
                  <small>Access</small>
                  <strong>{role === "editor" ? "Can edit" : "View only"}</strong>
                </span>
              </span>
            )}
          </span>
        </span>
      )}
    </span>
  );
}
