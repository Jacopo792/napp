import assert from "node:assert/strict";
import test from "node:test";
import type { Note } from "./types.ts";
import { mergeRemoteEntries, type NoteEntry } from "./entries.ts";

const entry = (id: string, version: number, updatedAt: string, title = id): NoteEntry => ({
  note: { id, title, updatedAt } as Note,
  version,
});
const ids = (entries: NoteEntry[]) => entries.map((e) => `${e.note.id}@${e.version}`);

test("remote entries replace clean local ones, newest first", () => {
  const { entries, changed } = mergeRemoteEntries(
    [entry("a", 1, "2026-01-01"), entry("b", 1, "2026-01-02")],
    [entry("a", 2, "2026-01-03"), entry("b", 1, "2026-01-02")],
    () => false,
  );
  assert.deepEqual(ids(entries), ["a@2", "b@1"]);
  assert.deepEqual([...changed], ["a"]);
});

test("a note with unsaved changes keeps the local entry", () => {
  const { entries, changed } = mergeRemoteEntries(
    [entry("a", 1, "2026-01-01", "mine")],
    [entry("a", 2, "2026-01-03", "theirs")],
    (id) => id === "a",
  );
  assert.equal(entries[0].note.title, "mine");
  assert.deepEqual([...changed], ["a"]);
});

test("an unsaved note the snapshot lacks stays; a clean one goes", () => {
  const { entries } = mergeRemoteEntries(
    [entry("new", 0, "2026-01-05"), entry("gone", 1, "2026-01-04")],
    [entry("a", 1, "2026-01-01")],
    (id) => id === "new",
  );
  assert.deepEqual(ids(entries), ["new@0", "a@1"]);
});

test("a note arriving for the first time counts as changed", () => {
  const { changed } = mergeRemoteEntries([], [entry("a", 1, "2026-01-01")], () => false);
  assert.deepEqual([...changed], ["a"]);
});
