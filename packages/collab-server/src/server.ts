/* The collaboration server.
 *
 * One WebSocket endpoint, one note per document name. It does three things and
 * nothing else: decide whether a connection may open a note, hand that
 * connection the note's Yjs document, and write the document back when it
 * actually changes.
 *
 * It is not a second source of truth. Authorisation is Supabase's, read
 * through the caller's own token so row level security answers exactly as it
 * answers the browser — and it is read again and again, not once at the
 * handshake, because a socket outlives a membership. `authorize.ts` is that
 * single answer; every hook below asks it rather than deciding anything.
 *
 * Awareness — cursors, selections, who is on the page — passes through, is
 * never stored, and never carries what a browser says about who it is.
 *
 * Configuration arrives as an argument rather than out of `process.env`, which
 * is what lets the tests stand two of these up against one Redis and drive
 * real clients through both. */
import { Redis } from "@hocuspocus/extension-redis";
import { Server, type Extension } from "@hocuspocus/server";
import { createClient } from "@supabase/supabase-js";
import IORedis from "ioredis";
import {
  broken as lockBroken,
  guard as lockGuard,
  restore as restoreLocked,
  type Guard,
} from "@notes-app/core/editor/writeLocks.ts";
import { noteIdOf, originAllowed } from "./access.ts";
import { createAuthorizer, supabaseLookup, type Authorizer } from "./authorize.ts";
import { loadDocument, storeDocument } from "./documents.ts";

export interface CollaborationConfig {
  supabaseUrl: string;
  publishableKey: string;
  serviceRoleKey: string;
  allowedOrigins: string[];
  port: number;
  /** How long a burst of keystrokes is gathered before it becomes one save. */
  debounce?: number;
  /** How long an authorisation answer is trusted before the archive is asked
   *  again. This is the delay between losing access and being cut off. */
  authorizationTtl?: number;
  /** How often the server asks a connected client for a fresh access token.
   *  Each answer is a full, uncached authorisation. */
  tokenRefresh?: number;
  /** The bus between instances. Without it this process is on its own, which
   *  is correct for one instance and wrong for two. */
  redisUrl?: string;
  /** Names this instance on that bus. */
  instanceName?: string;
}

/** Answer a probe and stop Hocuspocus from handling the request itself. A
 *  falsy throw is its way of saying "already answered". */
function respond(
  response: {
    writeHead(status: number, headers: Record<string, string>): void;
    end(body: string): void;
  },
  status: number,
  body: Record<string, unknown>,
): never {
  response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
  throw null;
}

/** Every dependency probe is bounded, so an unreachable backend answers the
 *  probe with "not ready" rather than making the platform wait on a socket
 *  that will never reply. */
const PROBE_MS = 1200;

async function within<T>(work: PromiseLike<T>): Promise<T | null> {
  return Promise.race([
    Promise.resolve(work).catch(() => null),
    new Promise<null>((resolve) => setTimeout(resolve, PROBE_MS)),
  ]);
}

export interface Context {
  userId: string;
  noteId: string;
  archiveId: string;
  /** The nickname the archive holds, not one a browser offered. */
  name: string;
  color: string;
  /** The most recent token this connection proved itself with. Kept so an
   *  update can be revalidated without asking the client mid-keystroke. */
  token: string;
  /** When this connection opened this note. Stamped once, in `onAuthenticate`,
   *  and broadcast with the awareness identity so every reader is told the
   *  same time rather than the moment their own tab happened to notice. */
  since: string;
}

/* What one connection has to have remembered for the message being applied.
 *
 * A note nobody has locked a passage of stores nothing: `lockGuard` walks the
 * document once, finds no foreign lock, and answers null, which is the cost of
 * this whole feature on every note that does not use it. Only a note somebody
 * has taken a passage of pays for the projection that makes putting it back
 * possible.
 *
 * Keyed by connection rather than kept on the context, because it is about the
 * message in flight and nothing else — and a WeakMap forgets it when the
 * socket goes, without anybody having to. */
