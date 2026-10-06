import assert from "node:assert/strict";
import test from "node:test";

import { drawingStrokes, richTextToMarkdown } from "./content.ts";
import { exportFileName, markdownToNote, noteToMarkdown, uniqueFileNames } from "./exchange.ts";

test("a note leaves as Markdown and comes back as the same note", () => {
  const source = [
    "# MAPPA 5: I conglomerati",
    "",
    "Il punto non è la **dimensione**.",
    "",
    "- primo",
    "- secondo",
    "",
    "## Seconda parte",
    "",
    "Testo con un [link](https://example.com).",
    "",
  ].join("\n");

  const first = markdownToNote("ignored.md", source);
  assert.equal(first.title, "MAPPA 5: I conglomerati");

  const round = markdownToNote("ignored.md", noteToMarkdown(first.title, first.content));
  assert.equal(round.title, first.title);
  assert.equal(richTextToMarkdown(round.content), richTextToMarkdown(first.content));
});

test("the title heading is not left duplicated in the body", () => {
  const { content } = markdownToNote("x.md", "# Titolo\n\nCorpo.\n");
  assert.ok(!richTextToMarkdown(content).includes("Titolo"));
});

test("a file with no heading is named by its file", () => {
  assert.equal(markdownToNote("Appunti sparsi.md", "Solo corpo.\n").title, "Appunti sparsi");
});

test("a private image survives the round trip as its reference", () => {
  const document = {
    type: "doc",
    content: [{ type: "privateImage", attrs: { objectId: "abc123", alt: "Schema" } }],
  };
  const markdown = noteToMarkdown("Con figura", document);
  assert.match(markdown, /napp-image:abc123/);
  assert.equal(markdownToNote("x.md", markdown).content.content?.[0]?.attrs?.objectId, "abc123");
});

test("a title that would break a filesystem does not", () => {
  assert.equal(exportFileName("Storia/Roma: parte 1?"), "Storia Roma parte 1.md");
  assert.equal(exportFileName("   "), "Untitled.md");
  assert.ok(exportFileName("x".repeat(400)).length <= 83);
});

test("two notes with one title do not become one file", () => {
  assert.deepEqual(uniqueFileNames(["Appunti", "Appunti", "Appunti"]), [
    "Appunti.md",
    "Appunti 2.md",
    "Appunti 3.md",
  ]);
});

/* A comment is this archive's conversation about a passage, not part of it.
   Markdown has to leave with the words and without the thread — and, because
   the mark now sits in the schema every serializer reads, a document carrying
   one must not fail to serialize at all. */
test("a commented passage leaves as its words, without the thread", () => {
  const markdown = richTextToMarkdown({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Una frase " },
          {
            type: "text",
            text: "commentata",
            marks: [
              { type: "comment", attrs: { threadId: "11111111-2222-3333-4444-555555555555" } },
            ],
          },
          { type: "text", text: " e una no." },
        ],
      },
    ],
  });
  assert.equal(markdown.trim(), "Una frase commentata e una no.");
  /* The words, and nothing about the thread. Not `/comment/` — "commentata" is
     one of the words. */
  assert.doesNotMatch(markdown, /11111111|threadId|data-comment|<span/i);
});

/* A passage lock says who in this archive may write a sentence, which means
   nothing at all in somebody else's vault — and an account id in their file
   would be exactly the broken link `demotePrivateMedia` avoids inventing. It
   leaves as its words, and it leaves in one piece: the mark is in the schema
   every serializer reads, so a note carrying one must not fail to serialize. */
test("a locked passage leaves as its words, without the account that holds it", () => {
  const markdown = richTextToMarkdown({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Una frase " },
          {
            type: "text",
            text: "bloccata",
            marks: [
              {
                type: "writeLock",
                attrs: { owner: "99999999-8888-7777-6666-555555555555" },
              },
            ],
          },
          { type: "text", text: " e una no." },
        ],
      },
    ],
  });
  assert.equal(markdown.trim(), "Una frase bloccata e una no.");
  assert.doesNotMatch(markdown, /99999999|writeLock|data-write-lock|<span/i);
});

