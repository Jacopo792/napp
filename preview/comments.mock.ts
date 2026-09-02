/* Comments against an in-memory archive, so the panel can be opened, written
   in and resolved with no credentials and no network. Threads live for as long
   as the tab, like everything else in the preview. */
import type { AppSession } from "./session.mock";
import { FIXTURE_NOTES, PREVIEW_U1, PREVIEW_U2 } from "./fixture";
import type { ArchiveComment, NoteComment } from "@/lib/commentThreads";

export { notesWithOpenRemarks, threadsOf, unreadRemarks } from "@/lib/commentThreads";
export type { ArchiveComment, NoteComment, CommentThread } from "@/lib/commentThreads";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const store = new Map<string, NoteComment[]>();

/** One conversation, on the first note in the fixture and there from the
 *  start — so both readers of this store have something to show: the panel
 *  beside that note, and the archive-wide count in the rail. */
function seed(noteId: string): void {
  if (store.has(noteId)) return;
  const threadId = "seed-thread-0000-0000-000000000000";
  store.set(noteId, [
    {
      id: "seed-1",
      threadId,
      authorId: PREVIEW_U2,
      body: "Questo passaggio mi convince poco — lo rivediamo?",
      createdAt: new Date(Date.now() - 3_600_000).toISOString(),
      resolvedAt: null,
    },
    {
      id: "seed-2",
      threadId,
      authorId: PREVIEW_U1,
      body: "D'accordo. Provo a riscriverlo più corto.",
      createdAt: new Date(Date.now() - 1_800_000).toISOString(),
      resolvedAt: null,
    },
  ]);
}

seed(FIXTURE_NOTES[0].id);

export async function loadComments(
  _session: AppSession,
  noteId: string,
): Promise<NoteComment[]> {
  await sleep(120);
  return [...(store.get(noteId) ?? [])];
}

export async function addComment(
  session: AppSession,
  noteId: string,
  threadId: string,
  body: string,
): Promise<NoteComment> {
  await sleep(140);
  const saved: NoteComment = {
    id: crypto.randomUUID(),
    threadId,
    authorId: session.userId,
    body: body.trim(),
    createdAt: new Date().toISOString(),
    resolvedAt: null,
  };
  store.set(noteId, [...(store.get(noteId) ?? []), saved]);
  return saved;
}

export async function resolveThread(
  _session: AppSession,
  noteId: string,
  threadId: string,
  resolved: boolean,
): Promise<void> {
  await sleep(100);
  const at = resolved ? new Date().toISOString() : null;
  store.set(
    noteId,
    (store.get(noteId) ?? []).map((c) => (c.threadId === threadId ? { ...c, resolvedAt: at } : c)),
  );
}

export async function deleteComment(_session: AppSession, commentId: string): Promise<void> {
  await sleep(100);
  for (const [noteId, rows] of store)
    store.set(
      noteId,
      rows.filter((c) => c.id !== commentId),
    );
}

export async function updateComment(
  session: AppSession,
  commentId: string,
  body: string,
): Promise<NoteComment> {
  await sleep(100);
  for (const [noteId, rows] of store) {
    const found = rows.find(
      (comment) => comment.id === commentId && comment.authorId === session.userId,
    );
    if (!found) continue;
    const saved = { ...found, body: body.trim() };
    store.set(
      noteId,
      rows.map((comment) => (comment.id === commentId ? saved : comment)),
    );
    return saved;
  }
  throw new Error("Only the author may edit this comment");
}

/** The archive-wide read, from the same in-memory store. The seed lands on
 *  whichever note is opened first, so this is empty until one has been. */
export async function loadArchiveComments(_session: AppSession): Promise<ArchiveComment[]> {
  await sleep(90);
  return [...store].flatMap(([noteId, rows]) => rows.map((row) => ({ ...row, noteId })));
}
