import assert from "node:assert/strict";
import test from "node:test";

import { richTextToMarkdown } from "./content.ts";
import { exportFileName, markdownToNote, noteToMarkdown, uniqueFileNames } from "./exchange.ts";

test("a note leaves as Markdown and comes back as the same note", () => {
  const source = [
    "# MAPPA 5: I conglomerati",
    "",
    "Il punto non è la **dimensione**.",
    "",
    "- primo",
    "- secondo",
    "",
    "## Seconda parte",
    "",
    "Testo con un [link](https://example.com).",
    "",
  ].join("\n");

  const first = markdownToNote("ignored.md", source);
  assert.equal(first.title, "MAPPA 5: I conglomerati");

  const round = markdownToNote("ignored.md", noteToMarkdown(first.title, first.content));
  assert.equal(round.title, first.title);
  assert.equal(richTextToMarkdown(round.content), richTextToMarkdown(first.content));
});

test("the title heading is not left duplicated in the body", () => {
  const { content } = markdownToNote("x.md", "# Titolo\n\nCorpo.\n");
  assert.ok(!richTextToMarkdown(content).includes("Titolo"));
});

test("a file with no heading is named by its file", () => {
  assert.equal(markdownToNote("Appunti sparsi.md", "Solo corpo.\n").title, "Appunti sparsi");
});

test("a private image survives the round trip as its reference", () => {
  const document = {
    type: "doc",
    content: [{ type: "privateImage", attrs: { objectId: "abc123", alt: "Schema" } }],
  };
  const markdown = noteToMarkdown("Con figura", document);
  assert.match(markdown, /napp-image:abc123/);
  assert.equal(markdownToNote("x.md", markdown).content.content?.[0]?.attrs?.objectId, "abc123");
});

test("a title that would break a filesystem does not", () => {
  assert.equal(exportFileName("Storia/Roma: parte 1?"), "Storia Roma parte 1.md");
  assert.equal(exportFileName("   "), "Untitled.md");
  assert.ok(exportFileName("x".repeat(400)).length <= 83);
});

test("two notes with one title do not become one file", () => {
  assert.deepEqual(uniqueFileNames(["Appunti", "Appunti", "Appunti"]), [
    "Appunti.md",
    "Appunti 2.md",
    "Appunti 3.md",
  ]);
});
