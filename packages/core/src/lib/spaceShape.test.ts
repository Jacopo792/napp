import assert from "node:assert/strict";
import test from "node:test";
import { archiveKind, ARCHIVE_PRESETS, DEFAULT_FEATURES, documentFeatures } from "./spaceShape.ts";

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
