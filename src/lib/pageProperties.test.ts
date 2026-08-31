import assert from "node:assert/strict";
import test from "node:test";
import { clampCoverPosition, coverFromStorage, pageIconFromStorage } from "./pageProperties.ts";

test("cover positions are normalized before reaching layout", () => {
  assert.equal(clampCoverPosition(-2), 0);
  assert.equal(clampCoverPosition(2), 1);
  assert.equal(clampCoverPosition(Number.NaN), 0.5);
});

test("page properties reject unknown persisted shapes", () => {
  assert.deepEqual(pageIconFromStorage({ kind: "symbol", value: "star" }), {
    kind: "symbol",
    value: "star",
  });
  assert.equal(pageIconFromStorage({ kind: "symbol", value: "database" }), null);
  assert.deepEqual(coverFromStorage({ kind: "preset", id: "forest", position: 9 }), {
    kind: "preset",
    id: "forest",
    position: 1,
  });
  assert.equal(coverFromStorage({ kind: "preset", id: "missing" }), null);
});
