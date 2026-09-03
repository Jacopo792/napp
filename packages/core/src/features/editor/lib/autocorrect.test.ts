import assert from "node:assert/strict";
import test from "node:test";
import { correctionFor } from "./autocorrect.ts";

test("adds an apostrophe to an unambiguous English contraction", () => {
  assert.equal(correctionFor("doesnt", 0), "doesn't");
  assert.equal(correctionFor("DOESNT", 0), "DOESN'T");
  assert.equal(correctionFor("Doesnt", 0), "Doesn't");
});

test("leaves a spelling alone after it was corrected twice", () => {
  assert.equal(correctionFor("doesnt", 1), "doesn't");
  assert.equal(correctionFor("doesnt", 2), null);
});

test("does not guess at ambiguous words", () => {
  assert.equal(correctionFor("its", 0), null);
});
