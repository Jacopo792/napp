import { test } from "node:test";
import assert from "node:assert/strict";
import { moveFolder } from "./folderOrder.ts";

const f = (id: string, parentId: string | null = null) => ({ id, name: id, parentId });
const ids = (list: { id: string }[] | null) => list?.map((folder) => folder.id);

test("a folder dragged down lands after the one it is dropped on", () => {
  assert.deepEqual(ids(moveFolder([f("a"), f("b"), f("c")], "a", "c")), ["b", "c", "a"]);
});

test("a folder dragged up lands before the one it is dropped on", () => {
  assert.deepEqual(ids(moveFolder([f("a"), f("b"), f("c")], "c", "a")), ["c", "a", "b"]);
  assert.deepEqual(ids(moveFolder([f("a"), f("b"), f("c")], "c", "b")), ["a", "c", "b"]);
});

test("dropped beside a subfolder, it becomes that subfolder's sibling", () => {
  const moved = moveFolder([f("a"), f("x", "a"), f("b")], "b", "x");
  assert.equal(moved?.find((folder) => folder.id === "b")?.parentId, "a");
});

test("a folder cannot go into its own branch, nor onto itself", () => {
  assert.equal(moveFolder([f("a"), f("x", "a")], "a", "x"), null);
  assert.equal(moveFolder([f("a")], "a", "a"), null);
});
