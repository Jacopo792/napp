import { Clock3, ShieldCheck, UserRound } from "lucide-react";
import { useState } from "react";
import { Avatar } from "@/components/WorkspaceMenus";
import { useDismiss } from "@/components/useDismiss";

interface Props {
  avatarUrl: string | null;
  name: string;
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

/* Everyone this card is drawn for is on the note.
 *
 * It used to take an `active` flag from the Realtime presence channel and
 * print "Offline" when it was false — but the card is only rendered for a peer
 * in `useCollaborationPeers`, which reads Yjs awareness, and a peer in that
 * list is connected to this note's document by construction. Presence is
 * opt-in and mutual, so a member who simply has it switched off was absent
 * from that channel and got marked offline while she was typing into the
 * paragraph you were reading. Two sources answering one question, and the card
 * was asking the one that does not know.
 *
 * Awareness answers "is she here". The presence channel still answers "is she
 * typing", which is the flag it was built to carry. */
export function MemberPresenceCard({
  avatarUrl,
  name,
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
        <Avatar url={avatarUrl} name={name} email="" compact />
        {typing && <i className="note-reader-caret" aria-hidden="true" />}
      </button>

      {open && (
        <span
          className="member-presence-popover popover"
          role="dialog"
          aria-label={`${name} profile`}
        >
          <span className="member-presence-heading">
            <Avatar url={avatarUrl} name={name} email="" large />
            <span>
              <strong>{name}</strong>
              <small className="is-active">
                <i aria-hidden="true" />
                {typing ? "Writing now" : "Active now"}
              </small>
            </span>
          </span>

          <span className="member-presence-facts">
            <span>
              <Clock3 size={16} />
              <span>
                <small>In this note since</small>
                <strong>{timeLabel(noteJoinedAt)}</strong>
              </span>
            </span>
            {archiveJoinedAt && (
              <span>
                <UserRound size={16} />
                <span>
                  <small>Archive member since</small>
                  <strong>{memberSince(archiveJoinedAt)}</strong>
                </span>
              </span>
            )}
            {role && (
              <span>
                <ShieldCheck size={16} />
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
