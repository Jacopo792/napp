import test from "node:test";
import assert from "node:assert/strict";
import {
  assertAttachable,
  attachmentLabel,
  attachmentObjectId,
  attachmentReference,
  MAX_ATTACHMENT_BYTES,
} from "./attachments.ts";

test("attachment references round-trip without exposing a public URL", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  assert.equal(attachmentObjectId(attachmentReference(id)), id);
  assert.equal(attachmentObjectId("https://example.com/document.pdf"), null);
});

test("attachment labels remain safe for their structured card", () => {
  assert.equal(attachmentLabel("[Studio] finale.pdf"), "Studio finale.pdf");
});

test("videos can use the 100 MB private attachment allowance", () => {
  const video = { name: "clip.mp4", type: "video/mp4", size: MAX_ATTACHMENT_BYTES } as File;
  assert.doesNotThrow(() => assertAttachable(video));
});

test("attachments above 100 MB are refused before upload", () => {
  const video = {
    name: "clip.mp4",
    type: "video/mp4",
    size: MAX_ATTACHMENT_BYTES + 1,
  } as File;
  assert.throws(() => assertAttachable(video), /100\.0 MB/);
});
