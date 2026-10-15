import assert from "node:assert/strict";
import test from "node:test";
import { captureNote } from "./capture.ts";

test("a shared page keeps its title, its words and its address", () => {
  const note = captureNote({
    title: "Chaebol",
    text: "Una struttura ad anello.\n\nNiente di più.",
    url: "https://example.com/a",
  });
  assert.equal(note.title, "Chaebol");
  assert.equal(note.content.content.length, 3);
  assert.deepEqual(note.content.content[2], {
    type: "paragraph",
    content: [
      {
        type: "text",
        text: "https://example.com/a",
        marks: [{ type: "link", attrs: { href: "https://example.com/a" } }],
      },
    ],
  });
});

test("shared words with no title are titled by their first line", () => {
  const note = captureNote({ title: "", text: "Idea\nseconda riga", url: "" });
  assert.equal(note.title, "Idea");
  assert.equal(note.content.content.length, 1);
});

test("an address already in the words is not repeated, and nothing is still a note", () => {
  const note = captureNote({ title: "", text: "vedi https://x.it", url: "https://x.it" });
  assert.equal(note.content.content.length, 1);
  assert.equal(captureNote({ title: "", text: "", url: "" }).title, "Shared");
});
