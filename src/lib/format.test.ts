import test from "node:test";
import assert from "node:assert/strict";
import { fold, previewOf } from "./format.ts";

test("plain-text previews collapse structural whitespace", () => {
  assert.equal(
    previewOf("Elemento completato\n\nSecondo elemento"),
    "Elemento completato Secondo elemento",
  );
});

test("attachment previews receive only the readable node label", () => {
  assert.equal(previewOf("Studio finale.pdf"), "Studio finale.pdf");
});

/* An archive written in Italian is mostly accents, and nobody types them into
   a search field. */
test("searching folds the marks off its letters", () => {
  assert.equal(fold("Perché è così"), "perche e cosi");
  assert.ok(fold("Caffè corretto").includes(fold("caffe")));
});
