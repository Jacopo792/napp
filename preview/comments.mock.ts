/* Comments against an in-memory archive, so the panel can be opened, written
   in and resolved with no credentials and no network. Threads live for as long
   as the tab, like everything else in the preview. */
import type { AppSession } from "./session.mock";
import { PREVIEW_U1, PREVIEW_U2 } from "./fixture";
import type { NoteComment } from "@/lib/commentThreads";

export { threadsOf } from "@/lib/commentThreads";
export type { NoteComment, CommentThread } from "@/lib/commentThreads";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const store = new Map<string, NoteComment[]>();
let seeded = false;

/** One conversation on whichever note is opened first, so the panel has
 *  something in it the first time it is looked at. */
function seed(noteId: string): void {
  if (seeded) return;
  seeded = true;
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

export async function loadComments(
  _session: AppSession,
  noteId: string,
): Promise<NoteComment[]> {
  await sleep(120);
  seed(noteId);
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
