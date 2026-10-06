import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_WRITING_PREFERENCES,
  PRESENCE_PALETTES,
  writingPreferencesFrom,
} from "./writingPreferences.ts";

test("writing preferences provide an amber default presence palette", () => {
  assert.equal(DEFAULT_WRITING_PREFERENCES.presencePalette, "amber");
  assert.ok(PRESENCE_PALETTES.some((palette) => palette.id === "amber"));
});

test("a document's preferences are read field by field, keeping the fallback", () => {
  const fallback = { ...DEFAULT_WRITING_PREFERENCES, typewriter: true, sheetTone: "dark" as const };
  const read = writingPreferencesFrom(
    { focusScope: "sentence", sheetTone: "sepia" as never, typewriter: "yes" as never },
    fallback,
  );
  assert.equal(read.focusScope, "sentence");
  assert.equal(read.sheetTone, "dark");
  assert.equal(read.typewriter, true);
  assert.equal(read.adaptInk, true);
});
