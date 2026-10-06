import test from "node:test";
import assert from "node:assert/strict";
import { sentenceAround } from "./writingFocus.ts";

const text = "L'Uno produce. Non si svuota! «Così» dice Plotino. Fine";

test("the sentence the caret is in", () => {
  const at = (offset: number) => text.slice(...sentenceAround(text, offset));
  assert.equal(at(3), "L'Uno produce.");
  assert.equal(at(13), "L'Uno produce.");
  assert.equal(at(16), "Non si svuota!");
  assert.equal(at(33), "«Così» dice Plotino.");
  assert.equal(at(text.length), "Fine");
});

test("a paragraph with no full stop is one sentence", () => {
  assert.deepEqual(sentenceAround("senza punto", 4), [0, 11]);
});
