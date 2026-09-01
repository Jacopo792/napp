import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_WRITING_PREFERENCES, PRESENCE_PALETTES } from "./writingPreferences.ts";

test("writing preferences provide an amber default presence palette", () => {
  assert.equal(DEFAULT_WRITING_PREFERENCES.presencePalette, "amber");
  assert.ok(PRESENCE_PALETTES.some((palette) => palette.id === "amber"));
});
