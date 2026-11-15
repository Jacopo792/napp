import assert from "node:assert/strict";
import test from "node:test";
import { ALL, ARCHIVE, TRASH } from "./scopes.ts";
import type { Meta, NoteMeta } from "./types.ts";
import { MetaQueue, keepLockedNotes, noteMoves } from "./metaQueue.ts";

const meta = (...notes: NoteMeta[]): Meta => ({ v: 1, folders: [], notes });
const a = meta({ id: "n", folderId: null });
const b = meta({ id: "n", folderId: "f1" });
const c = meta({ id: "n", folderId: "f2" });

test("staging again keeps the first before and the latest after", () => {
  const queue = new MetaQueue();
  queue.stage("me", a, b);
  queue.stage("me", b, c);
  assert.deepEqual(queue.get("me"), { before: a, after: c });
  assert.equal(queue.size, 1);
});

test("a flushed entry is written once and leaves the queue", async () => {
  const queue = new MetaQueue();
  queue.stage("me", a, b);
  const written: [Meta, Meta][] = [];
  await queue.flush("me", async (before, after) => void written.push([before, after]));
  assert.deepEqual(written, [[a, b]]);
  assert.equal(queue.has("me"), false);
  await queue.flush("me", async () => assert.fail("nothing left to write"));
});

test("a failed write goes back with its before and anything staged meanwhile", async () => {
  const queue = new MetaQueue();
  queue.stage("me", a, b);
  await assert.rejects(
    queue.flush("me", async () => {
      queue.stage("me", b, c);
      throw new Error("offline");
    }),
    /offline/,
  );
  assert.deepEqual(queue.get("me"), { before: a, after: c });
});

test("a failed write with nothing staged meanwhile is kept as it was", async () => {
  const queue = new MetaQueue();
  queue.stage("me", a, b);
  await assert.rejects(queue.flush("me", () => Promise.reject(new Error("no"))));
  assert.deepEqual(queue.get("me"), { before: a, after: b });
});

test("a change staged while another owner is being written is the one written", async () => {
  /* The old drain took a snapshot of every owner before writing any, so a
     change to the second staged during the first's write was dropped. */
  const queue = new MetaQueue();
  queue.stage("first", a, b);
  queue.stage("second", a, b);
  const written: Record<string, Meta> = {};
  for (const owner of queue.owners())
    await queue.flush(owner, async (_before, after) => {
      written[owner] = after;
      if (owner === "first") queue.stage("second", b, c);
    });
  assert.equal(written.second, c);
  assert.equal(queue.size, 0);
});

test("another member's lock keeps the note as it was", () => {
  const base = meta(
    { id: "theirs", folderId: null, lockedBy: "them" },
    { id: "mine", folderId: null, lockedBy: "me" },
    { id: "free", folderId: null },
  );
  const proposed = meta(
    { id: "mine", folderId: "f1", lockedBy: "me" },
    { id: "free", folderId: "f1" },
  );
  assert.deepEqual(keepLockedNotes(base, proposed, "me").notes, [
    { id: "mine", folderId: "f1", lockedBy: "me" },
    { id: "free", folderId: "f1" },
    { id: "theirs", folderId: null, lockedBy: "them" },
  ]);
  const unlocked = meta({ id: "free", folderId: "f1" });
  assert.equal(keepLockedNotes(meta({ id: "free", folderId: null }), unlocked, "me"), unlocked);
});

test("moves say where each row is thrown and whether it leaves the list", () => {
  const base = meta(
    { id: "t", folderId: null },
    { id: "r", folderId: "f1", trashedAt: "x" },
    { id: "ra", folderId: "f1", trashedAt: "x", archivedAt: "x" },
    { id: "s", folderId: null },
    { id: "u", folderId: "f1", archivedAt: "x" },
    { id: "m", folderId: null },
    { id: "same", folderId: null },
  );
  const next = meta(
    { id: "t", folderId: null, trashedAt: "x" },
    { id: "r", folderId: "f1" },
    { id: "ra", folderId: "f1", archivedAt: "x" },
    { id: "s", folderId: null, archivedAt: "x" },
    { id: "u", folderId: "f1" },
    { id: "m", folderId: "f2" },
    { id: "same", folderId: null },
    { id: "new", folderId: "f2" },
  );
  assert.deepEqual(noteMoves(base, next, false), [
    { id: "t", to: TRASH, leaves: true },
    { id: "r", to: "f1", leaves: true },
    { id: "ra", to: ARCHIVE, leaves: true },
    { id: "s", to: ARCHIVE, leaves: true },
    { id: "u", to: "f1", leaves: true },
    { id: "m", to: "f2", leaves: true },
  ]);
  assert.deepEqual(
    noteMoves(meta({ id: "m", folderId: "f1" }), meta({ id: "m", folderId: null }), true),
    [{ id: "m", to: ALL, leaves: false }],
  );
});
