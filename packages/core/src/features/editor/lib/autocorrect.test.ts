import assert from "node:assert/strict";
import test from "node:test";
import { correctionFor } from "./autocorrect.ts";

test("puts the accent back on an Italian word that has none without it", () => {
  assert.equal(correctionFor("perche"), "perché");
  assert.equal(correctionFor("piu"), "più");
  assert.equal(correctionFor("citta"), "città");
  assert.equal(correctionFor("martedi"), "martedì");
});

/* The most common written error in Italian, and it is unambiguous: there is no
   word `perchè`, so the grave is a slip of the same kind as no accent at all. */
test("corrects a grave accent that should have been acute", () => {
  assert.equal(correctionFor("perchè"), "perché");
  assert.equal(correctionFor("finchè"), "finché");
});

/* The apostrophe is the writer saying which word they meant, so finishing the
   job is safe where correcting the bare word would not be. */
test("finishes an apostrophe spelling the bare word is not corrected into", () => {
  assert.equal(correctionFor("e'"), "è");
  assert.equal(correctionFor("ne'"), "né");
  assert.equal(correctionFor("e"), null);
  assert.equal(correctionFor("ne"), null);
});

test("keeps the shape of what was typed", () => {
  assert.equal(correctionFor("PERCHE"), "PERCHÉ");
  assert.equal(correctionFor("Perche"), "Perché");
  assert.equal(correctionFor("perche"), "perché");
});

/* The rule the dictionary is built on: a word that exists without its accent
   is never corrected, however much more common the accented one is. */
test("does not rewrite a word somebody may have meant", () => {
  for (const word of ["sara", "faro", "meta", "eta", "te", "se", "si", "da", "la", "li", "its"])
    assert.equal(correctionFor(word), null, word);
});

test("still knows the English contractions it was written for", () => {
  assert.equal(correctionFor("doesnt"), "doesn't");
  assert.equal(correctionFor("DOESNT"), "DOESN'T");
});
