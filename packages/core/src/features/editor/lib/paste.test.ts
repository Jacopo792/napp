import test from "node:test";
import assert from "node:assert/strict";
import { pasteMediaDecision } from "./pasteDecision.ts";

test("ordinary text paste stays on the editor's native path", () => {
  assert.deepEqual(
    pasteMediaDecision({ html: "", text: "hello", fileCount: 0, hasNativeClipboard: true }),
    { handle: false, readNative: false },
  );
});

test("rich text without images stays on the editor's native path", () => {
  assert.deepEqual(
    pasteMediaDecision({
      html: "<p><strong>hello</strong></p>",
      text: "hello",
      fileCount: 0,
      hasNativeClipboard: true,
    }),
    { handle: false, readNative: false },
  );
});

test("desktop rich paste reads the native clipboard when image bytes are missing", () => {
  assert.deepEqual(
    pasteMediaDecision({
      html: '<p>hello<img src="blob:source"></p>',
      text: "hello",
      fileCount: 0,
      hasNativeClipboard: true,
    }),
    { handle: true, readNative: true },
  );
});

test("an image File is handled without rereading the native clipboard", () => {
  assert.deepEqual(
    pasteMediaDecision({ html: "", text: "", fileCount: 1, hasNativeClipboard: true }),
    { handle: true, readNative: false },
  );
});
