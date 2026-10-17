import assert from "node:assert/strict";
import test from "node:test";
import { currentAxes, setAxes, subscribeToAxes } from "./axes.ts";
import {
  currentWritingPreferences,
  setWritingPreferences,
  subscribeToWritingPreferences,
} from "./writingPreferences.ts";

test("reading preferences update and notify a native host without a document", () => {
  assert.equal(typeof document, "undefined");
  const before = currentAxes();
  let notifications = 0;
  const stop = subscribeToAxes(() => notifications++);
  try {
    const next = { ...before, size: 20 };
    assert.doesNotThrow(() => setAxes(next));
    assert.equal(currentAxes().size, 20);
    assert.equal(notifications, 1);
  } finally {
    stop();
    setAxes(before);
  }
});

test("writing preferences survive the same account pull on a native host", () => {
  assert.equal(typeof document, "undefined");
  const before = currentWritingPreferences();
  let notifications = 0;
  const stop = subscribeToWritingPreferences(() => notifications++);
  try {
    assert.doesNotThrow(() => setWritingPreferences({ ...before, presencePalette: "sky" }));
    assert.equal(currentWritingPreferences().presencePalette, "sky");
    assert.equal(notifications, 1);
  } finally {
    stop();
    setWritingPreferences(before);
  }
});