test("a comment survives beside a colour without swallowing it", () => {
  /* `excludes: ""` is what allows both marks on one run. If that regressed,
     one of the two would be dropped and this text would lose its emphasis. */
  const markdown = richTextToMarkdown({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "forte",
            marks: [
              { type: "bold" },
              { type: "comment", attrs: { threadId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" } },
            ],
          },
        ],
      },
    ],
  });
  assert.match(markdown, /\*\*forte\*\*/);
});

/* A note link is the one mark that keeps something of itself in Markdown, and
   for a reason the comment anchor does not have: `[[Title]]` is Obsidian's own
   syntax, so a link exported with the archive around it resolves in the vault
   it lands in. What must not leak is the id — a uuid in somebody else's file
   is the broken link `demotePrivateMedia` exists to avoid making more of. */
test("a note link leaves as [[Title]] and never as an id", () => {
  const markdown = richTextToMarkdown({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Vedi " },
          {
            type: "text",
            text: "Aforismi",
            marks: [
              { type: "noteLink", attrs: { noteId: "99999999-8888-7777-6666-555555555555" } },
            ],
          },
          { type: "text", text: " per il resto." },
        ],
      },
    ],
  });
  assert.equal(markdown.trim(), "Vedi [[Aforismi]] per il resto.");
  assert.doesNotMatch(markdown, /99999999|noteId|data-note|<a /i);
});

test("a note link survives beside emphasis without swallowing it", () => {
  const markdown = richTextToMarkdown({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Aforismi",
            marks: [
              { type: "bold" },
              { type: "noteLink", attrs: { noteId: "12121212-3434-5656-7878-909090909090" } },
            ],
          },
        ],
      },
    ],
  });
  assert.match(markdown, /\[\[/);
  assert.match(markdown, /\*\*/);
});

/* A drawing carries its own bytes, which is the whole difference between it and
   `napp-image:`: what leaves is a picture that renders in the vault it lands
   in rather than a reference only this archive can resolve. */
test("a drawing leaves as a picture, not as a reference", () => {
  const markdown = richTextToMarkdown({
    type: "doc",
    content: [
      {
        type: "drawing",
        attrs: {
          strokes: JSON.stringify([{ d: "M10,10L500,300", color: "#5B9BFF", width: 5 }]),
        },
      },
    ],
  });
  assert.match(markdown, /<svg[^>]+viewBox="0 0 1000 560"/);
  assert.match(markdown, /d="M10,10L500,300"/);
  assert.match(markdown, /stroke="#5B9BFF"/);
  assert.doesNotMatch(markdown, /napp-|strokes=/);
});

/* Strokes reach this app from the other member, from an imported file and from
   whatever was on disk, so they go into an SVG attribute only after being read
   rather than trusted. */
test("a stroke that is not a stroke is dropped rather than repaired", () => {
  /* Valid JSON carrying an invalid path: what would close the `d` attribute
     and start another one has to be refused by the reader, not by the parser
     happening to choke on it first. */
  const hostile = JSON.stringify([{ d: 'M1,1L2,2" onload="alert(1)', color: "#5B9BFF" }]);
  assert.deepEqual(drawingStrokes(hostile), []);
  assert.deepEqual(drawingStrokes('[{"d":"M1,1L2,2","color":"javascript:alert(1)"}]'), [
    { d: "M1,1L2,2", color: "#5B9BFF", width: 5 },
  ]);
  assert.deepEqual(drawingStrokes("not json"), []);
  assert.deepEqual(drawingStrokes('{"d":"M1,1"}'), []);
  assert.deepEqual(drawingStrokes(undefined), []);
  assert.deepEqual(drawingStrokes('[{"d":"M1,1L9,9","color":"#F4C550","width":5000}]'), [
    { d: "M1,1L9,9", color: "#F4C550", width: 5 },
  ]);
});

