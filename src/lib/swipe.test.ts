import assert from "node:assert/strict";
import test from "node:test";
import { nextSwipeOffset, SWIPE_ACTION_OFFSET } from "./swipe.ts";

test("a natural left trackpad gesture reveals the leftward row action", () => {
  assert.equal(nextSwipeOffset(0, 34), -34);
  assert.ok(nextSwipeOffset(-88, 24) <= SWIPE_ACTION_OFFSET);
});

test("the gesture settles back inside its action rail", () => {
  assert.equal(nextSwipeOffset(-54, -80), 0);
});
