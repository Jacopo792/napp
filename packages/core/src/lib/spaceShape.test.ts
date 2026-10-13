import assert from "node:assert/strict";
import test from "node:test";
import {
  archiveKind,
  ARCHIVE_PRESETS,
  DEFAULT_FEATURES,
  DEFAULT_PAGE,
  documentFeatures,
  pageSetup,
  printPageCss,
} from "./spaceShape.ts";

test("an unknown kind is notes, including the retired 'thesis'", () => {
  assert.equal(archiveKind("document"), "document");
  assert.equal(archiveKind("thesis"), "notes");
  assert.equal(archiveKind(null), "notes");
});

test("features are read, not trusted", () => {
  assert.deepEqual(documentFeatures(null), DEFAULT_FEATURES);
  assert.deepEqual(documentFeatures({ partnerName: "x" }), DEFAULT_FEATURES);
  const read = documentFeatures({
    features: { manuscript: "own", footnotes: true, review: "yes", wordGoal: -4 },
  });
  assert.equal(read.manuscript, "own");
  assert.equal(read.footnotes, true);
  assert.equal(read.review, false);
  assert.equal(read.wordGoal, undefined);
  assert.equal(documentFeatures({ features: { wordGoal: 40000 } }).wordGoal, 40000);
});

test("every preset reads back as itself", () => {
  for (const preset of ARCHIVE_PRESETS)
    assert.deepEqual(documentFeatures({ features: preset.features }), preset.features);
});

test("the page is read, not trusted", () => {
  assert.deepEqual(pageSetup(null), DEFAULT_PAGE);
  const page = pageSetup({
    page: { size: "letter", margins: "huge", font: "garamond", fontSize: 99, lineHeight: 2 },
  });
  assert.equal(page.size, "letter");
  assert.equal(page.margins, "normal");
  assert.equal(page.font, "garamond");
  assert.equal(page.fontSize, 12);
  assert.equal(page.lineHeight, 2);
});

test("the reference options are read, not trusted", () => {
  assert.equal(DEFAULT_PAGE.labels, "en");
  assert.equal(DEFAULT_PAGE.footnoteNumbering, "chapter");
  const read = pageSetup({
    page: { labels: "it", footnoteNumbering: "document", captionSeparator: "semicolon" },
  });
  assert.equal(read.labels, "it");
  assert.equal(read.footnoteNumbering, "document");
  assert.equal(read.captionSeparator, "period");
  assert.equal(pageSetup({ page: { tableCaption: "below" } }).tableCaption, "below");
});

test("a printed chapter is set on the page setup, with heads only when asked", () => {
  const heads = { book: 'Il "libro"', chapter: "Capitolo\nprimo" };
  const plain = printPageCss({ ...DEFAULT_PAGE, orientation: "landscape", margins: "wide" }, heads);
  assert.equal(plain, "@page { size: 297mm 210mm; margin: 38.1mm; }");
  const single = printPageCss({ ...DEFAULT_PAGE, headers: true }, heads);
  assert.match(single, /@top-center \{ content: "Capitolo primo";/);
  assert.match(single, /@bottom-center \{ content: counter\(page\);/);
  assert.match(single, /@page :first \{ @top-left \{ content: none; \}/);
  const facing = printPageCss({ ...DEFAULT_PAGE, headers: true, facing: true }, heads);
  assert.match(facing, /@page :left \{ @top-left \{ content: "Il \\"libro\\"";/);
  assert.match(facing, /@page :right \{ @top-right \{ content: "Capitolo primo";.*@bottom-right/);
  assert.equal(pageSetup({ page: { headers: true, facing: "yes" } }).facing, false);
  assert.equal(pageSetup({ page: { headers: true } }).headers, true);
});
