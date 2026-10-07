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
 * Local stores are scoped to both archive and account, and they do put words
 * on screen — but they never decide that they may. What authorises a note's
 * *display* is Postgres: `notes.tsx` opens an editor only for a note in the
 * catalogue row level security just returned, and a member who has lost access
 * is handed no such row. What authorises a *write* is still the collaboration
 * server, on every message. Losing the network keeps the mounted editor usable
 * and reconnect sends its Yjs updates normally. */
import {
  HocuspocusProvider,
  HocuspocusProviderWebsocket,
  WebSocketStatus,
} from "@hocuspocus/provider";
import { useEffect, useMemo, useRef, useState } from "react";
import { IndexeddbPersistence } from "y-indexeddb";
import * as Y from "yjs";
import { BODY_FRAGMENT, collaborationColor, TITLE_TEXT } from "@/features/editor/lib/ydoc";
import { supabase } from "./supabaseClient";

const COLLAB_URL = import.meta.env.VITE_COLLAB_URL as string;

export type ConnectionState = "connecting" | "connected" | "offline";

/** How long a note may take to open before the wait is explained rather than
 *  merely displayed. Short enough that nobody stares at "Connecting" wondering
 *  whether it is broken; long enough that an ordinary open never trips it. */
const WAKING_AFTER_MS = 4000;

/** How long a note may go on not opening before the socket under it is assumed
 *  hung rather than slow. Comfortably past the fifty seconds a sleeping Render
 *  instance takes, so an honest cold start is never interrupted. */
const STALLED_AFTER_MS = 120_000;

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
  /** When the peer opened this note, stamped by the server in its awareness
   *  identity so every reader is told the same time. Falls back to the moment
   *  this browser first saw them, which is what it always used to be and is
   *  wrong by however long they were already here. */
  joinedAt: string;
  /** Writing at this moment. Read from awareness — the same source as the face
   *  beside it, so the two can never disagree about whether she is here. */
  typing: boolean;
}

export interface CollaborativeNote {
  doc: Y.Doc | null;
  provider: HocuspocusProvider | null;
  /** The editor may mount: this is a document the archive actually holds. */
  ready: boolean;
  /** This device already has the note, and the catalogue Postgres returned
   *  under RLS a moment ago still lists it — so the words can go on screen
   *  while the socket is still on its way. Never true for an empty store. */
  cached: boolean;
  connection: ConnectionState;
  /** Why the server closed the door: signed out, not a member, no such note. */
  refusal: string;
  /** Unready for long enough that this is the server rather than the network.
   *  On the free Render plan it is almost always sleep, which takes about
   *  fifty seconds — a wait worth naming, because the note refusing to open
   *  with no reason given is exactly what a fault looks like from a chair. */
  waking: boolean;
}

const CLOSED: CollaborativeNote = {
  doc: null,
  provider: null,
  ready: false,
  cached: false,
  connection: "connecting",
  refusal: "",
  waking: false,
};

export { collaborationColor };

/* One socket for the whole session, not one per note.
 *
 * A `HocuspocusProvider` given a `url` builds and owns its own WebSocket, and
 * destroys it again when the note closes — so every note switch paid a fresh
 * TCP handshake, a TLS handshake and a token round trip before it could even
 * ask for the document. Hocuspocus already multiplexes documents by name over
 * one socket; this is the same arrangement `packages/collab-server/src/integration.test.ts`
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

/* The one way that socket does not come back on its own.
 *
 * `HocuspocusProviderWebsocket` reconnects itself from a *close*, and it closes
 * a connection that has gone quiet for thirty seconds — but a connection
 * *attempt* has no timeout at all (`timeout: 0`), and a half-open socket left
 * behind by a slept laptop or a changed network never opens, never errors and
 * never closes. The status then sits at "connecting" for ever: `checkConnection`
 * returns early because it only watches a socket that says it is connected, and
 * `attach()` reconnects only a socket that says it is disconnected, so opening
 * another note does not help either. Nothing in the window is broken and nothing
 * is retrying — which on screen is "Waking the server" that never ends.
 *
 * `connect()` is the way back: it cancels the stale attempt, and its first new
 * attempt drops the hung socket's listeners before replacing it, so the corpse
 * cannot fire a close at the connection that replaced it. */
export function wakeCollaboration(): void {
  if (!shared || shared.status === WebSocketStatus.Connected) return;
  void shared.connect();
}

