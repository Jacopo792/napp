/* Metro must never package yesterday's preview as today's real editor. */
module.exports = function assertEditorMode(html, preview) {
  const expected = preview ? "preview" : "production";
  if (!html.includes(`<meta name="napp-editor-mode" content="${expected}">`)) {
    throw new Error(
      `The embedded editor is not a ${expected} build. Run ${preview ? "NAPP_PREVIEW=1 " : "NAPP_PREVIEW=0 "}pnpm --filter @notes-app/mobile editor first.`,
    );
  }
  if (!preview && html.includes("__nappPreview_")) {
    throw new Error("A production editor must not contain preview backends.");
  }
};
