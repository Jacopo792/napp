import test from "node:test";
import assert from "node:assert/strict";
import { headingsOf, nameMatch, snippetOf } from "./spotlight.ts";

test("a name is matched at its start, then a word's start, then anywhere", () => {
  assert.equal(nameMatch("L'Uno e la processione", "l'uno"), 0);
  assert.equal(nameMatch("L'Uno e la processione", "proc"), 1);
  assert.equal(nameMatch("L'Uno e la processione", "cession"), 2);
  assert.equal(nameMatch("L'Uno e la processione", "anima"), -1);
});

test("headings are read out of the document in order", () => {
  const doc = {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 2 },
        content: [
          { type: "text", text: "La " },
          { type: "text", text: "sovrabbondanza" },
        ],
      },
      { type: "paragraph", content: [{ type: "text", text: "testo" }] },
      { type: "heading", attrs: { level: 3 }, content: [] },
      {
        type: "blockquote",
        content: [
          { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "Dentro" }] },
        ],
      },
    ],
  };
  assert.deepEqual(headingsOf(doc), [
    { text: "La sovrabbondanza", level: 2 },
    { text: "Dentro", level: 3 },
  ]);
});

test("a snippet keeps the match as written, accents included", () => {
  const text =
    "Il primo principio non è un essere.\nPerché l'Uno è al di là dell'essere, e nient'altro.";
  const snippet = snippetOf(text, "perche", 12);
  assert.equal(snippet?.match, "Perché");
  assert.ok(snippet?.before.startsWith("…"));
  assert.ok(snippet?.after.endsWith("…"));
  assert.equal(snippetOf(text, "plotino"), null);
});

test("a match at the very start carries no leading ellipsis", () => {
  assert.deepEqual(snippetOf("Uno", "uno"), { before: "", match: "Uno", after: "" });
});