test("a writing archive's paragraph settings leave the words and nothing else", () => {
  const document = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        attrs: { textAlign: "justify", indent: 2, lineHeight: 1.5 },
        content: [
          { type: "text", text: "H" },
          { type: "text", text: "2", marks: [{ type: "subscript" }] },
          { type: "text", text: "O e x" },
          { type: "text", text: "2", marks: [{ type: "superscript" }] },
        ],
      },
      { type: "pageBreak" },
      { type: "paragraph", content: [{ type: "text", text: "Capitolo dopo." }] },
    ],
  };
  const markdown = richTextToMarkdown(document);
  assert.match(markdown, /H<sub>2<\/sub>O e x<sup>2<\/sup>/);
  assert.match(markdown, /<div data-page-break><\/div>/);
  assert.ok(!markdown.includes("justify"));
  const back = richTextToMarkdown(markdownToNote("x.md", `# T\n\n${markdown}`).content);
  assert.equal(back, markdown);
});

test("a table of contents leaves as [TOC] and comes back as the block", () => {
  const document = {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Indice:" }] },
      { type: "tableOfContents" },
      { type: "paragraph", content: [{ type: "text", text: "Dopo." }] },
    ],
  };
  const markdown = richTextToMarkdown(document);
  assert.match(markdown, /^\[TOC\]$/m);
  const note = markdownToNote("x.md", `# T\n\n${markdown}`);
  assert.ok(note.content.content?.some((node) => node.type === "tableOfContents"));
  assert.equal(richTextToMarkdown(note.content), markdown);
});

test("footnotes leave as pandoc's [^n] and come back with their words", () => {
  const document = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "L'Uno" },
          { type: "footnote", attrs: { text: "Enn. VI 9, 3.\nCfr. V 1.", id: "f1" } },
          { type: "text", text: " è oltre l'essere" },
          { type: "footnote", attrs: { text: "Resp. 509b." } },
          { type: "text", text: "." },
        ],
      },
      { type: "paragraph", content: [{ type: "text", text: "Un [^3] scritto a mano." }] },
    ],
  };
  const markdown = richTextToMarkdown(document);
  assert.match(markdown, /L'Uno\[\^1\] è oltre l'essere\[\^2\]\./);
  assert.match(markdown, /^\[\^1\]: Enn\. VI 9, 3\.\n {4}Cfr\. V 1\.$/m);
  assert.match(markdown, /^\[\^2\]: Resp\. 509b\.$/m);
  assert.ok(!markdown.includes("f1"));
  const note = markdownToNote("x.md", `# T\n\n${markdown}`);
  const notes = note.content.content?.[0]?.content?.filter((node) => node.type === "footnote");
  assert.deepEqual(
    notes?.map((node) => node.attrs?.text),
    ["Enn. VI 9, 3.\nCfr. V 1.", "Resp. 509b."],
  );
  assert.equal(richTextToMarkdown(note.content), markdown);
});

test("a caption keeps its kind and its marks through Markdown", () => {
  const document = {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Prima." }] },
      {
        type: "caption",
        attrs: { kind: "table", id: "c1" },
        content: [
          { type: "text", text: "Le tre " },
          { type: "text", text: "ipostasi", marks: [{ type: "italic" }] },
        ],
      },
    ],
  };
  const markdown = richTextToMarkdown(document);
  assert.match(markdown, /^<p data-caption="table">Le tre \*ipostasi\*<\/p>$/m);
  assert.ok(!markdown.includes("c1"));
  const back = markdownToNote("x.md", `# T\n\n${markdown}`).content;
  const caption = back.content?.find((node) => node.type === "caption");
  assert.equal(caption?.attrs?.kind, "table");
  assert.equal(richTextToMarkdown(back), markdown);
});

test("a cross-reference leaves as its words, never as its target", () => {
  const document = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Si veda la " },
          {
            type: "crossReference",
            attrs: {
              target: "h-bene",
              noteId: "n1",
              kind: "section",
              match: "Il Bene",
              label: "sezione 1.1",
            },
          },
          { type: "text", text: "." },
        ],
      },
    ],
  };
  assert.equal(richTextToMarkdown(document).trim(), "Si veda la sezione 1.1.");
  assert.equal(
    richTextToMarkdown(document, { reference: () => "sezione 2.3" }).trim(),
    "Si veda la sezione 2.3.",
  );
  assert.ok(!richTextToMarkdown(document).includes("h-bene"));
});
