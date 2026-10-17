import assert from "node:assert/strict";
import { test } from "node:test";
import { honourLocks, restoreNote, shelveNote, trashNote } from "./noteActs.ts";
import type { Meta } from "./types.ts";

const meta: Meta = {
  v: 1,
  folders: [],
  notes: [
    { id: "a", folderId: "f" },
    { id: "held", folderId: null, lockedBy: "other" },
  ],
};

test("an act stamps the row it has and makes the row it lacks", () => {
  const trashed = trashNote(meta, "a", "T");
  assert.deepEqual(trashed.notes[0], { id: "a", folderId: "f", trashedAt: "T" });
  assert.deepEqual(trashNote(meta, "new", "T").notes.at(-1), {
    id: "new",
    folderId: null,
    trashedAt: "T",
  });
  assert.equal(restoreNote(trashed, "a").notes[0].trashedAt, undefined);
  assert.equal(shelveNote(meta, "a", true, "S").notes[0].archivedAt, "S");
  assert.equal(shelveNote(meta, "a", false).notes[0].archivedAt, undefined);
});

test("somebody else's lock keeps its row, one's own does not", () => {
  const moved = trashNote(meta, "held", "T");
  assert.equal(honourLocks(meta, moved, "me").notes[1].trashedAt, undefined);
  assert.equal(honourLocks(meta, moved, "other").notes[1].trashedAt, "T");
  const dropped = { ...meta, notes: [meta.notes[0]] };
  assert.equal(honourLocks(meta, dropped, "me").notes.length, 2);
});
