import type { ReactNode } from "react";
import { Avatar } from "@/components/WorkspaceMenus";

/* ── Who that is ─────────────────────────────────────────────────────────────
   One card, two places that open it. The note's header opens it from a face on
   the note; the scope switch opens it from a face in the title bar, which is
   the more necessary of the two — the switch used to carry names beside its
   portraits and does not any more, so "who is that" became a question the
   window had no answer to.

   The facts are a list rather than markup, because the two callers know
   different things: the note knows when she arrived in this note, the switch
   does not and should not. ──────────────────────────────────────────────── */

export interface MemberFact {
  icon: ReactNode;
  label: string;
  value: string;
}

export function MemberCard({
  avatarUrl,
  name,
  status,
  facts,
}: {
  avatarUrl: string | null;
  name: string;
  /** Absent where nobody is claiming the person is anywhere. */
  status?: { label: string; active: boolean };
  facts: MemberFact[];
}) {
  return (
    <>
      <span className="member-presence-heading">
        <Avatar url={avatarUrl} name={name} email="" large />
        <span>
          <strong>{name}</strong>
          {status && (
            <small className={status.active ? "is-active" : ""}>
              <i aria-hidden="true" />
              {status.label}
            </small>
          )}
        </span>
      </span>

      <span className="member-presence-facts">
        {facts.map((fact) => (
          <span key={fact.label}>
            {fact.icon}
            <span>
              <small>{fact.label}</small>
              <strong>{fact.value}</strong>
            </span>
          </span>
        ))}
      </span>
    </>
  );
}
