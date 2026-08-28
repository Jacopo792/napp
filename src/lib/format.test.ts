import test from "node:test";
import assert from "node:assert/strict";
import { previewOf } from "./format.ts";

test("list previews hide checklist and colour storage syntax", () => {
  assert.equal(
    previewOf("- [x] ==purple:Elemento completato==\n- [ ] ==Secondo elemento=="),
    "Elemento completato Secondo elemento",
  );
});

test("attachment previews keep the readable file label", () => {
  assert.equal(
    previewOf("[Studio finale.pdf](napp-file:00000000-0000-4000-8000-000000000001)"),
    "Studio finale.pdf",
  );
});
