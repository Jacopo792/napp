import assert from "node:assert/strict";
import test from "node:test";
import { linkedNoteIds, linksTo, mentionOf } from "./derived.ts";

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

const link = (noteId: string, text: string) => ({
  type: "text",
  text,
  marks: [{ type: "noteLink", attrs: { noteId } }],
});

test("lists the notes a document links to, once each, in order", () => {
  const doc = {
    type: "doc",
    content: [
      { type: "paragraph", content: [link("b", "Capitolo 2"), { type: "text", text: " e " }] },
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [{ type: "paragraph", content: [link("a", "Intro"), link("b", "di nuovo")] }],
          },
        ],
      },
    ],
  };
  assert.deepEqual([...linkedNoteIds(doc)], ["b", "a"]);
  assert.equal(linksTo(doc, "a"), true);
  assert.deepEqual([...linkedNoteIds({ type: "doc", content: [] })], []);
});

/* An unlinked mention is the title as plain words. The rules are the ones that
   make it worth showing: whole words, any case and accent, across a change of
   formatting, and never words that are already a link. */
test("a note is mentioned by its title as words, never by a link or a longer word", () => {
  const paragraph = (...content: unknown[]) => ({ type: "paragraph", content });
  const text = (value: string, marks?: unknown[]) => ({ type: "text", text: value, marks });
  const doc = (...content: unknown[]) => ({ type: "doc", content });
  const link = [{ type: "noteLink", attrs: { noteId: "x" } }];

  // Written as it is written, accents and capitals and all.
  assert.equal(
    mentionOf(doc(paragraph(text("Ne parlo nel Perché Dante."))), "perche dante"),
    "Perché Dante",
  );
  // Across a bold word, and deep inside a list.
  assert.equal(
    mentionOf(
      doc({
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [
              paragraph(text("La "), text("Commedia", [{ type: "bold" }]), text(" di Dante")),
            ],
          },
        ],
      }),
      "Commedia di Dante",
    ),
    "Commedia di Dante",
  );
  // Inside a longer word is not a mention; a punctuation end needs no boundary.
  assert.equal(mentionOf(doc(paragraph(text("I danteschi"))), "Dante"), null);
  assert.equal(mentionOf(doc(paragraph(text("Scritto in C++17"))), "C++"), "C++");
  // Already linked is not a mention — but a later plain one still is.
  assert.equal(
    mentionOf(doc(paragraph(text("Dante", link), text(" e poi Dante"))), "Dante"),
    "Dante",
  );
  assert.equal(mentionOf(doc(paragraph(text("Dante", link))), "Dante"), null);
  // Too short to mean the note, and the shapes that must not throw.
  assert.equal(mentionOf(doc(paragraph(text("io e te"))), "io"), null);
  assert.equal(mentionOf(null, "Dante"), null);
});
