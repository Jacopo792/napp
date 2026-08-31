/* Two instances, one archive.
 *
 * Render replaces a service by starting the new instance before it stops the
 * old one, so "one instance" is a lie for about a minute of every deploy — and
 * during that minute two processes hold the same note. Without a bus between
 * them each has its own copy: two people editing the same note see nothing of
 * each other, and whichever instance saves last writes the other's work away.
 *
 * Redis is that bus, and only that. Postgres remains the record; nothing here
 * is durable, which is why the store is allowed to evict and why losing it
 * costs a reconnect rather than a document.
 *
 * Needs a local Supabase and a local Redis or Valkey. Both are started by the
 * backend job in CI, and both are skipped — loudly — when they are missing. */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { HocuspocusProvider, HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import type { Server } from "@hocuspocus/server";
import IORedis from "ioredis";
import WebSocket from "ws";
import * as Y from "yjs";
import { BODY_FRAGMENT, TITLE_TEXT } from "../../src/features/editor/lib/ydoc.ts";
import { asService, localStack, makeAccount, type Account, type LocalStack } from "./fixture.ts";
import { createCollaborationServer, type Context } from "./server.ts";

const ORIGIN = "http://localhost:5173";
const REDIS_URL = process.env.REDIS_URL ?? "redis://127.0.0.1:6380";
const stack = localStack();

class BrowserWebSocket extends WebSocket {
  constructor(url: string | URL, protocols?: string | string[]) {
    super(url, protocols, { origin: ORIGIN });
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function until(check: () => boolean, timeout = 15000): Promise<void> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (check()) return;
    await sleep(50);
  }
  throw new Error("timed out waiting for a condition");
}

async function redisReachable(): Promise<boolean> {
  const client = new IORedis(REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });
  try {
    await client.connect();
    await client.ping();
    return true;
  } catch {
    return false;
  } finally {
    client.disconnect();
  }
}

/* In CI the stack is started for this job, so a missing one is a broken job
   rather than a reason to pass quietly. Nothing here may report success
   because it was skipped. */
function refuseToSkip(reason: string | false): string | false {
  if (reason && process.env.REQUIRE_INTEGRATION === "1") {
    throw new Error(`REQUIRE_INTEGRATION is set and the suite cannot run: ${reason}`);
  }
  return reason;
}

const reachable = stack ? await redisReachable() : false;
const skip = refuseToSkip(
  !stack
    ? "run `supabase start` first"
    : !reachable
      ? `no Redis at ${REDIS_URL} — start one with \`docker run -p 6380:6379 valkey/valkey:8-alpine\``
      : false,
);

