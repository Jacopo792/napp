import assert from "node:assert/strict";
import test from "node:test";
import { inDocumentOrder, threadsOf, type NoteComment } from "./commentThreads.ts";

const comment = (over: Partial<NoteComment>): NoteComment => ({
  id: "c",
  threadId: "t",
  authorId: "u",
  body: "b",
  createdAt: "2026-09-01T10:00:00Z",
  resolvedAt: null,
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

const row = (id: string, threadId: string, createdAt: string): NoteComment =>
  comment({ id, threadId, createdAt });

test("the panel reads in the order the note does, not the order the remarks arrived", () => {
  /* Two threads: the one at the top of the note was written yesterday, the one
     near the end was written this morning. By time, the end comes first. */
  const threads = threadsOf([
    row("late", "t-end", "2026-09-01T09:00:00Z"),
    row("early", "t-top", "2026-08-31T09:00:00Z"),
  ]);
  assert.deepEqual(
    threads.map((thread) => thread.threadId),
    ["t-top", "t-end"],
    "grouping still sorts by time",
  );

  const ordered = inDocumentOrder(threads, ["t-end", "t-top"]);
  assert.deepEqual(
    ordered.map((thread) => thread.threadId),
    ["t-end", "t-top"],
    "the panel did not follow the document",
  );
});

test("a thread whose passage is gone keeps its place in time, at the end", () => {
  const threads = threadsOf([
    row("a", "t-orphan", "2026-08-01T09:00:00Z"),
    row("b", "t-in-text", "2026-09-01T09:00:00Z"),
    row("c", "t-also-orphan", "2026-08-15T09:00:00Z"),
  ]);
  assert.deepEqual(
    inDocumentOrder(threads, ["t-in-text"]).map((thread) => thread.threadId),
    ["t-in-text", "t-orphan", "t-also-orphan"],
    "an anchored thread must come first, and the orphans stay in time order",
  );
});
