import assert from "node:assert/strict";
import test from "node:test";
import { placementPatch } from "./placement.ts";
import type { NoteMeta } from "./types.ts";

test("a pin sends only the pin, so another member's move survives", () => {
  const before = { id: "n", folderId: "a" } as NoteMeta;
  assert.deepEqual(placementPatch(before, { ...before, pinned: true }), { pinned: true });
});

test("an unknown note sends every column; an unchanged one sends none", () => {
  const note = { id: "n", folderId: "a" } as NoteMeta;
  assert.equal(Object.keys(placementPatch(undefined, note)).length, 7);
  assert.deepEqual(placementPatch(note, { ...note }), {});
});