describe("two instances behind one archive", { skip }, () => {
  const local = stack as LocalStack;
  const instances: Server<Context>[] = [];
  const sockets: HocuspocusProviderWebsocket[] = [];
  const ports: number[] = [];
  let author: Account;
  let archiveId: string;

  /* Long enough that nothing is written to Postgres while a test runs. What is
     being tested is what crosses between the two processes, and a save in the
     middle would let a test pass for the wrong reason. */
  const NEVER_SAVES = 60_000;

  function connect(noteId: string, token: string, instance: number) {
    const socket = new HocuspocusProviderWebsocket({
      url: `ws://127.0.0.1:${ports[instance]}`,
      WebSocketPolyfill: BrowserWebSocket as unknown as typeof WebSocket,
    });
    sockets.push(socket);
    const doc = new Y.Doc();
    const provider = new HocuspocusProvider({
      websocketProvider: socket,
      name: noteId,
      document: doc,
      token,
    });
    provider.attach();
    return { doc, provider };
  }

  async function newNote(title: string, body: string): Promise<string> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const inserted = await author.client.from("notes").insert({
      id,
      archive_id: archiveId,
      owner_id: author.userId,
      title,
      body,
      content: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: body }] }],
      },
      content_version: 1,
      created_at: now,
      updated_at: now,
    });
    assert.equal(inserted.error, null, inserted.error?.message);
    return id;
  }

  function appendTitle(doc: Y.Doc, text: string) {
    const title = doc.getText(TITLE_TEXT);
    title.insert(title.length, text);
  }

  function appendParagraph(doc: Y.Doc, text: string) {
    const element = new Y.XmlElement("paragraph");
    const content = new Y.XmlText();
    content.insert(0, text);
    element.insert(0, [content]);
    const fragment = doc.getXmlFragment(BODY_FRAGMENT);
    fragment.insert(fragment.length, [element]);
  }

  const bodyOf = (doc: Y.Doc) => JSON.stringify(doc.getXmlFragment(BODY_FRAGMENT).toJSON());

  before(async () => {
    author = await makeAccount(local, "author");
    const bootstrap = await author.client.rpc("ensure_personal_archive");
    assert.equal(bootstrap.error, null, bootstrap.error?.message);
    archiveId = bootstrap.data as string;

    for (const offset of [0, 1]) {
      const port = 9600 + Math.floor(Math.random() * 200) + offset * 300;
      ports.push(port);
      const server = createCollaborationServer({
        supabaseUrl: local.apiUrl,
        publishableKey: local.publishableKey,
        serviceRoleKey: local.serviceRoleKey,
        allowedOrigins: [ORIGIN],
        port,
        debounce: NEVER_SAVES,
        redisUrl: REDIS_URL,
        instanceName: `test-instance-${offset}`,
      });
      instances.push(server);
      await server.listen();
    }
  });

  after(async () => {
    for (const socket of sockets) socket.destroy();
    for (const server of instances) await server?.destroy();
  });

  it("carries title and body between clients on different instances", async () => {
    const noteId = await newNote("Deploy window", "the original line");
    const here = connect(noteId, author.token, 0);
    await until(() => here.provider.isSynced);
    const there = connect(noteId, author.token, 1);
    await until(() => there.provider.isSynced);

    appendTitle(here.doc, " — from one");
    appendParagraph(there.doc, "written on the other instance");

    await until(
      () =>
        here.doc.getText(TITLE_TEXT).toString() === there.doc.getText(TITLE_TEXT).toString() &&
        bodyOf(here.doc) === bodyOf(there.doc),
    );

    const title = here.doc.getText(TITLE_TEXT).toString();
    assert.ok(title.includes("Deploy window") && title.includes("from one"), title);
    assert.match(bodyOf(here.doc), /the original line/);
    assert.match(bodyOf(here.doc), /written on the other instance/);

    here.provider.destroy();
    there.provider.destroy();
  });

  it("converges concurrent edits from both instances into one document", async () => {
    const noteId = await newNote("Both at once", "start");
    const here = connect(noteId, author.token, 0);
    const there = connect(noteId, author.token, 1);
    await until(() => here.provider.isSynced && there.provider.isSynced);

    // Interleaved, with no pause between them: the two updates cross on the bus.
    appendTitle(here.doc, " A");
    appendTitle(there.doc, " B");
    appendTitle(here.doc, " C");
    appendTitle(there.doc, " D");

    await until(
      () => here.doc.getText(TITLE_TEXT).toString() === there.doc.getText(TITLE_TEXT).toString(),
    );
    const title = here.doc.getText(TITLE_TEXT).toString();
    for (const letter of ["A", "B", "C", "D"]) {
      assert.ok(title.includes(letter), `${letter} was lost: ${title}`);
    }

    here.provider.destroy();
    there.provider.destroy();
  });

  it("does not let a second instance load a stale snapshot over live work", async () => {
    const noteId = await newNote("No overwriting", "as saved in Postgres");

    // One instance holds unsaved work: the debounce above guarantees Postgres
    // still has the original text.
    const here = connect(noteId, author.token, 0);
    await until(() => here.provider.isSynced);
    appendParagraph(here.doc, "typed but not yet saved");
    await sleep(400);

    const stored = await asService(local).from("notes").select("body").eq("id", noteId).single();
    assert.ok(
      !(stored.data as { body: string }).body.includes("typed but not yet saved"),
      "the test needs the note to still be unsaved at this point",
    );

    // The second instance loads the note for the first time. Loading it from
    // Postgres alone would hand this client the old text and, worse, would put
    // an older document on the bus.
    const there = connect(noteId, author.token, 1);
    await until(() => there.provider.isSynced);
    await until(() => bodyOf(there.doc).includes("typed but not yet saved"));

    assert.match(bodyOf(there.doc), /typed but not yet saved/);
    assert.match(
      bodyOf(here.doc),
      /typed but not yet saved/,
      "the live instance lost its own work",
    );

    here.provider.destroy();
    there.provider.destroy();
  });

  it("shows each client who is on the other instance", async () => {
    const mate = await makeAccount(local, "mate");
    const seats = await author.client
      .from("archives")
      .update({ seat_limit: 4 })
      .eq("id", archiveId);
    assert.equal(seats.error, null, seats.error?.message);
    const invite = await author.client.rpc("create_archive_invite", {
      archive_id: archiveId,
      email: mate.email,
      role: "editor",
    });
    assert.equal(invite.error, null, invite.error?.message);
    const claimed = await mate.client.rpc("claim_archive_invite", { token: invite.data as string });
    assert.equal(claimed.error, null, claimed.error?.message);

    const noteId = await newNote("Cursors", "who else is here");
    const here = connect(noteId, author.token, 0);
    const there = connect(noteId, mate.token, 1);
    await until(() => here.provider.isSynced && there.provider.isSynced);

    there.provider.awareness?.setLocalStateField("cursor", { anchor: 1, head: 1 });
    here.provider.awareness?.setLocalStateField("cursor", { anchor: 2, head: 2 });

    const sees = (from: typeof here, who: string) => {
      for (const [, state] of from.provider.awareness?.getStates() ?? []) {
        if ((state as { user?: { userId?: string } }).user?.userId === who) return true;
      }
      return false;
    };

    await until(() => sees(here, mate.userId) && sees(there, author.userId));

    // And the identity that crossed the bus is still the server's, not the
    // client's: awareness is rewritten before it is ever broadcast.
    let crossed: { name?: string; color?: string } | undefined;
    for (const [, state] of here.provider.awareness?.getStates() ?? []) {
      const user = (state as { user?: { userId?: string; name?: string; color?: string } }).user;
      if (user?.userId === mate.userId) crossed = user;
    }
    assert.equal(crossed?.name, mate.nickname);
    assert.match(crossed?.color ?? "", /^hsl\(/);

    here.provider.destroy();
    there.provider.destroy();
  });
});
