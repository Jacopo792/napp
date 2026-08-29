import test from "node:test";
import assert from "node:assert/strict";
import { attachmentLabel, attachmentObjectId, attachmentReference } from "./attachments.ts";

test("attachment references round-trip without exposing a public URL", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  assert.equal(attachmentObjectId(attachmentReference(id)), id);
  assert.equal(attachmentObjectId("https://example.com/document.pdf"), null);
});

test("attachment labels remain safe for their structured card", () => {
  assert.equal(attachmentLabel("[Studio] finale.pdf"), "Studio finale.pdf");
});
