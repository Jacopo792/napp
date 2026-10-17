import assert from "node:assert/strict";
import { test } from "node:test";
import { ALL, ARCHIVE, entriesInScope, REMARKS, TRASH, UNFILED } from "./scopes.ts";
import type { NoteEntry } from "./entries.ts";
import type { Meta } from "./types.ts";

const entry = (id: string) => ({ note: { id }, version: 1 }) as unknown as NoteEntry;
const entries = ["filed", "loose", "shelved", "binned", "both"].map(entry);
const meta: Meta = {
  v: 1,
  folders: [{ id: "f", name: "F" }],
  notes: [
    { id: "filed", folderId: "f" },
    { id: "loose", folderId: "gone" },
    { id: "shelved", folderId: null, archivedAt: "a" },
    { id: "binned", folderId: null, trashedAt: "t" },
    { id: "both", folderId: null, archivedAt: "a", trashedAt: "t" },
  ],
};
const ids = (scope: string, remarked?: Set<string>) =>
  entriesInScope(entries, meta, scope, remarked).map((e) => e.note.id);

test("each scope holds what the web's list always showed in it", () => {
  assert.deepEqual(ids(ALL), ["filed", "loose"]);
  assert.deepEqual(ids("f"), ["filed"]);
  assert.deepEqual(ids(UNFILED), ["loose"]);
  assert.deepEqual(ids(ARCHIVE), ["shelved"]);
  assert.deepEqual(ids(TRASH), ["binned", "both"]);
  assert.deepEqual(ids(REMARKS, new Set(["filed", "binned"])), ["filed"]);
});
