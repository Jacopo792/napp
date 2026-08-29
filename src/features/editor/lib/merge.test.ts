import assert from "node:assert/strict";
import test from "node:test";
import type { JSONContent } from "@tiptap/core";
import { mergeBlocks, mergeDocuments, mergeTitle } from "./merge.ts";

const p = (text: string): JSONContent => ({
  type: "paragraph",
  content: [{ type: "text", text }],
});
const image = (objectId: string): JSONContent => ({ type: "privateImage", attrs: { objectId } });
const texts = (blocks: JSONContent[] | null) =>
  blocks?.map((block) =>
    block.type === "privateImage" ? `image:${block.attrs?.objectId}` : block.content?.[0]?.text,
  );

test("both appending at the end keeps both, which is the case that lost text", () => {
  const base = [p("one")];
  const local = [p("one"), p("from Jacopo")];
  const remote = [p("one"), p("from Lisa")];
  assert.deepEqual(texts(mergeBlocks(base, local, remote)), ["one", "from Jacopo", "from Lisa"]);
});

test("an image added at the end survives an edit made earlier in the note", () => {
  const base = [p("one"), p("two")];
  const local = [p("one edited"), p("two")];
  const remote = [p("one"), p("two"), image("abc")];
  assert.deepEqual(texts(mergeBlocks(base, local, remote)), ["one edited", "two", "image:abc"]);
});

test("only one side changed: the other side's document is taken whole", () => {
  const base = [p("one")];
  assert.deepEqual(texts(mergeBlocks(base, base, [p("one"), p("new")])), ["one", "new"]);
  assert.deepEqual(texts(mergeBlocks(base, [p("one"), p("mine")], base)), ["one", "mine"]);
});

test("the same change on both sides is not a conflict", () => {
  const base = [p("one")];
  const both = [p("one"), p("same")];
  assert.deepEqual(texts(mergeBlocks(base, both, both)), ["one", "same"]);
});

test("a fresh note: both typing into the one empty paragraph keeps both", () => {
  const base = [{ type: "paragraph" }];
  const local = [p("JACOPO: ci sei?")];
  const remote = [p("LISA: sono qui")];
  assert.deepEqual(texts(mergeBlocks(base, local, remote)), ["JACOPO: ci sei?", "LISA: sono qui"]);
});

test("a blank spot filled with several blocks on one side keeps all of them", () => {
  const base = [p("intro"), { type: "paragraph" }];
  const local = [p("intro"), p("mine one"), p("mine two")];
  const remote = [p("intro"), p("theirs")];
  assert.deepEqual(texts(mergeBlocks(base, local, remote)), [
    "intro",
    "mine one",
    "mine two",
    "theirs",
  ]);
});

test("a paragraph of only whitespace counts as blank", () => {
  const base = [p("   ")];
  assert.deepEqual(texts(mergeBlocks(base, [p("mine")], [p("theirs")])), ["mine", "theirs"]);
});

test("an image is never blank, so replacing the same one still conflicts", () => {
  const base = [image("old")];
  assert.equal(mergeBlocks(base, [image("mine")], [image("theirs")]), null);
});

test("both editing the same block is a conflict the caller has to resolve", () => {
  const base = [p("one"), p("two")];
  const local = [p("one"), p("two — Jacopo")];
  const remote = [p("one"), p("two — Lisa")];
  assert.equal(mergeBlocks(base, local, remote), null);
});

test("a deletion on one side and an append on the other both apply", () => {
  const base = [p("one"), p("two"), p("three")];
  const local = [p("one"), p("three")];
  const remote = [p("one"), p("two"), p("three"), p("four")];
  assert.deepEqual(texts(mergeBlocks(base, local, remote)), ["one", "three", "four"]);
});

test("inserting in the middle while the other appends keeps document order", () => {
  const base = [p("a"), p("z")];
  const local = [p("a"), p("m"), p("z")];
  const remote = [p("a"), p("z"), p("tail")];
  assert.deepEqual(texts(mergeBlocks(base, local, remote)), ["a", "m", "z", "tail"]);
});

test("mergeDocuments never returns a document with no blocks", () => {
  const doc = (blocks: JSONContent[]): JSONContent => ({ type: "doc", content: blocks });
  const merged = mergeDocuments(doc([p("one")]), doc([]), doc([p("one")]));
  assert.equal(merged?.content?.length, 1);
  assert.equal(merged?.content?.[0].type, "paragraph");
});

test("the title follows whoever moved it away from the base", () => {
  assert.equal(mergeTitle("old", "old", "hers"), "hers");
  assert.equal(mergeTitle("old", "mine", "old"), "mine");
  assert.equal(mergeTitle("old", "mine", "hers"), "mine");
});
