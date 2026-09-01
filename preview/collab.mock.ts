/* The preview has no collaboration server and no network. Every note gets a
   Yjs document seeded from the fixture and kept in memory, so the editor mounts
   and behaves exactly as it does against a real server — with one participant
   and nothing to converge. */
import { useEffect, useMemo, useState } from "react";
import * as Y from "yjs";
import { collaborationColor, seedDocument } from "@/features/editor/lib/ydoc";
import type {
  CollaborationIdentity,
  CollaborativeNote,
  Peer,
} from "@/lib/collab";
import { FIXTURE_NOTES, PREVIEW_U2 } from "./fixture";

export { collaborationColor };
export type { CollaborationIdentity, CollaborativeNote, ConnectionState, Peer } from "@/lib/collab";

const documents = new Map<string, Y.Doc>();

export function useCollaborativeNote(
  noteId: string | null,
  identity: CollaborationIdentity | null,
): CollaborativeNote {
  const [, redraw] = useState(0);

  useEffect(() => {
    if (noteId && !documents.has(noteId)) {
      const note = FIXTURE_NOTES.find((candidate) => candidate.id === noteId);
      documents.set(noteId, seedDocument(note?.title ?? "", note?.content));
      redraw((n) => n + 1);
    }
  }, [noteId]);

  if (!noteId || !identity) {
    return { doc: null, provider: null, ready: false, connection: "connecting", refusal: "" };
  }
  const doc = documents.get(noteId) ?? null;
  return { doc, provider: null, ready: Boolean(doc), connection: "connected", refusal: "" };
}

/* The presence stand-in already puts the other member on whichever note you
   are reading, so that the reader pill and its caret can be looked at with one
   browser. That was wasted while this returned nothing: the pill is drawn from
   awareness, not from the presence channel, so with no peer here it could
   never appear. One peer, on whatever note is open. */
export function useCollaborationPeers(_provider: unknown, selfId: string | null): Peer[] {
  return useMemo(
    () =>
      selfId === PREVIEW_U2
        ? []
        : [
            {
              clientId: 2,
              userId: PREVIEW_U2,
              name: "Partner",
              color: collaborationColor(PREVIEW_U2),
            },
          ],
    [selfId],
  );
}
