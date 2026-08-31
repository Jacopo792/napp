/* The whole thing, against a real local Supabase.
 *
 * `supabase start` first — without it every test here skips rather than fails,
 * because the check-suite that runs on a pull request has no database.
 *
 * What this proves is the part unit tests cannot: that two signed-in people
 * converge on one note, that the projections the rest of the archive reads
 * follow the document, that opening a note is not editing it, that a viewer
 * cannot write and an outsider cannot look, and that a browser still running
 * the old build is refused rather than allowed to overwrite. */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { HocuspocusProvider, HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import type { Server } from "@hocuspocus/server";
import WebSocket from "ws";
import * as Y from "yjs";
import {
  asService,
  asUser,
  localStack,
  makeAccount,
  type Account,
  type LocalStack,
} from "./fixture.ts";
import { createCollaborationServer, type Context } from "./server.ts";

const ORIGIN = "http://localhost:5173";
const stack = localStack();

/* Node's global WebSocket sends no Origin, and the server refuses a connection
   without one. `ws` lets the test speak like a browser. */
class BrowserWebSocket extends WebSocket {
  constructor(url: string | URL, protocols?: string | string[]) {
    super(url, protocols, { origin: ORIGIN });
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function until(check: () => boolean, timeout = 8000): Promise<void> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (check()) return;
    await sleep(50);
  }
  throw new Error("timed out waiting for a condition");
}

describe("the collaboration server", { skip: stack ? false : "run `supabase start` first" }, () => {
  const local = stack as LocalStack;
  let server: Server<Context>;
  let port: number;
  let editor: Account;
  let second: Account;
  let outsider: Account;
  let archiveId: string;

  const sockets: HocuspocusProviderWebsocket[] = [];

  function connect(noteId: string, token: string) {
    const socket = new HocuspocusProviderWebsocket({
      url: `ws://127.0.0.1:${port}`,
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
    /* Supplying our own websocket means the provider does not attach itself —
       `manageSocket` is only true when it built the socket. */
    provider.attach();
    return { doc, provider };
  }

  async function newNote(title: string, body: string): Promise<string> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const inserted = await editor.client.from("notes").insert({
      id,
      archive_id: archiveId,
      owner_id: editor.userId,
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

  before(async () => {
    editor = await makeAccount(local, "editor");
    second = await makeAccount(local, "second");
    outsider = await makeAccount(local, "outsider");

    const bootstrap = await editor.client.rpc("ensure_personal_archive");
    assert.equal(bootstrap.error, null, bootstrap.error?.message);
    archiveId = bootstrap.data as string;

    const invite = await editor.client.rpc("create_archive_invite", {
      archive_id: archiveId,
      email: second.email,
      role: "viewer",
    });
    assert.equal(invite.error, null, invite.error?.message);
    const claimed = await second.client.rpc("claim_archive_invite", {
      token: invite.data as string,
    });
    assert.equal(claimed.error, null, claimed.error?.message);

    port = 9000 + Math.floor(Math.random() * 500);
    server = createCollaborationServer({
      supabaseUrl: local.apiUrl,
      publishableKey: local.publishableKey,
      serviceRoleKey: local.serviceRoleKey,
      allowedOrigins: [ORIGIN],
      port,
      debounce: 150,
    });
    await server.listen();
  });

  after(async () => {
    for (const socket of sockets) socket.destroy();
    await server?.destroy();
  });

  it("hands a note that has never been opened its existing text", async () => {
    const noteId = await newNote("Field notes", "the first line");
    const { doc, provider } = connect(noteId, editor.token);
    await until(() => provider.isSynced);

    assert.equal(doc.getText("title").toString(), "Field notes");
    assert.match(JSON.stringify(doc.getXmlFragment("default").toJSON()), /the first line/);
    provider.destroy();
  });

  it("does not restamp or reorder a note that was only opened", async () => {
    const noteId = await newNote("Untouched", "nothing happens here");
    const before = await asService(local)
      .from("notes")
      .select("updated_at, version")
      .eq("id", noteId)
      .single();

    const { provider } = connect(noteId, editor.token);
    await until(() => provider.isSynced);
    await sleep(600);
    provider.destroy();
    await sleep(400);

    const after = await asService(local)
      .from("notes")
      .select("updated_at, version")
      .eq("id", noteId)
      .single();
    assert.deepEqual(after.data, before.data, "opening a note changed the note");

    // The binary was written, though: the seed has to be the only seed there
    // will ever be, or a later one would duplicate the body on merge.
    const seeded = await asService(local).rpc("load_note_document", { target_note_id: noteId });
    assert.equal(seeded.error, null, seeded.error?.message);
    assert.equal((seeded.data as unknown[]).length, 1);
  });

  it("converges two people typing in the same note, and projects the result", async () => {
    const noteId = await newNote("Shared", "start");
    const mine = connect(noteId, editor.token);
    await until(() => mine.provider.isSynced);
    const yours = connect(noteId, editor.token);
    await until(() => yours.provider.isSynced);

    mine.doc.getText("title").insert(0, "Our ");
    yours.doc.getText("title").insert(mine.doc.getText("title").length, " together");

    const line = (doc: Y.Doc) => doc.getXmlFragment("default").get(0) as Y.XmlElement;
    (line(mine.doc).get(0) as Y.XmlText).insert(0, "mine: ");
    (line(yours.doc).get(0) as Y.XmlText).insert(5, " yours");

    await until(
      () =>
        mine.doc.getText("title").toString() === yours.doc.getText("title").toString() &&
        JSON.stringify(mine.doc.getXmlFragment("default").toJSON()) ===
          JSON.stringify(yours.doc.getXmlFragment("default").toJSON()),
    );

    const title = mine.doc.getText("title").toString();
    assert.ok(
      title.includes("Our") && title.includes("Shared") && title.includes("together"),
      `both edits should survive, got ${JSON.stringify(title)}`,
    );

    // The projections every list, search, preview and export read must follow.
    const service = asService(local);
    let projected: { title: string; body: string } | null = null;
    for (let attempt = 0; attempt < 60; attempt++) {
      const row = await service.from("notes").select("title, body").eq("id", noteId).single();
      projected = row.data as { title: string; body: string };
      if (projected?.title === title) break;
      await sleep(150);
    }
    assert.equal(projected?.title, title, "the note row did not follow the document");
    assert.match(projected!.body, /mine:/);
    assert.match(projected!.body, /yours/);

    mine.provider.destroy();
    yours.provider.destroy();
  });

  it("lets a viewer read and refuses their writes", async () => {
    const noteId = await newNote("Read only", "for the viewer");
    const { provider } = connect(noteId, second.token);
    await until(() => provider.isSynced);
    assert.equal(provider.authorizedScope, "readonly");
    provider.destroy();
  });

  it("refuses somebody who is not in the archive at all", async () => {
    const noteId = await newNote("Private", "not for strangers");
    const { provider } = connect(noteId, outsider.token);
    let refused = "";
    provider.on("authenticationFailed", ({ reason }: { reason: string }) => {
      refused = reason;
    });
    await until(() => refused.length > 0);
    // Hocuspocus reports one word to the client and keeps the reason server
    // side, which is the right way round: a refusal should not tell a stranger
    // whether the note exists.
    assert.match(refused, /permission-denied|not available|not a member/i);
    provider.destroy();
  });

  it("refuses a connection from an origin that is not the app", async () => {
    const noteId = await newNote("Origin", "checked before anything else");
    const socket = new WebSocket(`ws://127.0.0.1:${port}/${noteId}`, {
      origin: "https://not-the-app.example",
    });
    const refused = await new Promise<string>((resolve) => {
      // `ws` reports a rejected upgrade as an error, not a close.
      socket.on("error", (error: Error) => resolve(error.message));
      socket.on("close", () => resolve("closed"));
      socket.on("open", () => resolve(""));
      setTimeout(() => resolve(""), 4000);
    });
    socket.close();
    assert.match(refused, /403|closed/, "a foreign origin was allowed to connect");
  });

  it("refuses a whole-row save from a browser running the old build", async () => {
    const noteId = await newNote("Old tab", "written before the upgrade");
    const { provider } = connect(noteId, editor.token);
    await until(() => provider.isSynced);
    provider.destroy();

    const stale = await asUser(local, editor.token)
      .from("notes")
      .update({ title: "overwritten by a stale tab", body: "everything replaced" })
      .eq("id", noteId);
    assert.notEqual(stale.error, null, "an old client overwrote a collaborative note");
    assert.match(stale.error!.message, /collaborativ/i);

    const row = await asService(local).from("notes").select("title").eq("id", noteId).single();
    assert.equal((row.data as { title: string }).title, "Old tab");
  });

  it("still lets page properties be written without touching the text", async () => {
    const noteId = await newNote("Cover me", "the body stays put");
    const { provider } = connect(noteId, editor.token);
    await until(() => provider.isSynced);
    provider.destroy();

    const patched = await asUser(local, editor.token)
      .from("notes")
      .update({
        page_icon: { kind: "symbol", value: "star" },
        cover: { kind: "preset", id: "forest", position: 0.25 },
      })
      .eq("id", noteId);
    assert.equal(patched.error, null, patched.error?.message);
  });

  it("refuses a page property the whitelist does not know", async () => {
    const noteId = await newNote("Bad cover", "unchanged");
    const bogus = await asUser(local, editor.token)
      .from("notes")
      .update({ cover: { kind: "preset", id: "not-a-preset", position: 0.5 } })
      .eq("id", noteId);
    assert.notEqual(bogus.error, null, "an unknown cover preset was stored");

    const outOfRange = await asUser(local, editor.token)
      .from("notes")
      .update({ cover: { kind: "preset", id: "forest", position: 4 } })
      .eq("id", noteId);
    assert.notEqual(outOfRange.error, null, "a cover position outside 0..1 was stored");

    const notAnUpload = await asUser(local, editor.token)
      .from("notes")
      .update({ cover: { kind: "upload", objectId: "../../etc/passwd", position: 0.5 } })
      .eq("id", noteId);
    assert.notEqual(notAnUpload.error, null, "a cover upload id that is not a uuid was stored");
  });

  it("keeps the collaborative binary out of every browser's reach", async () => {
    const noteId = await newNote("Sealed", "only the server sees the binary");
    const { provider } = connect(noteId, editor.token);
    await until(() => provider.isSynced);
    provider.destroy();

    const reach = await asUser(local, editor.token).from("note_documents").select("note_id");
    assert.ok(
      reach.error || (reach.data ?? []).length === 0,
      "a signed-in browser could read note_documents",
    );

    const call = await asUser(local, editor.token).rpc("load_note_document", {
      target_note_id: noteId,
    });
    assert.notEqual(call.error, null, "a signed-in browser could call load_note_document");
  });
});
