import assert from "node:assert/strict";
import test from "node:test";
import { anchoredBlock, blockId, paragraphLink, readBlockLink } from "./blockLinks.ts";
import {
  seedDocument,
  projectDocument,
  noteSchema,
  BODY_FRAGMENT,
} from "../features/editor/lib/ydoc.ts";
import { legacyMarkdownToRichText, richTextToMarkdown } from "../features/editor/lib/content.ts";
import type { XmlElement, XmlText } from "yjs";

test("paragraph references use explicit ids and reject malformed syntax", () => {
  assert.equal(blockId("bad#id"), null);
  assert.deepEqual(readBlockLink(paragraphLink("A note", "target-1")), {
    title: "A note",
    id: "target-1",
  });
  assert.equal(readBlockLink("[[A note]]"), null);
});
test("opening old paragraphs stores no id; an explicit id survives edits before its words", () => {
  const doc = seedDocument("A", {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "Words" }] }],
  });
  const paragraph = doc.getXmlFragment(BODY_FRAGMENT).get(0) as XmlElement;
  assert.equal(paragraph.getAttribute("blockId"), undefined);
  paragraph.setAttribute("blockId", "target-1");
  const text = paragraph.get(0) as XmlText;
  text.insert(0, "New ");
  const projection = projectDocument(doc).content;
  assert.equal(projection.content?.[0].attrs?.blockId, "target-1");
  const node = noteSchema().nodeFromJSON(projection);
  assert.deepEqual(anchoredBlock(node, "target-1"), { from: 1, to: 10 });
  doc.destroy();
});
test("Markdown keeps a referenced paragraph's anchor and link destination", () => {
  const content = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        attrs: { blockId: "target-1" },
        content: [{ type: "text", text: "Target" }],
      },
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "A note",
            marks: [{ type: "noteLink", attrs: { noteId: "note-1", blockId: "target-1" } }],
          },
        ],
      },
    ],
  };
  const markdown = richTextToMarkdown(content);
  assert.match(markdown, /Target \^target-1/);
  assert.match(markdown, /\[\[A note#\^target-1\]\]/);
  const restored = legacyMarkdownToRichText(markdown);
  assert.equal(restored.content?.[0].attrs?.blockId, "target-1");
  assert.equal(restored.content?.[0].content?.[0].text, "Target");
});

test("pasting an anchored paragraph before its original keeps the original destination", async () => {
  const { EditorState } = await import("@tiptap/pm/state");
  const { blockAnchorPlugin } = await import("../features/editor/lib/blockAnchors.ts");
  const schema = noteSchema();
  const paragraph = schema.node("paragraph", { blockId: "target-1" }, [schema.text("Words")]);
  const state = EditorState.create({
    schema,
    doc: schema.node("doc", null, [paragraph]),
    plugins: [blockAnchorPlugin()],
  });
  const result = state.applyTransaction(state.tr.insert(0, paragraph)).state.doc;
  assert.equal(result.child(0).attrs.blockId, null);
  assert.equal(result.child(1).attrs.blockId, "target-1");
});
