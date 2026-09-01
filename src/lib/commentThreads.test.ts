import assert from "node:assert/strict";
import test from "node:test";
import { threadsOf, type NoteComment } from "./commentThreads.ts";

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
