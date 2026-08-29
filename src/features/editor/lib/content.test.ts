import assert from "node:assert/strict";
import test from "node:test";
import { documentGlyph, legacyMarkdownToRichText, richTextToPlainText } from "./content.ts";

test("legacy colours become structured marks without delimiter text", () => {
  const document = legacyMarkdownToRichText(
    "A ==purple:**bold** and _italic_== sentence\n\n====\n\nClean paragraph",
  );

  assert.equal(richTextToPlainText(document), "A bold and italic sentence\nClean paragraph");
  const json = JSON.stringify(document);
  assert.doesNotMatch(json, /==/);
  assert.match(json, /var\(--tint-purple\)/);
  assert.match(json, /"type":"bold"/);
  assert.match(json, /"type":"italic"/);
});

test("legacy private media and GFM blocks become first-class nodes", () => {
  const imageId = "11111111-1111-4111-8111-111111111111";
  const fileId = "22222222-2222-4222-8222-222222222222";
  const document = legacyMarkdownToRichText(
    `- [x] Done\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n![Photo](napp-image:${imageId})\n\n[Paper.pdf](napp-file:${fileId})`,
  );

  assert.equal(documentGlyph(document), "attachment");
  const json = JSON.stringify(document);
  assert.match(json, /"type":"taskList"/);
  assert.match(json, /"type":"table"/);
  assert.match(json, /"type":"privateImage"/);
  assert.match(json, /"type":"privateFile"/);
});
