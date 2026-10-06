import assert from "node:assert/strict";
import test from "node:test";
import {
  adoptionsFor,
  countTargets,
  referenceText,
  resolveReference,
  sheetCounters,
  targetsOf,
  type ReferenceChapter,
} from "./references.ts";

const paragraph = (...content: object[]) => ({ type: "paragraph", content });
const text = (value: string) => ({ type: "text", text: value });
const heading = (level: number, value: string, anchor?: string) => ({
  type: "heading",
  attrs: { level, ...(anchor ? { anchor } : {}) },
  content: [text(value)],
});
const footnote = (value: string, id?: string) => ({
  type: "footnote",
  attrs: { text: value, ...(id ? { id } : {}) },
});
const caption = (kind: string, value: string, id?: string) => ({
  type: "caption",
  attrs: { kind, ...(id ? { id } : {}) },
  content: [text(value)],
});
const doc = (...content: object[]) => ({ type: "doc", content });

const one = doc(
  heading(2, "Il Bene", "h-bene"),
  paragraph(text("Uno"), footnote("Enn. VI 9", "f1"), text(" due"), footnote("Cfr.")),
  caption("figure", "Lo schema", "c1"),
  heading(3, "La materia"),
  caption("table", "Le ipostasi"),
);
const two = doc(
  heading(2, "L'Intelletto"),
  paragraph(footnote("Plot. V 1"), {
    type: "crossReference",
    attrs: { target: "h-bene", noteId: "one", kind: "section", match: "Il Bene" },
  }),
  caption("figure", "La processione", "c2"),
);

const chapters: ReferenceChapter[] = [
  { id: "one", title: "Uno", number: 1, targets: targetsOf(one) },
  { id: "two", title: "Due", number: 2, targets: targetsOf(two) },
];

test("a chapter's targets are read in document order", () => {
  const { targets, references } = targetsOf(one);
  assert.deepEqual(
    targets.map((target) => [target.kind, target.id, target.text]),
    [
      ["section", "h-bene", "Il Bene"],
      ["footnote", "f1", "Enn. VI 9"],
      ["footnote", null, "Cfr."],
      ["figure", "c1", "Lo schema"],
      ["section", null, "La materia"],
      ["table", null, "Le ipostasi"],
    ],
  );
  assert.equal(references.length, 0);
  assert.equal(targetsOf(two).references[0].target, "h-bene");
});

test("numbered: captions by chapter, footnotes again in each chapter", () => {
  const counted = countTargets(chapters, { numbered: true, footnotes: "chapter" });
  const numbers = (id: string) =>
    counted.get(id)!.targets.map((target) => `${target.kind} ${target.number}`);
  assert.deepEqual(numbers("one"), [
    "section 1.1",
    "footnote 1",
    "footnote 2",
    "figure 1.1",
    "section 1.1.1",
    "table 1.1",
  ]);
  assert.deepEqual(numbers("two"), ["section 2.1", "footnote 1", "figure 2.1"]);
  assert.deepEqual(sheetCounters(counted, "two"), { footnote: 0, figure: 0, table: 0 });
});

test("unnumbered: captions and continuous footnotes run through the document", () => {
  const counted = countTargets(chapters, { numbered: false, footnotes: "document" });
  const two = counted.get("two")!.targets;
  assert.deepEqual(
    two.map((target) => target.number),
    [null, "3", "2"],
  );
  assert.deepEqual(sheetCounters(counted, "two"), { footnote: 2, figure: 1, table: 1 });
});

test("a notebook page counts on its own", () => {
  const counted = countTargets(
    [...chapters, { id: "loose", title: "Appunti", number: null, targets: targetsOf(two) }],
    { numbered: true, footnotes: "document" },
  );
  assert.deepEqual(sheetCounters(counted, "loose"), { footnote: 0, figure: 0, table: 0 });
  assert.equal(counted.get("loose")!.targets[2].number, "1");
});

test("a reference says what it points at, and where when it must", () => {
  const counted = countTargets(chapters, { numbered: true, footnotes: "chapter" });
  const it = { footnotes: "chapter", language: "it" } as const;
  const note = counted.get("one")!.targets[1];
  assert.equal(referenceText(note, "one", it), "nota 1");
  assert.equal(referenceText(note, "two", it), "nota 1 del cap. 1");
  assert.equal(referenceText(counted.get("two")!.targets[2], "one", it), "Figura 2.1");
  assert.equal(referenceText(counted.get("one")!.targets[0], "two", it), "sezione 1.1");
  const plain = countTargets(chapters, { numbered: false, footnotes: "document" });
  assert.equal(
    referenceText(plain.get("one")!.targets[0], "two", { footnotes: "document", language: "en" }),
    "“Il Bene”",
  );
  assert.equal(
    referenceText(plain.get("one")!.targets[1], "two", { footnotes: "document", language: "en" }),
    "note 1",
  );
});

test("a reference finds its target by id, anywhere, then by its words", () => {
  const counted = countTargets(chapters, { numbered: true, footnotes: "chapter" });
  assert.equal(
    resolveReference(counted, { target: "c2", noteId: "one", kind: "figure", match: "" })?.noteId,
    "two",
  );
  assert.equal(
    resolveReference(counted, {
      target: "new",
      noteId: "one",
      kind: "section",
      match: "La materia",
    })?.number,
    "1.1.1",
  );
  assert.equal(
    resolveReference(counted, { target: "gone", noteId: "one", kind: "section", match: "Altro" }),
    null,
  );
});

test("a heading cited by its words is owed the id, once, by its own chapter", () => {
  const three = doc(
    paragraph({
      type: "crossReference",
      attrs: { target: "h-materia", noteId: "one", kind: "section", match: "La materia" },
    }),
  );
  const all = [...chapters, { id: "three", title: "Tre", number: 3, targets: targetsOf(three) }];
  const counted = countTargets(all, { numbered: true, footnotes: "chapter" });
  assert.deepEqual(adoptionsFor(all, counted, "one"), [
    { kind: "section", match: "La materia", id: "h-materia" },
  ]);
  assert.deepEqual(adoptionsFor(all, counted, "two"), []);
});
