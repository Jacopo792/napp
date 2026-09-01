import assert from "node:assert/strict";
import test from "node:test";
import {
  documentGlyph,
  legacyMarkdownToRichText,
  richTextToPlainText,
  withoutInvisibleDocumentEnding,
} from "./content.ts";

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

/* What decides whether a note counts as edited. The collaboration server sends
   this projection to `save_note_document`, which restamps `updated_at` only
   when it differs from the stored row — so anything this fails to normalise
   moves a note to the top of the list for nothing. */
test("an invisible document ending is not a change, and deleted words are", () => {
  const paragraph = (text: string) => ({
    type: "paragraph",
    content: text ? [{ type: "text", text }] : [],
  });
  const stored = { type: "doc", content: [paragraph("Now it works")] };

  // Typed at the end and deleted again: a trailing space, and the empty
  // paragraph the return left behind.
  const typedAndErased = {
    type: "doc",
    content: [paragraph("Now it works "), paragraph(""), paragraph("")],
  };
  assert.deepEqual(
    withoutInvisibleDocumentEnding(typedAndErased),
    withoutInvisibleDocumentEnding(stored),
  );

  // A word genuinely removed is still a change.
  const shortened = { type: "doc", content: [paragraph("Now it")] };
  assert.notDeepEqual(
    withoutInvisibleDocumentEnding(shortened),
    withoutInvisibleDocumentEnding(stored),
  );

  // A note emptied on purpose keeps its one paragraph rather than losing the
  // document body altogether.
  assert.deepEqual(withoutInvisibleDocumentEnding({ type: "doc", content: [paragraph("")] }), {
    type: "doc",
    content: [paragraph("")],
  });
});
