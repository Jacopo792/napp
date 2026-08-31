import assert from "node:assert/strict";
import test from "node:test";
import { clampCoverPosition, coverFromStorage, notePhotoFromStorage } from "./pageProperties.ts";

test("cover positions are normalized before reaching layout", () => {
  assert.equal(clampCoverPosition(-2), 0);
  assert.equal(clampCoverPosition(2), 1);
  assert.equal(clampCoverPosition(Number.NaN), 0.5);
});

test("page properties reject unknown persisted shapes", () => {
  const objectId = "b0a8f0de-2b2e-4a3c-9a1f-6d5e4c3b2a10";
  assert.deepEqual(notePhotoFromStorage({ kind: "photo", objectId }), { kind: "photo", objectId });
  /* A path is the reason this is a uuid test and not a string test: the id is
     appended to a Storage prefix. */
  assert.equal(notePhotoFromStorage({ kind: "photo", objectId: "../../secrets" }), null);
  assert.equal(notePhotoFromStorage({ kind: "symbol", value: "star" }), null);
  assert.deepEqual(coverFromStorage({ kind: "preset", id: "forest", position: 9 }), {
    kind: "preset",
    id: "forest",
    position: 1,
  });
  assert.equal(coverFromStorage({ kind: "preset", id: "missing" }), null);
});
