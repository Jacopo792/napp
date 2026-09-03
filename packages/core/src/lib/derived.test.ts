import assert from "node:assert/strict";
import test from "node:test";
import { linksTo } from "./derived.ts";

/* Backlinks are read by walking the document rather than by querying a column,
   so this walk is the whole of the feature: miss a nesting level and a note
   linked from inside a list, a table cell or a quote reports nothing pointing
   at it. */
test("a link is found however deeply it is nested, and only the right one", () => {
  const target = "aaaaaaaa-1111-2222-3333-444444444444";
  const other = "bbbbbbbb-1111-2222-3333-444444444444";
  const link = (noteId: string) => ({
    type: "text",
    text: "Aforismi",
    marks: [{ type: "noteLink", attrs: { noteId } }],
  });

  const buried = {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "niente qui" }] },
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [
              { type: "paragraph", content: [{ type: "text", text: "primo" }, link(target)] },
            ],
          },
        ],
      },
    ],
  };

  assert.equal(linksTo(buried, target), true);
  assert.equal(linksTo(buried, other), false);

  // A note with no links at all, and the shapes that must not throw.
  assert.equal(linksTo({ type: "doc", content: [{ type: "paragraph" }] }, target), false);
  assert.equal(linksTo(null, target), false);
  assert.equal(linksTo("not a document", target), false);

  // Another mark of the same shape is not a link.
  assert.equal(
    linksTo(
      {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "x", marks: [{ type: "comment", attrs: { noteId: target } }] },
            ],
          },
        ],
      },
      target,
    ),
    false,
  );
});
