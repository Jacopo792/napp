import assert from "node:assert/strict";
import test from "node:test";

import { richTextToMarkdown } from "./content.ts";
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
