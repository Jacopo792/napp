import assert from "node:assert/strict";
import test from "node:test";
import { noteSchema } from "./ydoc.ts";
import { commentQuotes } from "./commentAnchors.ts";

const threadId = "11111111-2222-3333-4444-555555555555";

test("a comment spanning paragraphs keeps a word boundary in its quote", () => {
  const mark = { type: "comment", attrs: { threadId } };
  const document = noteSchema().nodeFromJSON({
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "emotionless", marks: [mark] }] },
      { type: "paragraph", content: [{ type: "text", text: "perhaps", marks: [mark] }] },
    ],
  });

  assert.equal(commentQuotes(document).get(threadId), "emotionless perhaps");
});

test("a resolved anchor remains structural and carries its state", () => {
  const document = noteSchema().nodeFromJSON({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "kept",
            marks: [{ type: "comment", attrs: { threadId, resolved: true } }],
          },
        ],
      },
    ],
  });

  const mark = document.firstChild?.firstChild?.marks.find(
    (candidate) => candidate.type.name === "comment",
  );
  assert.equal(mark?.attrs.resolved, true);
  assert.equal(commentQuotes(document).get(threadId), "kept");
});
