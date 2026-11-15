import assert from "node:assert/strict";
import test from "node:test";
import {
  chapterFromStorage,
  contentsOf,
  dropTarget,
  headingNumbers,
  intoPart,
  manuscriptOf,
  moveTo,
  positionBetween,
  splitManuscript,
  structureRows,
} from "./manuscript.ts";
import type { NoteEntry } from "./entries.ts";
import type { Meta } from "./types.ts";

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

test("a chapter's status, synopsis and goal are read, never trusted", () => {
  assert.deepEqual(
    chapterFromStorage({ status: "revised", synopsis: "  Lui parte. ", goal: 2999.6 }),
    {
      status: "revised",
      synopsis: "Lui parte.",
      goal: 3000,
    },
  );
  // What is not one of the three, or not usable, is dropped; nothing left is nothing.
  assert.deepEqual(chapterFromStorage({ status: "done", goal: -4, synopsis: 7 }), undefined);
  assert.equal(chapterFromStorage({ synopsis: "   " }), undefined);
  assert.equal(chapterFromStorage(null), undefined);
  assert.equal(chapterFromStorage(["final"]), undefined);
  assert.equal(chapterFromStorage({ synopsis: "x".repeat(900) })?.synopsis?.length, 600);
});

test("a drop lands after the card under the hand going down, before it going up", () => {
  const order = ["a", "b", "c"];
  assert.deepEqual(dropTarget("row:c", "a", order), { kind: "after", id: "c" });
  assert.deepEqual(dropTarget("row:a", "c", order), { kind: "before", id: "a" });
  assert.deepEqual(dropTarget("row:b", "n", order), { kind: "before", id: "b" });
  assert.equal(dropTarget("row:b", "b", order), null);
  assert.deepEqual(dropTarget("part:p1", "a", order), { kind: "part", folderId: "p1" });
  assert.deepEqual(dropTarget("notebook", "a", order), { kind: "notebook" });
  assert.equal(dropTarget(null, "a", order), null);
});

test("manuscriptOf: chapters from the owner, notebook from the viewer", () => {
  const note = (id: string, ownerId: string, body = "") =>
    ({ note: { id, title: id.toUpperCase(), body, ownerId }, version: 1 }) as NoteEntry;
  const entries = [
    note("c1", "lead", "one two three"),
    note("c2", "lead", "four"),
    note("loose", "lead"),
    note("gone", "lead"),
    note("mine", "me"),
  ];
  const metas: Record<string, Meta> = {
    lead: {
      v: 1,
      folders: [
        { id: "p1", name: "Part one" },
        { id: "sub", name: "Nested", parentId: "p1" },
      ],
      notes: [
        { id: "c1", folderId: "p1", position: 2 },
        { id: "c2", folderId: "missing", position: 1 },
        { id: "loose", folderId: null },
        { id: "gone", folderId: null, position: 3, trashedAt: "2026-11-01" },
      ],
    },
  };

  const shared = manuscriptOf(entries, metas, "lead", "me");
  assert.deepEqual(
    shared.chapters.map((c) => [c.id, c.folderId, c.movable]),
    [
      ["c2", null, true],
      ["c1", "p1", true],
    ],
  );
  assert.deepEqual(
    shared.notebook.map((c) => [c.id, c.movable]),
    [["mine", false]],
  );
  assert.equal(shared.total, 4);
  assert.deepEqual([...shared.parts], [["p1", "Part one"]], "only top-level folders are parts");
  assert.deepEqual(
    manuscriptOf(entries, metas, "lead", "lead").notebook.map((c) => c.id),
    ["loose"],
  );
});
