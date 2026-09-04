import assert from "node:assert/strict";
import test from "node:test";
import type { JSONContent } from "@tiptap/react";
import {
  DRAWING_BOX,
  DRAWING_INKS,
  checklistProgress,
  documentGlyph,
  drawingBox,
  drawingInkBox,
  drawingStrokes,
  drawingSvg,
  firstDrawing,
  legacyMarkdownToRichText,
  richTextToPlainText,
  straightenStroke,
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

test("a note's first drawing and its checklist are read from the document", () => {
  const document: JSONContent = {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "before" }] },
      { type: "drawing", attrs: { strokes: "[]", surface: "board" } },
      {
        type: "drawing",
        attrs: { strokes: JSON.stringify([{ d: "M0,0L10,10", color: "#5B9BFF", width: 5 }]) },
      },
      {
        type: "taskList",
        content: [
          { type: "taskItem", attrs: { checked: true }, content: [] },
          { type: "taskItem", attrs: { checked: false }, content: [] },
          { type: "taskItem", attrs: { checked: true }, content: [] },
        ],
      },
    ],
  };
  // An empty drawing is not a picture of anything, so the first *drawn* one wins.
  assert.equal(firstDrawing(document)?.strokes.length, 1);
  assert.deepEqual(checklistProgress(document), { done: 2, total: 3 });
  assert.equal(firstDrawing({ type: "doc", content: [] }), null);
  assert.equal(checklistProgress({ type: "doc", content: [] }), null);
});

/* A page drawing is as tall as the note it was drawn over, so its exported
   picture cannot be the board's box. */
test("a page drawing exports a box as tall as its lowest stroke", () => {
  const strokes = drawingStrokes(
    JSON.stringify([{ d: "M10,10L20,900", color: "#5B9BFF", width: 6 }]),
  );
  assert.deepEqual(drawingBox(strokes, "board"), DRAWING_BOX);
  assert.deepEqual(drawingBox(strokes, "page"), { width: 1000, height: 906 });
  assert.match(drawingSvg(strokes, "page"), /viewBox="0 0 1000 906"/);
});

/* A note row's glyph slot is 28 pixels, so a thumbnail is measured by where the
   ink is and not by the sheet it was drawn on — measured by the sheet, a
   signature in the corner of a board arrives as four specks. */
test("a thumbnail is measured by the ink, not by the sheet", () => {
  const corner = drawingStrokes(
    JSON.stringify([{ d: "M10,10L30,40", color: "#5B9BFF", width: 6 }]),
  );
  /* Half the nib on each side, or the round cap is cut off by its own box. */
  assert.deepEqual(drawingInkBox(corner), { x: 7, y: 7, width: 26, height: 36 });
  /* Nothing drawn: the surface is the honest answer. */
  assert.deepEqual(drawingInkBox([]), { x: 0, y: 0, ...DRAWING_BOX });
  /* A viewBox with a side of zero is not drawn at all, so a flat stroke with
     nothing to pad it still has to come back with a height. */
  assert.deepEqual(drawingInkBox([{ d: "M0,50L100,50", color: "#5B9BFF", width: 0 }]), {
    x: 0,
    y: 50,
    width: 100,
    height: 1,
  });
});

/* Held still at the end of a stroke, a scrawl becomes the shape it was aiming
   at — or stays a scrawl, which is the answer for most of them. */
test("a held stroke becomes the shape it was meant to be", () => {
  const wobblyLine = [
    { x: 100, y: 100 },
    { x: 200, y: 108 },
    { x: 300, y: 96 },
    { x: 400, y: 104 },
  ];
  assert.equal(straightenStroke(wobblyLine), "M100,100L400,104");

  const circle = Array.from({ length: 40 }, (_, i) => {
    const a = (i / 39) * Math.PI * 2;
    return { x: 500 + 200 * Math.cos(a) + (i % 3), y: 500 + 200 * Math.sin(a) - (i % 2) };
  });
  const round = straightenStroke(circle);
  assert.equal(round?.split("L").length, 49, "an ellipse is drawn as forty-eight segments");

  const square = [
    ...Array.from({ length: 10 }, (_, i) => ({ x: 100 + i * 30, y: 100 })),
    ...Array.from({ length: 10 }, (_, i) => ({ x: 400, y: 100 + i * 30 })),
    ...Array.from({ length: 10 }, (_, i) => ({ x: 400 - i * 30, y: 400 })),
    ...Array.from({ length: 10 }, (_, i) => ({ x: 100, y: 400 - i * 30 })),
    { x: 100, y: 100 },
  ];
  assert.equal(straightenStroke(square)?.split("L").length, 5, "a rectangle is four corners back");

  // Too small, too few points: a tick is a tick.
  assert.equal(straightenStroke([{ x: 0, y: 0 }]), null);
  assert.equal(
    straightenStroke([
      { x: 0, y: 0 },
      { x: 3, y: 3 },
      { x: 6, y: 2 },
      { x: 9, y: 5 },
    ]),
    null,
  );
});

/* The highlighter is the ink with an alpha on the end, so the reader has to
   admit eight digits as well as six. */
test("an ink may carry an alpha", () => {
  const strokes = drawingStrokes(
    JSON.stringify([
      { d: "M0,0L10,10", color: "#5B9BFF59", width: 30 },
      { d: "M0,0L10,10", color: "#5B9BFF", width: 6 },
      { d: "M0,0L10,10", color: "not a colour", width: 6 },
    ]),
  );
  assert.deepEqual(
    strokes.map((s) => s.color),
    ["#5B9BFF59", "#5B9BFF", DRAWING_INKS[0]],
  );
});
