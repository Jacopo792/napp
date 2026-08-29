import test from "node:test";
import assert from "node:assert/strict";
import { previewOf } from "./format.ts";

test("plain-text previews collapse structural whitespace", () => {
  assert.equal(
    previewOf("Elemento completato\n\nSecondo elemento"),
    "Elemento completato Secondo elemento",
  );
});

test("attachment previews receive only the readable node label", () => {
  assert.equal(previewOf("Studio finale.pdf"), "Studio finale.pdf");
});
