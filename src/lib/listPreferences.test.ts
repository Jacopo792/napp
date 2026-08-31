import assert from "node:assert/strict";
import test from "node:test";
import type { NoteEntry } from "./entries.ts";
import {
  DEFAULT_LIST_PREFERENCES,
  dateBucket,
  groupEntries,
  parseListPreferences,
  rememberRecent,
} from "./listPreferences.ts";

function entry(id: string, updatedAt: string, createdAt = updatedAt, title = id): NoteEntry {
  return {
    version: 1,
    note: {
      id,
      ownerId: "member-1",
      title,
      body: "",
      content: { type: "doc", content: [{ type: "paragraph" }] },
      contentVersion: 1,
      legacyBody: null,
      pageIcon: null,
      cover: null,
      createdAt,
      updatedAt,
    },
  };
}

test("corrupt preferences fall back to defaults", () => {
  assert.deepEqual(parseListPreferences("not-json", "u1").defaults, DEFAULT_LIST_PREFERENCES);
  assert.equal(parseListPreferences('{"v":2}', "u1").v, 1);
});

test("recent notes are unique and capped at eight", () => {
  let preferences = parseListPreferences(null, "u1");
  for (let index = 0; index < 10; index++) preferences = rememberRecent(preferences, String(index));
  preferences = rememberRecent(preferences, "4");
  assert.deepEqual(preferences.recentNoteIds, ["4", "9", "8", "7", "6", "5", "3", "2"]);
});

test("pinned notes remain a separate group", () => {
  const groups = groupEntries(
    [entry("old", "2026-01-01T10:00:00Z"), entry("pin", "2025-01-01T10:00:00Z")],
    new Set(["pin"]),
    DEFAULT_LIST_PREFERENCES,
    new Date("2026-08-28T12:00:00Z"),
  );
  assert.equal(groups[0]?.label, "Pinned");
  assert.equal(groups[0]?.entries[0]?.note.id, "pin");
});

test("date buckets use the requested calendar bands", () => {
  const now = new Date("2026-08-28T12:00:00");
  assert.equal(dateBucket("2026-08-28T08:00:00", now).label, "Today");
  assert.equal(dateBucket("2026-08-27T08:00:00", now).label, "Yesterday");
  assert.equal(dateBucket("2026-08-24T08:00:00", now).label, "Previous 7 Days");
  assert.equal(dateBucket("2026-08-10T08:00:00", now).label, "Previous 30 Days");
  assert.equal(dateBucket("2026-05-10T08:00:00", now).label, "May");
  assert.equal(dateBucket("2025-05-10T08:00:00", now).label, "2025");
});
