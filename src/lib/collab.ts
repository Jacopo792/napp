/* The live document.
 *
 * A note is a Yjs document held in three places at once: this tab, every other
 * tab that has it open, and the collaboration server that persists it. Yjs is
 * what makes those three agree without anybody choosing a winner — two people
 * typing in the same paragraph both keep their words, in order, and there is
 * no losing copy to file away under "— your version".
 *
 * IndexedDB is the other half. It holds the document on this device, so a
 * closed laptop, a crashed tab or a train tunnel costs nothing: the words are
 * still there when the tab comes back, and they reach the archive on reconnect.
 *
 * The one thing this file is careful about is starting from nothing. A note
 * this device has never opened, on a connection that cannot reach the server,
 * must not be given a fresh empty document to type into — an empty document
 * shares no history with the real one, so reconnecting would append the whole
 * body a second time rather than merge with it. Until either IndexedDB or the
 * server hands over a document that genuinely exists, `ready` stays false and
 * the editor does not mount. */
import { HocuspocusProvider } from "@hocuspocus/provider";
import { useEffect, useState } from "react";
import { IndexeddbPersistence } from "y-indexeddb";
import * as Y from "yjs";
import { isUntouched } from "@/features/editor/lib/ydoc";
import { supabase } from "./supabaseClient";

const COLLAB_URL = import.meta.env.VITE_COLLAB_URL as string;

export type ConnectionState = "connecting" | "connected" | "offline";

export interface CollaborationIdentity {
  userId: string;
  name: string;
}

export interface Peer {
  clientId: number;
  userId: string;
  name: string;
  color: string;
}

export interface CollaborativeNote {
  doc: Y.Doc | null;
  provider: HocuspocusProvider | null;
  /** The editor may mount: this is a document the archive actually holds. */
  ready: boolean;
  connection: ConnectionState;
  /** Why the server closed the door: signed out, not a member, no such note. */
  refusal: string;
}

const CLOSED: CollaborativeNote = {
  doc: null,
  provider: null,
  ready: false,
  connection: "connecting",
  refusal: "",
};

/** One hue per account, the same in every tab and on every device, so a caret
 *  in the margin belongs to a person rather than to a session. */
export function collaborationColor(userId: string): string {
  let hash = 0;
  for (let index = 0; index < userId.length; index++) {
    hash = (hash * 31 + userId.charCodeAt(index)) >>> 0;
  }
  return `hsl(${hash % 360} 64% 62%)`;
}

export function useCollaborativeNote(
  noteId: string | null,
  identity: CollaborationIdentity | null,
): CollaborativeNote {
  const [state, setState] = useState<CollaborativeNote>(CLOSED);
  const userId = identity?.userId ?? null;
  const name = identity?.name ?? "";

  useEffect(() => {
    if (!noteId || !userId) {
      setState(CLOSED);
      return;
    }
    let closed = false;
    const update = (change: Partial<CollaborativeNote>) => {
      if (!closed) setState((current) => ({ ...current, ...change }));
    };

    const doc = new Y.Doc();
    const local = new IndexeddbPersistence(`napp:note:${noteId}`, doc);
    const provider = new HocuspocusProvider({
      url: COLLAB_URL,
      name: noteId,
      document: doc,
      /* A function, not a string: the socket reconnects long after the access
         token that opened it has expired, and this is asked again each time. */
      token: async () => (await supabase.auth.getSession()).data.session?.access_token ?? "",
      onSynced: () => update({ ready: true, refusal: "" }),
      onStatus: ({ status }) =>
        update({ connection: status === "connected" ? "connected" : "connecting" }),
      onDisconnect: () => update({ connection: "offline" }),
      onAuthenticationFailed: ({ reason }) =>
        update({ refusal: reason || "This note is not available to you" }),
    });

    provider.awareness?.setLocalStateField("user", {
      userId,
      name: name || "Someone",
      color: collaborationColor(userId),
    });

    setState({ doc, provider, ready: false, connection: "connecting", refusal: "" });

    void local.whenSynced.then(() => {
      // Something is stored for this note on this device, which means the
      // archive handed it over at least once. Its history is real, so it is
      // safe to type into before the server answers — and that is the whole of
      // working offline.
      if (!isUntouched(doc)) update({ ready: true });
    });

    return () => {
      closed = true;
      provider.destroy();
      void local.destroy();
      doc.destroy();
    };
  }, [noteId, userId, name]);

  return state;
}

/** Who else is on this page, from awareness alone — never stored, and gone the
 *  moment a connection closes. */
export function useCollaborationPeers(
  provider: HocuspocusProvider | null,
  selfId: string | null,
): Peer[] {
  const [peers, setPeers] = useState<Peer[]>([]);

  useEffect(() => {
    const awareness = provider?.awareness;
    if (!awareness) {
      setPeers([]);
      return;
    }
    const read = () => {
      const seen = new Map<string, Peer>();
      for (const [clientId, state] of awareness.getStates()) {
        const user = (state as { user?: Partial<Peer> }).user;
        if (!user?.userId || user.userId === selfId) continue;
        seen.set(user.userId, {
          clientId,
          userId: user.userId,
          name: user.name || "Someone",
          color: user.color || collaborationColor(user.userId),
        });
      }
      setPeers([...seen.values()]);
    };
    read();
    awareness.on("change", read);
    return () => awareness.off("change", read);
  }, [provider, selfId]);

  return peers;
}
