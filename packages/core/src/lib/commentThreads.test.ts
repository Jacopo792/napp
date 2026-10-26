import assert from "node:assert/strict";
import test from "node:test";
import {
  isForYou,
  mentionQuery,
  mentionedIn,
  notesWithOpenRemarks,
  tally,
  threadsOf,
  unreadRemarks,
  type ArchiveComment,
  type NoteComment,
} from "./commentThreads.ts";

const comment = (over: Partial<NoteComment>): NoteComment => ({
  id: "c",
  threadId: "t",
  authorId: "u",
  body: "b",
  createdAt: "2026-09-01T10:00:00Z",
  resolvedAt: null,
  mentions: [],
  assigneeId: null,
  ...over,
});

test("remarks on one passage become one conversation, oldest first", () => {
  const threads = threadsOf([
    comment({ id: "a1", threadId: "a", createdAt: "2026-09-01T10:00:00Z" }),
    comment({ id: "b1", threadId: "b", createdAt: "2026-09-01T09:00:00Z" }),
    comment({ id: "a2", threadId: "a", createdAt: "2026-09-01T11:00:00Z" }),
  ]);
  assert.deepEqual(
    threads.map((t) => t.threadId),
    ["b", "a"],
    "threads are ordered by when they were opened, not by their last reply",
  );
  assert.deepEqual(
    threads[1].comments.map((c) => c.id),
    ["a1", "a2"],
  );
});

test("a reply does not reopen a thread somebody already dealt with", () => {
  const [thread] = threadsOf([
    comment({ id: "a1", threadId: "a", resolvedAt: "2026-09-01T12:00:00Z" }),
    comment({ id: "a2", threadId: "a", createdAt: "2026-09-01T13:00:00Z" }),
  ]);
  assert.equal(thread.resolved, true);
});

test("no remarks is no conversations", () => {
  assert.deepEqual(threadsOf([]), []);
});

/* ── Remarks across the archive ─────────────────────────────────────────── */

const ME = "me";
const THEM = "them";
const remark = (over: Partial<ArchiveComment>): ArchiveComment => ({
  id: "c",
  noteId: "n1",
  threadId: "t1",
  authorId: THEM,
  body: "b",
  createdAt: "2026-09-01T10:00:00Z",
  resolvedAt: null,
  mentions: [],
  assigneeId: null,
  ...over,
});

test("a note leaves the remarks list when its last thread is dealt with", () => {
  const open = [
    remark({ id: "1", noteId: "n1", threadId: "t1" }),
    remark({ id: "2", noteId: "n2", threadId: "t2" }),
  ];
  assert.deepEqual([...notesWithOpenRemarks(open)].sort(), ["n1", "n2"]);

  const settled = [
    remark({ id: "1", noteId: "n1", threadId: "t1", resolvedAt: "2026-09-02T10:00:00Z" }),
    remark({ id: "2", noteId: "n2", threadId: "t2" }),
  ];
  assert.deepEqual([...notesWithOpenRemarks(settled)], ["n2"]);
});

/* Resolution is written to every row in a thread, but a reply that arrived
   before the resolve is still in the list — one unresolved row must not keep
   a settled conversation alive. */
test("one unresolved row does not reopen a settled thread", () => {
  const rows = [
    remark({ id: "1", threadId: "t1", resolvedAt: "2026-09-02T10:00:00Z" }),
    remark({ id: "2", threadId: "t1" }),
  ];
  assert.equal(notesWithOpenRemarks(rows).size, 0);
  assert.equal(unreadRemarks(rows, ME, {}).length, 0);
});

test("what is new is what somebody else said since you last looked", () => {
  const rows = [
    remark({ id: "mine", authorId: ME, createdAt: "2026-09-03T10:00:00Z" }),
    remark({ id: "old", createdAt: "2026-09-01T10:00:00Z" }),
    remark({ id: "new", createdAt: "2026-09-03T09:00:00Z" }),
  ];
  assert.deepEqual(
    unreadRemarks(rows, ME, { n1: "2026-09-02T00:00:00Z" }).map((r) => r.id),
    ["new"],
  );
  // A browser that has never looked has everything of theirs still to read.
  assert.deepEqual(
    unreadRemarks(rows, ME, {}).map((r) => r.id),
    ["old", "new"],
  );
});

/* The line is per note, so reading one conversation cannot mark the other
   member's remarks on every other note read along with it. */
test("having read one note's remarks leaves the others unread", () => {
  const rows = [
    remark({ id: "read", noteId: "n1", threadId: "t1" }),
    remark({ id: "unread", noteId: "n2", threadId: "t2" }),
  ];
  assert.deepEqual(
    unreadRemarks(rows, ME, { n1: "2026-09-02T00:00:00Z" }).map((r) => r.id),
    ["unread"],
  );
});

const PEOPLE = [
  { userId: "a", name: "Anna" },
  { userId: "b", name: "Anna Maria" },
  { userId: "c", name: "Bo" },
];

test("a remark names the members written after an @, as whole names", () => {
  assert.deepEqual(mentionedIn("@anna, guarda qui", PEOPLE), ["a"]);
  assert.deepEqual(mentionedIn("@Anna Maria e @Bo", PEOPLE), ["b", "c"]);
  assert.deepEqual(mentionedIn("@Anna e @Anna Maria", PEOPLE), ["a", "b"]);
  // A longer word is not the name, and an address is not a mention.
  assert.deepEqual(mentionedIn("@Annabella", PEOPLE), []);
  assert.deepEqual(mentionedIn("bo@example.com", PEOPLE), []);
});

test("the name being typed after an @ is what suggestions are filtered by", () => {
  assert.equal(mentionQuery("ciao @An", 8), "An");
  assert.equal(mentionQuery("@", 1), "");
  assert.equal(mentionQuery("mail@x", 6), null);
  assert.equal(mentionQuery("@Anna fatto", 11), null);
});

test("a thread is for you when it is handed to you or names you", () => {
  const thread = threadsOf([comment({ mentions: ["c"] })])[0];
  assert.equal(isForYou(thread, "c"), true);
  assert.equal(isForYou(thread, "a"), false);
  assert.equal(isForYou(threadsOf([comment({ assigneeId: "a" })])[0], "a"), true);
});

test("reactions are counted per emoji, in the offered order, with your own marked", () => {
  const reactions = [
    { commentId: "c", userId: "a", emoji: "✅" },
    { commentId: "c", userId: "b", emoji: "👍" },
    { commentId: "c", userId: "a", emoji: "👍" },
    { commentId: "other", userId: "a", emoji: "🎉" },
  ];
  assert.deepEqual(tally(reactions, "c", "a"), [
    { emoji: "👍", count: 2, mine: true },
    { emoji: "✅", count: 1, mine: true },
  ]);
});
