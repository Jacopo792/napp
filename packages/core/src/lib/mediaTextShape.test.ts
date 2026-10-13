import assert from "node:assert/strict";
import test from "node:test";
import { readableMedia } from "./mediaTextShape.ts";
test("searchable media follows nested references, deduplicates and excludes video and drawings", () => {
  assert.deepEqual(
    readableMedia({
      type: "doc",
      content: [
        { type: "privateImage", attrs: { objectId: "image", alt: "Page" } },
        {
          type: "blockquote",
          content: [
            { type: "privateImage", attrs: { objectId: "image", alt: "Page" } },
            { type: "privateFile", attrs: { objectId: "scan", label: "Scanned.PDF" } },
          ],
        },
        { type: "privateFile", attrs: { objectId: "movie", label: "video.mp4" } },
        { type: "drawing", attrs: { objectId: "ignored" } },
      ],
    }),
    [
      { id: "image", type: "image", label: "Page" },
      { id: "scan", type: "pdf", label: "Scanned.PDF" },
    ],
  );
  assert.deepEqual(readableMedia(null), []);
});
