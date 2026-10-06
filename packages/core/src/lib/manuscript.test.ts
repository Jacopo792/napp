import assert from "node:assert/strict";
import test from "node:test";
import {
  contentsOf,
  headingNumbers,
  intoPart,
  moveTo,
  positionBetween,
  splitManuscript,
  structureRows,
} from "./manuscript.ts";

const items = [
  { id: "intro", folderId: null, position: 1 },
  { id: "c2", folderId: "p1", position: 2 },
  { id: "loose", folderId: null },
  { id: "c3", folderId: "p1", position: 3 },
  { id: "c4", folderId: "p2", position: 4 },
];

test("chapters in order, the rest is the notebook", () => {
  const { chapters, notebook } = splitManuscript([...items].reverse());
  assert.deepEqual(
    chapters.map((c) => c.id),
    ["intro", "c2", "c3", "c4"],
  );
  assert.deepEqual(
    notebook.map((c) => c.id),
    ["loose"],
  );
});

test("a part heading wherever the run crosses into it, empty parts last", () => {
  const { chapters } = splitManuscript(items);
  const rows = structureRows(chapters, ["p1", "p2", "p3"]);
  assert.deepEqual(
    rows.map((row) => (row.kind === "part" ? `[${row.folderId}]` : `${row.number}:${row.item.id}`)),
    ["1:intro", "[p1]", "2:c2", "3:c3", "[p2]", "4:c4", "[p3]"],
  );
});

test("a move writes one position between its neighbours", () => {
  assert.equal(positionBetween(), 1);
  assert.equal(positionBetween(2, 3), 2.5);
  assert.equal(positionBetween(null, 1), 0);
  const { chapters } = splitManuscript(items);
  assert.deepEqual(moveTo(chapters, "c4", 0), { position: 0, folderId: null });
  assert.deepEqual(moveTo(chapters, "intro", 2), { position: 3.5, folderId: "p1" });
  assert.deepEqual(intoPart(chapters, "intro", "p2"), { position: 3.5, folderId: "p2" });
  assert.deepEqual(intoPart(chapters, "c2", "p3"), { position: 5, folderId: "p3" });
});

test("headings are numbered under their chapter, deeper ones reset", () => {
  assert.deepEqual(headingNumbers(2, [1, 2, 2, 1, 3, 2]), [
    "2.1",
    "2.1.1",
    "2.1.2",
    "2.2",
    "2.2.0.1",
    "2.2.1",
  ]);
  assert.deepEqual(headingNumbers(1, [3, 2]), ["1.0.1", "1.1"]);
  // A chapter divided by Title 2 is counted from Title 2.
  assert.deepEqual(headingNumbers(2, [2, 3, 2]), ["2.1", "2.1.1", "2.2"]);
});

test("the contents follow the structure, skipping empty and continued parts", () => {
  const chapters = [
    { id: "a", title: "Intro", folderId: null, position: 1 },
    { id: "b", title: "Uno", folderId: "p1", position: 2 },
  ];
  const rows = structureRows(chapters, ["p1", "p2"]);
  const contents = contentsOf(
    rows,
    new Map([
      ["p1", "Parte I"],
      ["p2", "Vuota"],
    ]),
    (id) => (id === "b" ? [{ text: "La sovrabbondanza", level: 1 }] : []),
    true,
  );
  assert.deepEqual(
    contents.map((entry) => [entry.kind, entry.title, entry.number]),
    [
      ["chapter", "Intro", 1],
      ["part", "Parte I", null],
      ["chapter", "Uno", 2],
    ],
  );
  assert.equal(contents[2].headings[0].number, "2.1");
  assert.equal(
    contentsOf(rows, new Map(), () => [{ text: "x", level: 1 }], false)[0].headings[0].number,
    null,
  );
});