/* The notes opened lately, kept open.
 *
 * Every note switch used to destroy the document, its local store and its
 * provider, and build all three again on the way back: a fresh IndexedDB read,
 * an auth message and a sync round trip to Frankfurt before a single word could
 * go on screen — 350 to 550 ms measured in Safari for a note left a few seconds
 * earlier, during which the page sat empty under "Connecting". Kept open on the
 * one shared socket, a document stays synced for nothing and comes back at
 * once.
 *
 * Kept is not *present*: a parked note publishes no awareness, so the other
 * member never sees you on a page you have left. It still decides nothing about
 * access — the editor mounts only for a note in the catalogue RLS returned, and
 * the server authorises every write on the socket it already rechecks. Scoped
 * to the account and the archive, and dropped wholesale on sign-out. */
const KEPT = 8;

interface Held {
  key: string;
  doc: Y.Doc;
  provider: HocuspocusProvider;
  local: IndexeddbPersistence;
  state: Omit<CollaborativeNote, "waking">;
  users: number;
  listeners: Set<(state: Omit<CollaborativeNote, "waking">) => void>;
}

const held = new Map<string, Held>();

function drop(entry: Held): void {
  held.delete(entry.key);
  entry.provider.destroy();
  void entry.local.destroy();
  entry.doc.destroy();
}

/* Least recently released first: `Map` keeps insertion order, and a note is
   re-inserted each time it is opened. */
function trim(scope: string): void {
  for (const entry of [...held.values()]) {
    if (entry.users === 0 && !entry.key.startsWith(scope)) drop(entry);
  }
  const idle = [...held.values()].filter((entry) => entry.users === 0);
  for (const entry of idle.slice(0, Math.max(0, idle.length - KEPT))) drop(entry);
}

supabase.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") for (const entry of [...held.values()]) drop(entry);
});

