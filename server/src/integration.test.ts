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
import { updateYFragment } from "y-prosemirror";
import {
  BODY_FRAGMENT as BODY,
  TITLE_TEXT as TITLE,
  noteSchema,
} from "../../src/features/editor/lib/ydoc.ts";
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

/* In CI the stack is started for this job, so a missing one is a broken job
   rather than a reason to pass quietly. Nothing here may report success
   because it was skipped. */
function refuseToSkip(reason: string | false): string | false {
  if (reason && process.env.REQUIRE_INTEGRATION === "1") {
    throw new Error(`REQUIRE_INTEGRATION is set and the suite cannot run: ${reason}`);
  }
  return reason;
}

const skip = refuseToSkip(stack ? false : "run `supabase start` first");

describe("the collaboration server", { skip }, () => {
  const local = stack as LocalStack;
  let server: Server<Context>;
  let port: number;
  let editor: Account;
  /** A second, genuinely separate editor: its own account, its own token. */
  let mate: Account;
  let viewer: Account;
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

  async function admit(account: Account, role: "editor" | "viewer") {
    const invite = await editor.client.rpc("create_archive_invite", {
      archive_id: archiveId,
      email: account.email,
      role,
    });
    assert.equal(invite.error, null, invite.error?.message);
    const claimed = await account.client.rpc("claim_archive_invite", {
      token: invite.data as string,
    });
    assert.equal(claimed.error, null, claimed.error?.message);
  }

  before(async () => {
    editor = await makeAccount(local, "editor");
    mate = await makeAccount(local, "mate");
    viewer = await makeAccount(local, "viewer");
    outsider = await makeAccount(local, "outsider");

    const bootstrap = await editor.client.rpc("ensure_personal_archive");
    assert.equal(bootstrap.error, null, bootstrap.error?.message);
    archiveId = bootstrap.data as string;

    // Two seats is the product; four is this test, which needs an owner, a
    // second editor and a viewer in one archive at once.
    const seats = await editor.client
      .from("archives")
      .update({ seat_limit: 4 })
      .eq("id", archiveId);
    assert.equal(seats.error, null, seats.error?.message);

    await admit(mate, "editor");
    await admit(viewer, "viewer");

    port = 9000 + Math.floor(Math.random() * 500);
    server = createCollaborationServer({
      supabaseUrl: local.apiUrl,
      publishableKey: local.publishableKey,
      serviceRoleKey: local.serviceRoleKey,
      allowedOrigins: [ORIGIN],
      port,
      debounce: 150,
      // Short enough that a revocation shows up inside a test, and the same
      // mechanism a deployment runs with a longer one.
      authorizationTtl: 150,
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

    assert.equal(doc.getText(TITLE).toString(), "Field notes");
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

  it("does not restamp a note whose words come back to where they were", async () => {
    const noteId = await newNote("Steady", "Now it works");
    const { doc, provider } = connect(noteId, editor.token);
    await until(() => provider.isSynced);
    await sleep(400);

    const before = await asService(local)
      .from("notes")
      .select("updated_at, version, body")
      .eq("id", noteId)
      .single();

    /* What a writer leaves behind by typing at the end of a note and deleting
       it again: a trailing space, and the empty paragraph the return made.
       Neither reads, so neither may move the note up the list. */
    const body = doc.getXmlFragment("default");
    const trailing = new Y.XmlElement("paragraph");
    doc.transact(() => body.push([trailing]));
    await sleep(400);
    doc.transact(() => body.delete(body.length - 1, 1));
    await sleep(600);
    provider.destroy();
    await sleep(400);

    const idle = await asService(local)
      .from("notes")
      .select("updated_at, version, body")
      .eq("id", noteId)
      .single();
    assert.deepEqual(idle.data, before.data, "an invisible ending restamped the note");

    /* And the other half of the distinction: words that were already there,
       taken away, are an edit. */
    const second = connect(noteId, editor.token);
    await until(() => second.provider.isSynced);
    const text = second.doc.getXmlFragment("default");
    second.doc.transact(() => text.delete(0, text.length));
    await sleep(600);
    second.provider.destroy();
    await sleep(400);

    const edited = await asService(local)
      .from("notes")
      .select("updated_at, version, body")
      .eq("id", noteId)
      .single();
    assert.notEqual(edited.data?.updated_at, before.data?.updated_at);
    assert.equal(edited.data?.body, "");
  });

  it("converges two people typing in the same note, and projects the result", async () => {
    const noteId = await newNote("Shared", "start");
    const mine = connect(noteId, editor.token);
    await until(() => mine.provider.isSynced);
    const yours = connect(noteId, editor.token);
    await until(() => yours.provider.isSynced);

    mine.doc.getText(TITLE).insert(0, "Our ");
    yours.doc.getText(TITLE).insert(mine.doc.getText(TITLE).length, " together");

    const line = (doc: Y.Doc) => doc.getXmlFragment("default").get(0) as Y.XmlElement;
    (line(mine.doc).get(0) as Y.XmlText).insert(0, "mine: ");
    (line(yours.doc).get(0) as Y.XmlText).insert(5, " yours");

    await until(
      () =>
        mine.doc.getText(TITLE).toString() === yours.doc.getText(TITLE).toString() &&
        JSON.stringify(mine.doc.getXmlFragment("default").toJSON()) ===
          JSON.stringify(yours.doc.getXmlFragment("default").toJSON()),
    );

    const title = mine.doc.getText(TITLE).toString();
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
    const { provider } = connect(noteId, viewer.token);
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
        page_icon: { kind: "photo", objectId: crypto.randomUUID() },
        cover: { kind: "preset", id: "forest", position: 0.25 },
      })
      .eq("id", noteId);
    assert.equal(patched.error, null, patched.error?.message);
  });

  it("refuses a page property the whitelist does not know", async () => {
    const noteId = await newNote("Bad cover", "unchanged");
    /* Every one of these used to be a way in. The last two are the reason the
       check functions coalesce to false: a missing key makes every comparison
       on it null, and a check constraint that evaluates to null passes. */
    const refused: Record<string, unknown>[] = [
      { page_icon: { kind: "photo", objectId: "../../etc/passwd" } },
      { page_icon: { kind: "photo" } },
      { page_icon: { kind: "symbol", value: "database" } },
      { page_icon: { kind: "wallpaper", value: "star" } },
      { page_icon: { kind: "symbol" } },
      { cover: { kind: "preset", id: "not-a-preset", position: 0.5 } },
      { cover: { kind: "preset", id: "forest", position: 4 } },
      { cover: { kind: "preset", id: "forest", position: -0.5 } },
      { cover: { kind: "preset", id: "forest" } },
      { cover: { kind: "preset", position: 0.5 } },
      { cover: { kind: "upload", objectId: "../../etc/passwd", position: 0.5 } },
      { cover: { kind: "upload", objectId: "not-a-uuid", position: 0.5 } },
    ];
    for (const patch of refused) {
      const write = await asUser(local, editor.token).from("notes").update(patch).eq("id", noteId);
      assert.notEqual(write.error, null, `Postgres stored ${JSON.stringify(patch)}`);
    }

    // And the shapes that are meant to work still do.
    const accepted = await asUser(local, editor.token)
      .from("notes")
      .update({
        page_icon: { kind: "emoji", value: "\u2600\ufe0f" },
        cover: { kind: "upload", objectId: crypto.randomUUID(), position: 0 },
      })
      .eq("id", noteId);
    assert.equal(accepted.error, null, accepted.error?.message);
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
  /* ── Access that changes while a socket is open ──────────────────────────
     A handshake is a moment and a connection is an afternoon. Everything below
     changes the archive underneath a client that is already connected and
     synced, and asks what the server does about it. */

  async function titleOf(noteId: string): Promise<string> {
    const row = await asService(local).from("notes").select("title").eq("id", noteId).single();
    return (row.data as { title: string }).title;
  }

  /** Type at the end of the title, the way a person would. */
  function append(doc: Y.Doc, text: string) {
    const title = doc.getText(TITLE);
    title.insert(title.length, text);
  }

  it("converges two people who are genuinely two accounts", async () => {
    const noteId = await newNote("Between us", "one line");
    const mine = connect(noteId, editor.token);
    await until(() => mine.provider.isSynced);
    const theirs = connect(noteId, mate.token);
    await until(() => theirs.provider.isSynced);

    append(mine.doc, " — mine");
    append(theirs.doc, " — theirs");

    await until(() => mine.doc.getText(TITLE).toString() === theirs.doc.getText(TITLE).toString());
    const title = mine.doc.getText(TITLE).toString();
    assert.ok(title.includes("mine") && title.includes("theirs"), title);

    for (let attempt = 0; attempt < 60; attempt++) {
      if ((await titleOf(noteId)) === title) break;
      await sleep(150);
    }
    assert.equal(await titleOf(noteId), title, "the note row did not follow both writers");

    mine.provider.destroy();
    theirs.provider.destroy();
  });

  it("stamps awareness with the identity the archive holds, not the one sent", async () => {
    const noteId = await newNote("Who is there", "cursors only");
    const mine = connect(noteId, editor.token);
    await until(() => mine.provider.isSynced);
    const theirs = connect(noteId, mate.token);
    await until(() => theirs.provider.isSynced);

    // A client claiming to be somebody else, in somebody else's colour.
    theirs.provider.awareness?.setLocalStateField("user", {
      userId: editor.userId,
      name: "Administrator",
      color: "#000000",
    });

    let seen: { userId?: string; name?: string; color?: string } | undefined;
    await until(() => {
      for (const [, state] of mine.provider.awareness?.getStates() ?? []) {
        const user = (state as { user?: { userId?: string } }).user;
        if (user?.userId === mate.userId) {
          seen = user;
          return true;
        }
      }
      return false;
    });

    assert.equal(seen?.userId, mate.userId, "a client was believed about who it is");
    assert.equal(seen?.name, mate.nickname, "the name came from the client, not the archive");
    assert.match(seen?.color ?? "", /^hsl\(/, "the colour was not assigned by the server");

    mine.provider.destroy();
    theirs.provider.destroy();
  });

  /* "In this note since" is a claim about somebody else, so it may not be
     computed from the reader's own clock. It used to be: the browser stamped
     the moment it first noticed the peer, so opening a note somebody had been
     writing in for an hour reported that they had just arrived. */
  it("stamps awareness with when the peer opened the note", async () => {
    const noteId = await newNote("Since when", "two clocks");
    const before = Date.now();
    const mine = connect(noteId, editor.token);
    await until(() => mine.provider.isSynced);
    const theirs = connect(noteId, mate.token);
    await until(() => theirs.provider.isSynced);

    theirs.provider.awareness?.setLocalStateField("user", { since: "1999-01-01T00:00:00.000Z" });

    let since: string | undefined;
    await until(() => {
      for (const [, state] of mine.provider.awareness?.getStates() ?? []) {
        const user = (state as { user?: { userId?: string; since?: string } }).user;
        if (user?.userId === mate.userId && user.since) {
          since = user.since;
          return true;
        }
      }
      return false;
    });

    assert.notEqual(since, "1999-01-01T00:00:00.000Z", "a client was believed about its own time");
    const stamped = Date.parse(since ?? "");
    assert.ok(Number.isFinite(stamped), `since is not a date: ${since}`);
    assert.ok(
      stamped >= before && stamped <= Date.now(),
      "the stamp is not from this connection's lifetime",
    );

    mine.provider.destroy();
    theirs.provider.destroy();
  });

  it("puts an editor demoted to viewer into read-only without a reload", async () => {
    const noteId = await newNote("Demotion", "watch this");
    const mine = connect(noteId, editor.token);
    await until(() => mine.provider.isSynced);
    const theirs = connect(noteId, mate.token);
    await until(() => theirs.provider.isSynced);

    append(theirs.doc, " [before]");
    await until(() => mine.doc.getText(TITLE).toString().includes("[before]"));

    const demoted = await editor.client.rpc("set_archive_member_role", {
      archive_id: archiveId,
      user_id: mate.userId,
      role: "viewer",
    });
    assert.equal(demoted.error, null, demoted.error?.message);
    await sleep(400); // past the authorisation window

    append(theirs.doc, " [after]");
    await sleep(1200);

    assert.ok(
      !mine.doc.getText(TITLE).toString().includes("[after]"),
      "a demoted editor was still writing to everybody else's document",
    );
    await sleep(600);
    assert.ok(!(await titleOf(noteId)).includes("[after]"), "the demoted write was persisted");

    // Put the seat back for the tests that follow.
    await editor.client.rpc("set_archive_member_role", {
      archive_id: archiveId,
      user_id: mate.userId,
      role: "editor",
    });
    mine.provider.destroy();
    theirs.provider.destroy();
  });

  it("closes the connection of a member who is removed from the archive", async () => {
    const evicted = await makeAccount(local, "evicted");
    await admit(evicted, "editor");

    const noteId = await newNote("Revocation", "still a member");
    const mine = connect(noteId, editor.token);
    await until(() => mine.provider.isSynced);
    const theirs = connect(noteId, evicted.token);
    await until(() => theirs.provider.isSynced);

    let refused = false;
    theirs.provider.on("authenticationFailed", () => {
      refused = true;
    });

    const removed = await asService(local)
      .from("archive_members")
      .delete()
      .eq("archive_id", archiveId)
      .eq("user_id", evicted.userId);
    assert.equal(removed.error, null, removed.error?.message);
    await sleep(400);

    append(theirs.doc, " [after eviction]");
    await sleep(1500);

    assert.ok(
      !mine.doc.getText(TITLE).toString().includes("after eviction"),
      "a removed member was still writing",
    );
    await until(() => refused || !theirs.provider.isAuthenticated, 10000);

    mine.provider.destroy();
    theirs.provider.destroy();
  });

  it("makes a note read-only the moment it reaches the trash", async () => {
    const noteId = await newNote("To the trash", "on its way out");
    const mine = connect(noteId, editor.token);
    await until(() => mine.provider.isSynced);
    const theirs = connect(noteId, mate.token);
    await until(() => theirs.provider.isSynced);

    const trashed = await editor.client
      .from("notes")
      .update({ trashed_at: new Date().toISOString() })
      .eq("id", noteId);
    assert.equal(trashed.error, null, trashed.error?.message);
    await sleep(400);

    append(theirs.doc, " [in the trash]");
    await sleep(1500);

    assert.ok(
      !mine.doc.getText(TITLE).toString().includes("in the trash"),
      "a trashed note was still being written to",
    );
    assert.ok(!(await titleOf(noteId)).includes("in the trash"));

    mine.provider.destroy();
    theirs.provider.destroy();
  });

  /* `notes.locked_by` is the note-sized half of this, and Postgres holds it:
     the row is refused to everybody the column does not name, which the
     collaboration server reads through the caller's own token like every other
     answer. */
  it("hands a locked note back to nobody but the member holding it", async () => {
    const noteId = await newNote("Taken back", "one of us at a time");
    const mine = connect(noteId, editor.token);
    await until(() => mine.provider.isSynced);
    const theirs = connect(noteId, mate.token);
    await until(() => theirs.provider.isSynced);

    const locked = await editor.client
      .from("notes")
      .update({ locked_by: editor.userId })
      .eq("id", noteId)
      .select("locked_by");
    assert.equal(locked.error, null, locked.error?.message);
    assert.equal((locked.data ?? []).length, 1, "the lock did not land");
    await sleep(400);

    append(theirs.doc, " [not theirs to write]");
    await sleep(1500);
    assert.ok(!(await titleOf(noteId)).includes("not theirs to write"));

    // Nor may they write the row, lift the lock, or take it for themselves.
    for (const patch of [
      { title: "Renamed by the other member" },
      { locked_by: null },
      { locked_by: mate.userId },
      { trashed_at: new Date().toISOString() },
    ]) {
      const write = await mate.client.from("notes").update(patch).eq("id", noteId).select("id");
      assert.equal(
        (write.data ?? []).length,
        0,
        `the other member wrote ${JSON.stringify(patch)} to a locked note`,
      );
    }

    // The holder still writes it, and can give it back.
    append(mine.doc, " [still mine]");
    await sleep(1500);
    assert.ok((await titleOf(noteId)).includes("still mine"));

    const lifted = await editor.client
      .from("notes")
      .update({ locked_by: null })
      .eq("id", noteId)
      .select("id");
    assert.equal((lifted.data ?? []).length, 1, "the holder could not lift their own lock");

    mine.provider.destroy();
    theirs.provider.destroy();
  });

  /* And the passage-sized half, which no policy can hold: the mark lives
     inside a document both members are entitled to write. The server puts it
     back — so the words the other member typed never reach the holder's tab
     and never reach Postgres. */
  it("puts back a passage the other member had no business writing", async () => {
    const noteId = await newNote("Held passage", "placeholder");
    const mine = connect(noteId, editor.token);
    await until(() => mine.provider.isSynced);

    const passage = (text: string, owner?: string) => ({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text,
              ...(owner ? { marks: [{ type: "writeLock", attrs: { owner } }] } : {}),
            },
          ],
        },
      ],
    });
    const write = (doc: Y.Doc, content: ReturnType<typeof passage>) =>
      doc.transact(() => {
        updateYFragment(doc, doc.getXmlFragment(BODY), noteSchema().nodeFromJSON(content), {
          mapping: new Map(),
          isOMark: new Map(),
        });
      });

    write(mine.doc, passage("Mine to write.", editor.userId));
    await sleep(1500);

    const theirs = connect(noteId, mate.token);
    await until(() => theirs.provider.isSynced);
    assert.match(JSON.stringify(theirs.doc.getXmlFragment(BODY).toJSON()), /Mine to write/);

    write(theirs.doc, passage("Theirs to write.", editor.userId));
    await sleep(2000);

    const body = () => JSON.stringify(mine.doc.getXmlFragment(BODY).toJSON());
    assert.ok(!body().includes("Theirs to write"), `the lock did not hold: ${body()}`);
    assert.match(body(), /Mine to write/);

    const stored = await asService(local).from("notes").select("body").eq("id", noteId).single();
    assert.ok(
      !((stored.data as { body: string }).body ?? "").includes("Theirs to write"),
      "a passage nobody was allowed to write reached Postgres",
    );

    mine.provider.destroy();
    theirs.provider.destroy();
  });

  it("withdraws a note its owner archives out of sight", async () => {
    const noteId = await newNote("Kept back", "mine alone");
    const theirs = connect(noteId, mate.token);
    await until(() => theirs.provider.isSynced);

    let refused = false;
    theirs.provider.on("authenticationFailed", () => {
      refused = true;
    });

    const hidden = await editor.client
      .from("profiles")
      .update({ hide_archived: true })
      .eq("user_id", editor.userId)
      .select("user_id");
    assert.equal((hidden.data ?? []).length, 1, "the owner has no profile to hide behind");
    assert.equal(hidden.error, null, hidden.error?.message);
    const archived = await editor.client
      .from("notes")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", noteId);
    assert.equal(archived.error, null, archived.error?.message);
    await sleep(400);

    append(theirs.doc, " [should not land]");
    await sleep(1500);

    assert.ok(!(await titleOf(noteId)).includes("should not land"));
    await until(() => refused || !theirs.provider.isAuthenticated, 10000);

    theirs.provider.destroy();
    await editor.client
      .from("profiles")
      .update({ hide_archived: false })
      .eq("user_id", editor.userId);
  });

  it("neither transmits nor persists what a viewer types", async () => {
    const noteId = await newNote("Viewer", "reads only");
    const mine = connect(noteId, editor.token);
    await until(() => mine.provider.isSynced);
    const theirs = connect(noteId, viewer.token);
    await until(() => theirs.provider.isSynced);
    assert.equal(theirs.provider.authorizedScope, "readonly");

    append(theirs.doc, " [from a viewer]");
    await sleep(1500);

    assert.ok(
      !mine.doc.getText(TITLE).toString().includes("from a viewer"),
      "a viewer's typing reached another client",
    );
    assert.ok(!(await titleOf(noteId)).includes("from a viewer"), "a viewer's typing was saved");

    mine.provider.destroy();
    theirs.provider.destroy();
  });
});
