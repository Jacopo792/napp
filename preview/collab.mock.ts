/* The preview has no collaboration server and no network. Every note gets a
   Yjs document seeded from the fixture and kept in memory, so the editor mounts
   and behaves exactly as it does against a real server — with one participant
   and nothing to converge. */
import { useEffect, useState } from "react";
import * as Y from "yjs";
import { seedDocument } from "@/features/editor/lib/ydoc";
import type {
  CollaborationIdentity,
  CollaborativeNote,
  Peer,
} from "@/lib/collab";
import { FIXTURE_NOTES } from "./fixture";

export { collaborationColor } from "@/features/editor/lib/ydoc";
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

export function useCollaborationPeers(): Peer[] {
  return [];
}
