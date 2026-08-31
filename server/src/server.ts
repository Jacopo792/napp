/* The collaboration server.
 *
 * One process, one WebSocket endpoint, one note per document name. It does
 * three things and nothing else: decide whether a connection may open a note,
 * hand that connection the note's Yjs document, and write the document back
 * when it actually changes.
 *
 * It is not a second source of truth. Authorisation is Supabase's, read
 * through the caller's own token so row level security answers exactly as it
 * answers the browser. Awareness — cursors, selections, who is on the page —
 * passes through and is never stored.
 *
 * Configuration arrives as an argument rather than out of `process.env`, which
 * is what lets the integration test stand one of these up against a local
 * Supabase and drive two real clients through it. */
import { Server } from "@hocuspocus/server";
import { createClient } from "@supabase/supabase-js";
import { decideAccess, noteIdOf, originAllowed, type NoteRow } from "./access.ts";
import { loadDocument, storeDocument } from "./documents.ts";

export interface CollaborationConfig {
  supabaseUrl: string;
  publishableKey: string;
  serviceRoleKey: string;
  allowedOrigins: string[];
  port: number;
  /** How long a burst of keystrokes is gathered before it becomes one save. */
  debounce?: number;
}

export interface Context {
  userId: string;
  noteId: string;
  archiveId: string;
}

export function createCollaborationServer(config: CollaborationConfig): Server<Context> {
  /* The only holder of the service role in the whole system. It persists what
     an already-granted connection wrote; it never decides who may write. */
  const service = createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  /** The caller, as Postgres sees them. Every read below goes through row level
   *  security, so a note the archive withholds is withheld here too. */
  const asCaller = (token: string) =>
    createClient(config.supabaseUrl, config.publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

  return new Server<Context>({
    port: config.port,
    name: "notes-collab",
    quiet: true,
    // A save is a database transaction: batch a burst of keystrokes into one,
    // but never let a long unbroken session go unsaved.
    debounce: config.debounce ?? 2000,
    maxDebounce: 10000,
    // Handled by the caller, so the flush can be awaited and logged.
    stopOnSignals: false,

    /* Refused before the WebSocket exists at all. `onConnect` below is the
       same check one layer in, for a socket that reached a document by another
       route; this one keeps a foreign page from holding a connection open. A
       falsy throw is Hocuspocus's way of saying "handled, do not upgrade". */
    async onUpgrade({ request, socket }) {
      if (!originAllowed(request.headers.origin, config.allowedOrigins)) {
        socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
        socket.destroy();
        throw null;
      }
    },

    async onConnect({ requestHeaders }) {
      if (!originAllowed(requestHeaders.get("origin"), config.allowedOrigins)) {
        throw new Error("This origin may not connect");
      }
    },

    async onAuthenticate({ documentName, token, connectionConfig }) {
      const noteId = noteIdOf(documentName);
      if (!noteId) throw new Error("That is not a note");

      const caller = asCaller(token);
      const { data: identity, error } = await caller.auth.getUser(token);
      if (error || !identity?.user) throw new Error("Sign in again");

      const note = await caller
        .from("notes")
        .select("id, archive_id, trashed_at")
        .eq("id", noteId)
        .maybeSingle();
      if (note.error) throw new Error(note.error.message);

      const membership = note.data
        ? await caller
            .from("archive_members")
            .select("role")
            .eq("archive_id", (note.data as NoteRow).archive_id)
            .eq("user_id", identity.user.id)
            .maybeSingle()
        : { data: null, error: null };
      if (membership.error) throw new Error(membership.error.message);

      const access = decideAccess(
        (note.data as NoteRow | null) ?? null,
        (membership.data as { role: string } | null)?.role ?? null,
      );
      if (!access.allowed) throw new Error(access.reason);

      connectionConfig.readOnly = access.readOnly;
      return { userId: identity.user.id, noteId, archiveId: access.archiveId };
    },

    async onLoadDocument({ documentName, document }) {
      await loadDocument(service, noteIdOf(documentName)!, document);
      return document;
    },

    async onStoreDocument({ documentName, document }) {
      await storeDocument(service, noteIdOf(documentName)!, document);
    },

    async onRequest({ request, response }) {
      if (request.url === "/healthz") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ status: "ok" }));
        /* Hocuspocus's own convention: its request handler swallows a falsy
           throw and writes its welcome page for anything that returns, so this
           is how a hook says "answered, stop here". */
        throw null;
      }
    },
  });
}
