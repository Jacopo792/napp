import assert from "node:assert/strict";
import test from "node:test";
import { changedSince, type RecentVersion } from "./updates.ts";

const version = (over: Partial<RecentVersion>): RecentVersion => ({
  noteId: "n",
  createdAt: "2026-10-10T10:00:00Z",
  authorIds: ["them"],
  wordsAdded: 10,
  wordsRemoved: 2,
  ...over,
});

test("a note is changed when somebody else wrote in it after you last opened it", () => {
  const floor = "2026-10-01T00:00:00Z";
  const changed = changedSince(
    [
      version({ createdAt: "2026-10-10T10:00:00Z" }),
      version({ createdAt: "2026-10-11T10:00:00Z", authorIds: ["them", "me"], wordsAdded: 5 }),
      // Your own writing is never news.
      version({ createdAt: "2026-10-12T10:00:00Z", authorIds: ["me"], wordsAdded: 99 }),
      // Read since.
      version({ noteId: "read", createdAt: "2026-10-05T10:00:00Z" }),
      // Never opened, and older than the window.
      version({ noteId: "old", createdAt: "2026-09-01T10:00:00Z" }),
    ],
    "me",
    { read: "2026-10-06T00:00:00Z" },
    floor,
  );
  assert.deepEqual([...changed.keys()], ["n"]);
  assert.deepEqual(changed.get("n"), {
    authorIds: ["them"],
    added: 15,
    removed: 4,
    last: "2026-10-11T10:00:00Z",
  });
});
