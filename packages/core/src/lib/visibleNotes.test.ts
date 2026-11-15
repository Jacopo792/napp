import assert from "node:assert/strict";
import test from "node:test";
import type { NoteEntry } from "./entries.ts";
import { ALL, ARCHIVE, REMARKS, TRASH, UNFILED } from "./scopes.ts";
import type { Meta, Note } from "./types.ts";
import { visibleEntries, type Slice } from "./visibleNotes.ts";

const entry = (id: string, title = id, body = ""): NoteEntry => ({
  note: { id, title, body, ownerId: "me" } as Note,
  version: 1,
});
const owned = [
  entry("a", "Café notes"),
  entry("b", "Shopping", "milk"),
  entry("c"),
  entry("d"),
  entry("e"),
];
const meta: Meta = {
  v: 1,
  folders: [{ id: "f1", name: "Work" }],
  notes: [
    { id: "a", folderId: "f1" },
    { id: "b", folderId: null },
    { id: "c", folderId: "gone" },
    { id: "d", folderId: null, trashedAt: "2026-11-01" },
    { id: "e", folderId: "f1", archivedAt: "2026-11-01" },
  ],
};
const slice = (over: Partial<Slice> = {}): Slice => ({
  meta,
  scope: ALL,
  query: "",
  trashedIds: new Set(["d"]),
  archivedIds: new Set(["e"]),
  remarkedIds: new Set(["a", "d"]),
  mediaHaystacks: new Map([["c", "receipt total"]]),
  ...over,
});
const ids = (over?: Partial<Slice>) => visibleEntries(owned, slice(over)).map((e) => e.note.id);

test("all notes leaves out the trash and the shelf", () => {
  assert.deepEqual(ids(), ["a", "b", "c"]);
});

test("each special scope shows only its own notes", () => {
  assert.deepEqual(ids({ scope: TRASH }), ["d"]);
  assert.deepEqual(ids({ scope: ARCHIVE }), ["e"]);
  assert.deepEqual(ids({ scope: REMARKS }), ["a"], "a trashed note is nobody's to discuss");
});

test("a folder, and a missing folder counts as none", () => {
  assert.deepEqual(ids({ scope: "f1" }), ["a"]);
  assert.deepEqual(ids({ scope: UNFILED }), ["b", "c"]);
});

test("search is folded and reads text found in media", () => {
  assert.deepEqual(ids({ query: "  CAFE " }), ["a"]);
  assert.deepEqual(ids({ query: "milk" }), ["b"]);
  assert.deepEqual(ids({ query: "receipt" }), ["c"]);
  assert.deepEqual(ids({ query: "receipt", scope: "f1" }), []);
});