const guards = new WeakMap<object, Guard | null>();

function redisExtension(config: CollaborationConfig): Extension[] {
  if (!config.redisUrl) return [];
  return [
    new Redis({
      /* A fresh client per call: the extension keeps a publisher and a
         subscriber, and a subscribed ioredis connection accepts no commands. */
      createClient: () =>
        new IORedis(config.redisUrl as string, {
          maxRetriesPerRequest: null,
          // Redis is the bus, never the record. If it is briefly away the
          // instance keeps serving its own clients and rejoins on its own;
          // what is already in Postgres is untouched either way.
          enableOfflineQueue: true,
          lazyConnect: false,
        }),
      identifier: config.instanceName ?? `notes-collab-${process.pid}`,
      prefix: "notes-collab",
    }) as unknown as Extension,
  ];
}

export function createCollaborationServer(config: CollaborationConfig): Server<Context> {
  /* The only holder of the service role in the whole system. It persists what
     an already-granted connection wrote; it never decides who may write. */
  const service = createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  /** The caller, as Postgres sees them. */
  const asCaller = (token: string) =>
    createClient(config.supabaseUrl, config.publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

  /* The bus, asked whether it is there. `null` means this deployment has no
     bus at all, which is correct for a single instance and must not be
     reported as unready.

     A client per probe rather than a pooled one: readiness runs every few
     seconds, connect-ping-quit costs a round trip, and nothing is left holding
     the event loop open when the server is destroyed — which is what a
     long-lived probe client would do to every test in this directory.
     ponytail: per-probe client; pool it if readiness ever becomes a hot path. */
  async function probeRedis(): Promise<boolean | null> {
    if (!config.redisUrl) return null;
    const client = new IORedis(config.redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: () => null,
    });
    /* A refused connection is the answer this probe wanted, not an unhandled
       error event on the way to it. */
    client.on("error", () => undefined);
    const answered = await within(
      client
        .connect()
        .then(() => client.ping())
        .then((reply) => reply === "PONG"),
    );
    client.disconnect();
    return answered === true;
  }

  const authorize: Authorizer = createAuthorizer(supabaseLookup(asCaller), {
    ttl: config.authorizationTtl ?? 5000,
  });
  const tokenRefresh = config.tokenRefresh ?? 60_000;

  return new Server<Context>({
    port: config.port,
    name: config.instanceName ?? "notes-collab",
    quiet: true,
    /* A save is a database transaction: batch a burst of keystrokes into one,
       but never let a long unbroken session go unsaved.

       It was 2000, and that number is most of what "editing a note is very
       slow" is. Nothing about an edit is visible to the other member — or in
       your own list, where the stamp and the ordering live — until this has
       fired, the projection has landed in Postgres and Realtime has said so. Two
       seconds of it was the debounce alone.

       1000 halves that for one more write per second of unbroken typing, which
       for an archive built for two people is not a number worth protecting. The
       client coalesces its end of it, so the extra announcements cost one
       snapshot read between them rather than one each. */
    debounce: config.debounce ?? 1000,
    maxDebounce: 10000,
    // Handled by the caller, so the flush can be awaited and logged.
    stopOnSignals: false,
    extensions: redisExtension(config),

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

      const answer = await authorize(token, noteId, { fresh: true });
      if (!answer.allowed) throw new Error(answer.reason);

      connectionConfig.readOnly = answer.readOnly;
      return {
        userId: answer.identity.userId,
        noteId,
        archiveId: answer.archiveId,
        name: answer.identity.name,
        color: answer.identity.color,
        token,
        /* When this client opened *this note*, stamped once, here. The browser
           used to answer "in this note since" from the moment it first saw the
           peer in awareness, which is a fact about the reader rather than
           about the peer: open a note somebody has been writing in all evening
           and it said they arrived just now. One socket carries every note, so
           this hook runs per document subscription and the stamp is the note's,
           not the session's. */
        since: new Date().toISOString(),
      };
    },

    /* The handshake is a moment; a socket is an afternoon. Ask the client for a
       fresh token on a schedule, and treat every answer as a full
       authorisation — that is how a revoked member stops being connected
       without anybody having to reload. */
    async connected({ connection }) {
      const timer = setInterval(() => connection.requestToken(), tokenRefresh);
      connection.onClose(() => clearInterval(timer));
    },

    async onTokenSync({ documentName, token, connection, connectionConfig }) {
      const noteId = noteIdOf(documentName);
      if (!noteId) return;

      const answer = await authorize(token, noteId, { fresh: true });
      if (!answer.allowed) {
        connection.close();
        return;
      }
      connection.context.token = token;
      connection.readOnly = answer.readOnly;
      connectionConfig.readOnly = answer.readOnly;
    },

    /* Before anything is applied. The answer is cached for `authorizationTtl`,
       so this is a map lookup for all but one keystroke in a few seconds —
       and the flag it sets is read by the receiver on this very message, so a
       demotion takes effect on the update that arrives after it. */
    async beforeHandleMessage({ connection, context, documentName, document }) {
      const noteId = noteIdOf(documentName);
      if (!noteId || !context?.token) return;

      const answer = await authorize(context.token, noteId);
      if (!answer.allowed) {
        connection.close();
        throw new Error(answer.reason);
      }
      connection.readOnly = answer.readOnly;

      /* A passage the other member has taken back is the one boundary Postgres
         cannot hold: the mark lives inside a document both of them are
         entitled to write, so no policy will ever see it. It is held here
         instead, and held the only way a CRDT allows — by remembering what the
         locked passages said before this message and putting them back
         afterwards if they no longer say it. */
      guards.set(connection, answer.readOnly ? null : lockGuard(document, context.userId));
    },

    /* The message has been applied and broadcast is next. Nothing but a
       document somebody else holds a passage of gets this far with a guard. */
    async afterHandleMessage({ connection, document }) {
      const before = guards.get(connection);
      guards.delete(connection);
      if (!before || !lockBroken(document, before)) return;
      restoreLocked(document, before);
    },

    /* Nothing a browser says about who it is, is believed. The identity that
       reaches everybody else is the one the archive gave this server, and the
       colour is derived from the account id rather than chosen. */
    async beforeHandleAwareness({ states, context }) {
      if (!context) return;
      for (const [clientId, state] of states) {
        if (!state) continue;
        states.set(clientId, {
          ...state,
          user: {
            userId: context.userId,
            name: context.name,
            color: context.color,
            since: context.since,
          },
        });
      }
    },

    async onLoadDocument({ documentName, document }) {
      await loadDocument(service, noteIdOf(documentName)!, document);
      return document;
    },

    async onStoreDocument({ documentName, document }) {
      await storeDocument(service, noteIdOf(documentName)!, document);
    },

    /* Two probes, and the difference between them is the whole point.
       `/healthz` is liveness: this process is up and its event loop is
       turning. It must never consult a dependency, or a Supabase outage
       restarts every instance for a fault that is not theirs.
       `/readyz` is readiness: every backend this process needs to serve a
       document answered within `PROBE_MS`. Render takes an unready instance
       out of rotation and leaves it running, which is the correct response to
       a database that is briefly away. */
    async onRequest({ request, response }) {
      if (request.url === "/healthz") {
        return respond(response, 200, { status: "ok" });
      }
      if (request.url === "/readyz") {
        const [supabaseOk, redisOk] = await Promise.all([
          within(
            service
              .from("archives")
              .select("id", { head: true, count: "exact" })
              .limit(1)
              .then((result) => !result.error),
          ),
          probeRedis(),
        ]);
        const checks = { supabase: supabaseOk === true, redis: redisOk };
        const ready = checks.supabase && checks.redis !== false;
        return respond(response, ready ? 200 : 503, {
          status: ready ? "ok" : "unavailable",
          checks,
        });
      }
    },
  });
}
