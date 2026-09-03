import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_APPEARANCE } from "./appearance.ts";
import { DEFAULT_AXES } from "./axes.ts";
import {
  accountPreferences,
  DEFAULT_FLAGS,
  flagsOf,
  mergeAccountPreferences,
} from "./preferenceShape.ts";
import { DEFAULT_WRITING_PREFERENCES } from "./writingPreferences.ts";

/* Assembled the way the app assembles it, through the one constructor. */
const local = accountPreferences(
  { ...DEFAULT_APPEARANCE, accent: "#aabbcc" },
  { ...DEFAULT_AXES, size: 21 },
  { ...DEFAULT_WRITING_PREFERENCES, presencePalette: "mint" as const },
  { ...DEFAULT_FLAGS, proofreader: false, autoLock: 15 as const },
);

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

test("the four flags come away without the appearance riding along", () => {
  /* The whole point: what the component holds is spread over a fresh reading
     of the live stores when the row is written. If the appearance travels
     inside it, choosing a colour pushes the colour from the previous pull. */
  const flags = flagsOf(mergeAccountPreferences({ presence: true }, local));
  assert.deepEqual(Object.keys(flags).sort(), [
    "autoLock",
    "collaborators",
    "presence",
    "proofreader",
  ]);
  assert.equal(flags.presence, true);
  assert.equal(flags.autoLock, 15);
});

test("a browser's own values survive being merged and pushed back unchanged", () => {
  /* Both sides of the write guard are compared as `JSON.stringify` output,
     which keeps insertion order — so the same values in a different order are
     a different string and every mount rewrites the row it just read. */
  const pulled = mergeAccountPreferences({}, local);
  const pushed = accountPreferences(local.appearance, local.axes, local.writing, flagsOf(pulled));
  assert.equal(JSON.stringify(pushed), JSON.stringify(pulled));
});
