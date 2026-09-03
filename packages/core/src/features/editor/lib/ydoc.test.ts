import assert from "node:assert/strict";
import test from "node:test";
import type { JSONContent } from "@tiptap/core";
import * as Y from "yjs";
import { legacyMarkdownToRichText } from "./content.ts";
import {
  BODY_FRAGMENT,
  TITLE_TEXT,
  decodeDocument,
  encodeDocument,
  isUntouched,
  noteSchema,
  projectDocument,
  seedDocument,
} from "./ydoc.ts";

/** ProseMirror fills in every default attribute, so a document that survived
 *  the trip is not character-identical to the literal that went in. Compare
 *  what the schema makes of each. */
function normalized(document: JSONContent) {
  return plain(noteSchema().nodeFromJSON(document).toJSON());
}

/* y-prosemirror builds attribute bags with a null prototype, which is the same
   object to every reader and a different one to `deepEqual`. */
function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function paragraph(doc: Y.Doc, index: number, text: string) {
  const element = new Y.XmlElement("paragraph");
  const content = new Y.XmlText();
  content.insert(0, text);
  element.insert(0, [content]);
  doc.getXmlFragment(BODY_FRAGMENT).insert(index, [element]);
}

/** Two documents that have seen each other's whole history. */
function exchange(a: Y.Doc, b: Y.Doc) {
  const updateA = Y.encodeStateAsUpdate(a, Y.encodeStateVector(b));
  const updateB = Y.encodeStateAsUpdate(b, Y.encodeStateVector(a));
  Y.applyUpdate(b, updateA);
  Y.applyUpdate(a, updateB);
}

const RICH = legacyMarkdownToRichText(
  [
    "# Heading",
    "",
    "A paragraph with **bold**, *italic* and a [link](https://example.invalid).",
    "",
    "- [ ] unchecked",
    "- [x] checked",
    "",
    "| a | b |",
    "| - | - |",
    "| 1 | 2 |",
    "",
    "![Sketch](napp-image:11111111-2222-3333-4444-555555555555)",
    "",
    "[Report.pdf](napp-file:66666666-7777-8888-9999-000000000000)",
    "",
    "==purple:coloured words==",
  ].join("\n"),
);

test("an existing note survives the trip through Yjs unchanged", () => {
  const seeded = seedDocument("Notes from the field", RICH);
  const projection = projectDocument(seeded);
  assert.equal(projection.title, "Notes from the field");
  assert.deepEqual(normalized(projection.content), normalized(RICH));
});

test("tables, checklists, colours and private media all come back", () => {
  const json = JSON.stringify(projectDocument(seedDocument("", RICH)).content);
  for (const marker of [
    "privateImage",
    "privateFile",
    "taskItem",
    "tableCell",
    "11111111-2222-3333-4444-555555555555",
    "66666666-7777-8888-9999-000000000000",
  ]) {
    assert.ok(json.includes(marker), `${marker} did not survive the conversion`);
  }
});

test("a document round-trips through its stored binary", () => {
  const seeded = seedDocument("Kept", RICH);
  const restored = decodeDocument(encodeDocument(seeded));
  assert.deepEqual(plain(projectDocument(restored)), plain(projectDocument(seeded)));
});

test("concurrent title edits converge, whichever order they arrive in", () => {
  const seed = encodeDocument(seedDocument("Report", RICH));
  const forwards = [decodeDocument(seed), decodeDocument(seed)];
  forwards[0].getText(TITLE_TEXT).insert(0, "Draft ");
  forwards[1].getText(TITLE_TEXT).insert(6, " 2026");

  const backwards = [decodeDocument(seed), decodeDocument(seed)];
  backwards[1].getText(TITLE_TEXT).insert(6, " 2026");
  backwards[0].getText(TITLE_TEXT).insert(0, "Draft ");

  exchange(forwards[0], forwards[1]);
  exchange(backwards[1], backwards[0]);

  const title = projectDocument(forwards[0]).title;
  assert.equal(title, projectDocument(forwards[1]).title);
  assert.equal(title, projectDocument(backwards[0]).title);
  assert.equal(title, projectDocument(backwards[1]).title);
  assert.ok(title.includes("Draft") && title.includes("Report") && title.includes("2026"));
});

test("two people typing in the same paragraph keep both texts, not two copies", () => {
  const seed = encodeDocument(seedDocument("", { type: "doc", content: [{ type: "paragraph" }] }));
  const mine = decodeDocument(seed);
  const yours = decodeDocument(seed);

  // One shared empty line, the way a new note arrives: one paragraph, and both
  // people put their caret in it.
  const line = (doc: Y.Doc) => doc.getXmlFragment(BODY_FRAGMENT).get(0) as Y.XmlElement;
  line(mine).insert(0, [new Y.XmlText()]);
  exchange(mine, yours);

  const text = (doc: Y.Doc) => line(doc).get(0) as Y.XmlText;
  text(mine).insert(0, "hello");
  text(yours).insert(0, "goodbye");
  exchange(mine, yours);

  const written = JSON.stringify(projectDocument(mine).content);
  assert.deepEqual(plain(projectDocument(mine).content), plain(projectDocument(yours).content));
  assert.ok(written.includes("hello") && written.includes("goodbye"));
  // One paragraph, not one per writer: nothing was copied aside.
  assert.equal(projectDocument(mine).content.content?.length, 1);
});

test("reconnecting after working offline adds nothing twice", () => {
  const seed = encodeDocument(seedDocument("Offline", RICH));
  const server = decodeDocument(seed);
  const client = decodeDocument(seed);

  paragraph(client, 0, "written while the network was down");
  const offline = Y.encodeStateAsUpdate(client);
  // The same update replayed — a reconnect that retries, a tab that restores
  // from IndexedDB and then syncs. Yjs is idempotent and this pins that.
  Y.applyUpdate(server, offline);
  Y.applyUpdate(server, offline);
  Y.applyUpdate(server, Y.encodeStateAsUpdate(client));

  assert.deepEqual(plain(projectDocument(server).content), plain(projectDocument(client).content));
  const paragraphs = JSON.stringify(projectDocument(server).content).split(
    "written while the network was down",
  ).length;
  assert.equal(paragraphs, 2, "the offline paragraph landed more than once");
});

test("a seeded document is never mistaken for one nobody has opened", () => {
  assert.equal(isUntouched(new Y.Doc()), true);
  assert.equal(isUntouched(seedDocument("", RICH)), false);
});
