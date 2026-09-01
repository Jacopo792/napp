import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_WRITING_PREFERENCES, PRESENCE_PALETTES } from "./writingPreferences.ts";

test("writing preferences provide a reversible default swipe action", () => {
  assert.equal(DEFAULT_WRITING_PREFERENCES.swipeLeftAction, "archive");
  assert.ok(PRESENCE_PALETTES.some((palette) => palette.id === "amber"));
});