function acquire(archiveId: string, userId: string, noteId: string): Held {
  const scope = `${archiveId}:${userId}:`;
  const key = scope + noteId;
  const existing = held.get(key);
  if (existing) {
    held.delete(key);
    held.set(key, existing);
    existing.users += 1;
    /* Parking cleared the awareness state, and `setLocalStateField` writes
       nothing into a null one — so it is given an empty one to write into. */
    if (existing.provider.awareness?.getLocalState() === null) {
      existing.provider.awareness.setLocalState({});
    }
    return existing;
  }

  const doc = new Y.Doc();
  const local = new IndexeddbPersistence(`napp:yjs:${archiveId}:${userId}:${noteId}`, doc);
  const entry: Held = {
    key,
    doc,
    local,
    provider: null as unknown as HocuspocusProvider,
    state: {
      doc,
      provider: null,
      ready: false,
      cached: false,
      connection: "connecting",
      refusal: "",
    },
    users: 1,
    listeners: new Set(),
  };
  const update = (change: Partial<CollaborativeNote>) => {
    entry.state = { ...entry.state, ...change };
    for (const listener of entry.listeners) listener(entry.state);
  };
  entry.provider = new HocuspocusProvider({
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
  entry.state = { ...entry.state, provider: entry.provider };

  /* Supplying our own websocket means the provider does not attach itself —
     `manageSocket` is only true when it built the socket. For the same
     reason `provider.destroy()` in `drop` leaves the shared socket alone. */
  entry.provider.attach();

  /* The local store, which is milliseconds away rather than a continent.
     Its job is only to put the words on screen; it decides nothing. What
     makes that safe is the caller: `notes.tsx` opens an editor for a note in
     the catalogue Postgres just returned under row level security, and a
     member who has lost access is handed no such row. An empty store is not
     a cache hit — an empty editor is worse than the bars that stand in for
     one — and this is the same `Y.Doc` the server will update, so its
     arrival is a merge into a live document, never the second build of a
     second document that once made the text paint twice. */
  void local.whenSynced.then(() => {
    if (!held.has(key)) return;
    const hasWords =
      doc.getXmlFragment(BODY_FRAGMENT).length > 0 || doc.getText(TITLE_TEXT).length > 0;
    if (hasWords) update({ cached: true });
  });

  held.set(key, entry);
  trim(scope);
  return entry;
}

function release(entry: Held): void {
  entry.users -= 1;
  if (entry.users > 0) return;
  /* Parked: still synced, no longer here. */
  entry.provider.awareness?.setLocalState(null);
  trim(entry.key.slice(0, entry.key.lastIndexOf(":") + 1));
}

/* Whose notes the list is showing, for `prefetchNote` — set by the hook,
   which is the one place that knows. */
let current: { archiveId: string; userId: string } | null = null;
let lastPrefetched = "";

/** Start opening a note the pointer has come to rest on. The second or so
 *  between a pointer arriving on a row and the click is about what the server
 *  takes to sync a note, so by the click it is usually already here. Opened
 *  and parked at once: it publishes no awareness until it is really opened. */
export function prefetchNote(noteId: string): void {
  if (!current || noteId === lastPrefetched) return;
  lastPrefetched = noteId;
  release(acquire(current.archiveId, current.userId, noteId));
}

export function useCollaborativeNote(
  noteId: string | null,
  identity: CollaborationIdentity | null,
): CollaborativeNote {
  const [state, setState] = useState<Omit<CollaborativeNote, "waking">>(CLOSED);
  const userId = identity?.userId ?? null;
  const archiveId = identity?.archiveId ?? null;
  const name = identity?.name ?? "";

  useEffect(() => {
    // Known before any note is open, so the first one can be prefetched too.
    current = userId && archiveId ? { archiveId, userId } : null;
  }, [userId, archiveId]);

  useEffect(() => {
    if (!noteId || !userId || !archiveId) {
      setState(CLOSED);
      return;
    }
    const entry = acquire(archiveId, userId, noteId);
    entry.listeners.add(setState);
    setState(entry.state);
    return () => {
      entry.listeners.delete(setState);
      release(entry);
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
    if (!awareness || !userId) return;
    /* The local caret only. What other people see is written by the server in
       `beforeHandleAwareness`, from the identity it read for itself — nothing a
       browser sends about who it is, is believed.

       Unconditional, and that is the fix rather than an oversight. This used to
       be gated on the archive-wide "live presence" preference, so a member who
       had that off vanished from the note she was typing into — and because the
       gate was on the *sender*, the other member had no way to bring her back.
       Being on a note you are both entitled to write is not a disclosure; the
       preference now decides what you *draw*, in `notes.tsx`, which is a
       question each reader can answer for themselves. */
    awareness.setLocalStateField("user", {
      userId,
      name: name || "Someone",
      color: collaborationColor(userId),
    });
  }, [provider, userId, name]);

  /* Four seconds is "the network is slow"; longer than that, on a plan whose
     server sleeps after fifteen idle minutes, is the server getting up. Held
     outside `state` so the timer cannot race the socket's own updates.

     The second timer is the one that ends a wait that was never going to end.
     It is deliberately well past the cold start: a sleeping Render instance
     leaves the connection hanging for about fifty seconds, and a nudge inside
     that window would abandon the attempt that was about to succeed and start
     the same fifty seconds again. Past two minutes there is nothing left to
     interrupt — the socket is hung, and one `connect()` is the difference
     between a note that opens and a window that has to be quit. */
  const [waking, setWaking] = useState(false);
  useEffect(() => {
    if (!noteId || state.ready || state.refusal) {
      setWaking(false);
      return;
    }
    const explain = window.setTimeout(() => setWaking(true), WAKING_AFTER_MS);
    const nudge = window.setInterval(wakeCollaboration, STALLED_AFTER_MS);
    return () => {
      window.clearTimeout(explain);
      window.clearInterval(nudge);
    };
  }, [noteId, state.ready, state.refusal]);

  return useMemo(() => ({ ...state, waking }), [state, waking]);
}

/** Who else is on this page, from awareness alone — never stored, and gone the
 *  moment a connection closes. */
export function useCollaborationPeers(
  provider: HocuspocusProvider | null,
  selfId: string | null,
): Peer[] {
  const [peers, setPeers] = useState<Peer[]>([]);
  const joinedAt = useRef(new Map<string, string>());

  useEffect(() => {
    const awareness = provider?.awareness;
    if (!awareness) {
      setPeers([]);
      return;
    }
    const peerJoinedAt = joinedAt.current;
    const read = () => {
      const seen = new Map<string, Peer>();
      for (const [clientId, state] of awareness.getStates()) {
        const user = (state as { user?: Partial<Peer> & { since?: string } }).user;
        if (!user?.userId || user.userId === selfId) continue;
        if (!peerJoinedAt.has(user.userId)) {
          peerJoinedAt.set(user.userId, new Date().toISOString());
        }
        seen.set(user.userId, {
          clientId,
          userId: user.userId,
          name: user.name || "Someone",
          color: user.color || collaborationColor(user.userId),
          joinedAt: user.since ?? peerJoinedAt.get(user.userId)!,
          typing: (state as { typing?: unknown }).typing === true,
        });
      }
      for (const userId of peerJoinedAt.keys()) {
        if (!seen.has(userId)) peerJoinedAt.delete(userId);
      }
      setPeers([...seen.values()]);
    };
    read();
    awareness.on("change", read);
    return () => {
      awareness.off("change", read);
      peerJoinedAt.clear();
    };
  }, [provider, selfId]);

  return peers;
}

/** Raise and lower the writing flag on the note's own document.
 *
 *  A flag, not a timestamp: a timestamp needs a clock, an expiry and a
 *  re-render tick in every reader to notice it lapse, for something the writer
 *  already knows. Awareness carries it beside the identity, so a reader who can
 *  see the face can always see the flag — which was not true while the two came
 *  from different channels. */
export function announceTyping(provider: HocuspocusProvider | null, typing: boolean): void {
  provider?.awareness?.setLocalStateField("typing", typing);
}
