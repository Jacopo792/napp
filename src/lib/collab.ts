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
 * Local stores are scoped to both archive and account. They are never enough
 * to open an editor on their own: the collaboration server must authorise and
 * sync the note first. Losing the network after that keeps the mounted editor
 * usable and reconnect sends its Yjs updates normally. */
import { HocuspocusProvider, HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import { useEffect, useState } from "react";
import { IndexeddbPersistence } from "y-indexeddb";
import * as Y from "yjs";
import { collaborationColor } from "@/features/editor/lib/ydoc";
import { supabase } from "./supabaseClient";

const COLLAB_URL = import.meta.env.VITE_COLLAB_URL as string;

export type ConnectionState = "connecting" | "connected" | "offline";

export interface CollaborationIdentity {
  userId: string;
  archiveId: string;
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

export { collaborationColor };

/* One socket for the whole session, not one per note.
 *
 * A `HocuspocusProvider` given a `url` builds and owns its own WebSocket, and
 * destroys it again when the note closes — so every note switch paid a fresh
 * TCP handshake, a TLS handshake and a token round trip before it could even
 * ask for the document. Hocuspocus already multiplexes documents by name over
 * one socket; this is the same arrangement `server/src/integration.test.ts`
 * connects with.
 *
 * Holding it open has a second effect worth as much as the first: the free
 * Render instance sleeps after fifteen idle minutes and takes about fifty
 * seconds to wake, and an open socket is never idle. The cold start is paid
 * once at sign-in instead of at whichever note switch happens to fall after a
 * quarter hour of reading. */
let shared: HocuspocusProviderWebsocket | null = null;

function sharedSocket(): HocuspocusProviderWebsocket {
  shared ??= new HocuspocusProviderWebsocket({ url: COLLAB_URL });
  return shared;
}

export function useCollaborativeNote(
  noteId: string | null,
  identity: CollaborationIdentity | null,
  publishPresence = false,
): CollaborativeNote {
  const [state, setState] = useState<CollaborativeNote>(CLOSED);
  const userId = identity?.userId ?? null;
  const archiveId = identity?.archiveId ?? null;
  const name = identity?.name ?? "";

  useEffect(() => {
    if (!noteId || !userId || !archiveId) {
      setState(CLOSED);
      return;
    }
    let closed = false;
    const update = (change: Partial<CollaborativeNote>) => {
      if (!closed) setState((current) => ({ ...current, ...change }));
    };

    const doc = new Y.Doc();
    const local = new IndexeddbPersistence(`napp:yjs:${archiveId}:${userId}:${noteId}`, doc);
    const provider = new HocuspocusProvider({
      websocketProvider: sharedSocket(),
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
        update({ ready: false, refusal: reason || "This note is not available to you" }),
    });

    /* Supplying our own websocket means the provider does not attach itself —
       `manageSocket` is only true when it built the socket. For the same
       reason the `provider.destroy()` below leaves the shared socket alone. */
    provider.attach();

    setState({ doc, provider, ready: false, connection: "connecting", refusal: "" });

    return () => {
      closed = true;
      provider.destroy();
      void local.destroy();
      doc.destroy();
    };
  }, [noteId, userId, archiveId]);

  /* Who you are is a separate question from which note is open, and it arrives
     later: `name` is read from the profile after sign-in and `publishPresence`
     is a preference that flips at any time. Both used to sit in the effect
     above, where either one landing mid-note destroyed the connection and
     redid the whole handshake for a caret colour. */
  const provider = state.provider;
  useEffect(() => {
    const awareness = provider?.awareness;
    if (!awareness) return;
    /* The local caret only. What other people see is written by the server in
       `beforeHandleAwareness`, from the identity it read for itself — nothing a
       browser sends about who it is, is believed. */
    if (publishPresence && userId) {
      awareness.setLocalStateField("user", {
        userId,
        name: name || "Someone",
        color: collaborationColor(userId),
      });
    } else {
      /* Presence is mutual. Do not leave a listen-only local awareness state
         that Tiptap can serialise as a cursor after the preference is off. */
      awareness.setLocalState(null);
    }
  }, [provider, publishPresence, userId, name]);

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
