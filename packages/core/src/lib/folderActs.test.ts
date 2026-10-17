import assert from "node:assert/strict";
import test from "node:test";
import { removeFolder, renameFolder } from "./folderActs.ts";
import type { Meta } from "./types.ts";

test("removing a branch keeps every note and its unrelated metadata", () => {
  const before: Meta = {
    v: 1,
    folders: [
      { id: "leaf", name: "Leaf", parentId: "branch" },
      { id: "other", name: "Other" },
      { id: "branch", name: "Branch", parentId: "root" },
      { id: "root", name: "Root" },
    ],
    notes: [
      { id: "a", folderId: "leaf", pinned: true, position: 2 },
      { id: "b", folderId: "other" },
      { id: "c", folderId: null },
    ],
  };
  const after = removeFolder(before, "root");
  assert.deepEqual(
    after.folders.map((f) => f.id),
    ["other"],
  );
  assert.equal(after.notes.length, 3);
  assert.deepEqual(after.notes[0], { id: "a", folderId: null, pinned: true, position: 2 });
  assert.equal(after.notes[1], before.notes[1]);
  assert.equal(before.notes[0].folderId, "leaf");
});
test("renaming trims the name and ignores an empty name", () => {
  const before: Meta = { v: 1, folders: [{ id: "a", name: "Old" }], notes: [] };
  assert.equal(renameFolder(before, "a", "  New  ").folders[0].name, "New");
  assert.equal(renameFolder(before, "a", " "), before);
});
