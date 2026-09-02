import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_APPEARANCE } from "./appearance.ts";
import { DEFAULT_AXES } from "./axes.ts";
import { DEFAULT_FLAGS, mergeAccountPreferences } from "./preferenceShape.ts";
import { DEFAULT_WRITING_PREFERENCES } from "./writingPreferences.ts";

const local = {
  ...DEFAULT_FLAGS,
  appearance: { ...DEFAULT_APPEARANCE, accent: "#aabbcc" },
  axes: { ...DEFAULT_AXES, size: 21 },
  writing: { ...DEFAULT_WRITING_PREFERENCES, presencePalette: "mint" as const },
  proofreader: false,
  autoLock: 15 as const,
};

test("an empty row leaves this browser exactly as it was", () => {
  const merged = mergeAccountPreferences({}, local);
  assert.equal(merged.appearance.accent, "#aabbcc");
  assert.equal(merged.axes.size, 21);
  assert.equal(merged.writing.presencePalette, "mint");
  assert.equal(merged.proofreader, false);
  assert.equal(merged.autoLock, 15);
});

test("the row wins over the browser, field by field", () => {
  const merged = mergeAccountPreferences(
    {
      appearance: { accent: "#112233" },
      writing: { presencePalette: "sky" },
      presence: true,
      collaborators: false,
      autoLock: 5,
    },
    local,
  );
  assert.equal(merged.appearance.accent, "#112233");
  /* Untouched by the row, so still the browser's — not the default. */
  assert.equal(merged.axes.size, 21);
  assert.equal(merged.writing.presencePalette, "sky");
  assert.equal(merged.presence, true);
  assert.equal(merged.collaborators, false);
  assert.equal(merged.autoLock, 5);
});

test("nonsense in the column is refused, not adopted", () => {
  const merged = mergeAccountPreferences(
    { writing: { presencePalette: "chartreuse" }, autoLock: 7, presence: "yes" },
    local,
  );
  assert.equal(merged.writing.presencePalette, "mint");
  assert.equal(merged.autoLock, 15);
  assert.equal(merged.presence, DEFAULT_FLAGS.presence);
});

test("a null column is the same as an empty one", () => {
  assert.deepEqual(mergeAccountPreferences(null, local), mergeAccountPreferences({}, local));
});
