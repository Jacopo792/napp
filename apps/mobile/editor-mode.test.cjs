const assert = require("node:assert/strict");
const { test } = require("node:test");
const assertEditorMode = require("./editor-mode.cjs");

test("a stale preview cannot be packaged with the production backend", () => {
  const preview = '<meta name="napp-editor-mode" content="preview">';
  const production = '<meta name="napp-editor-mode" content="production">';
  assert.throws(() => assertEditorMode(preview, false), /not a production build/);
  assert.throws(() => assertEditorMode(production, true), /not a preview build/);
  assert.throws(
    () => assertEditorMode(production + "__nappPreview_stores", false),
    /preview backends/,
  );
  assert.doesNotThrow(() => assertEditorMode(preview, true));
  assert.doesNotThrow(() => assertEditorMode(production, false));
});
