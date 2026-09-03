import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_APPEARANCE } from "./appearance.ts";
import { DEFAULT_AXES } from "./axes.ts";
import {
  accountPreferences,
  DEFAULT_FLAGS,
  flagsOf,
  mergeAccountPreferences,
  mergeRemarksSeen,
} from "./preferenceShape.ts";
import { DEFAULT_WRITING_PREFERENCES } from "./writingPreferences.ts";

/* Assembled the way the app assembles it, through the one constructor. */
const local = accountPreferences(
  { ...DEFAULT_APPEARANCE, accent: "#aabbcc" },
  { ...DEFAULT_AXES, size: 21 },
  { ...DEFAULT_WRITING_PREFERENCES, presencePalette: "mint" as const },
  { ...DEFAULT_FLAGS, proofreader: false, autoLock: 15 as const },
  { n1: "2026-09-01T10:00:00.000Z" },
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
  const pushed = accountPreferences(
    local.appearance,
    local.axes,
    local.writing,
    flagsOf(pulled),
    pulled.remarksSeen,
  );
  assert.equal(JSON.stringify(pushed), JSON.stringify(pulled));
});

/* ── The read line, which is the one field that is not last-write-wins ──────
   A watermark: the answer to "which of these two devices is right" is neither,
   it is the further one. This is what an installed desktop app got wrong — it
   had read nothing, so it showed a badge for every conversation the browser had
   already been through, and there was no way to clear it but opening every note
   again. */
test("two devices' readings are merged note by note, taking the later", () => {
  const merged = mergeRemarksSeen(
    { read: "2026-09-01T00:00:00.000Z", mineOnly: "2026-09-02T00:00:00.000Z" },
    { read: "2026-09-03T00:00:00.000Z", theirsOnly: "2026-09-04T00:00:00.000Z" },
  );
  assert.deepEqual(merged, {
    mineOnly: "2026-09-02T00:00:00.000Z",
    read: "2026-09-03T00:00:00.000Z",
    theirsOnly: "2026-09-04T00:00:00.000Z",
  });
});

test("a device that has read nothing does not un-read the account's line", () => {
  const line = { n1: "2026-09-01T00:00:00.000Z" };
  assert.deepEqual(mergeRemarksSeen({}, line), line);
  assert.deepEqual(mergeRemarksSeen(line, {}), line);
});

test("the merged line has the same key order whichever side it came from", () => {
  const a = { b: "2026-09-01T00:00:00.000Z", a: "2026-09-01T00:00:00.000Z" };
  const b = { a: "2026-09-01T00:00:00.000Z", b: "2026-09-01T00:00:00.000Z" };
  assert.equal(JSON.stringify(mergeRemarksSeen(a, b)), JSON.stringify(mergeRemarksSeen(b, a)));
});

/* The row over what this browser holds, for the line as for everything else —
   except that here "over" means the later of the two rather than the row's. */
test("the account's line and this device's are both kept after a pull", () => {
  const pulled = mergeAccountPreferences(
    { remarksSeen: { n2: "2026-09-05T00:00:00.000Z" } },
    local,
  );
  assert.deepEqual(pulled.remarksSeen, {
    n1: "2026-09-01T10:00:00.000Z",
    n2: "2026-09-05T00:00:00.000Z",
  });
});

test("a row with no line at all leaves this device's alone", () => {
  assert.deepEqual(mergeAccountPreferences({}, local).remarksSeen, local.remarksSeen);
  assert.deepEqual(
    mergeAccountPreferences({ remarksSeen: "nonsense" }, local).remarksSeen,
    local.remarksSeen,
  );
});
