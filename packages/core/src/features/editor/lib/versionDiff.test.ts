import assert from "node:assert/strict";
import test from "node:test";
import { textChanges, wordTally } from "./versionDiff.ts";

test("counts the words added and the words taken away", () => {
  const changes = textChanges("La tesi parla di Paolo", "La tesi parla di Paolo e di Lenin");
  assert.deepEqual(wordTally(changes), { added: 3, removed: 0 });
  assert.deepEqual(wordTally(textChanges("uno due tre", "uno tre")), { added: 0, removed: 1 });
});

test("an unchanged text is no change at all", () => {
  assert.deepEqual(wordTally(textChanges("stesso testo", "stesso testo")), {
    added: 0,
    removed: 0,
  });
});
