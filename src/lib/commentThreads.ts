/* The shape of a conversation, and how rows become one.
 *
 * Split from `comments.ts` for one reason: `pnpm test` runs under
 * `node --experimental-strip-types`, and anything importing `supabaseClient`
 * builds a browser client at module load. Pure logic that decides what the
 * reader sees belongs where a test can reach it. */
export interface NoteComment {
  id: string;
  threadId: string;
  authorId: string;
  body: string;
  createdAt: string;
  /** Set once somebody has dealt with the remark. The thread stays readable. */
  resolvedAt: string | null;
}

/** One passage's conversation, oldest first. */
export interface CommentThread {
  threadId: string;
  comments: NoteComment[];
  resolved: boolean;
  /** The first remark decides where the thread sits in the list. */
  createdAt: string;
}

export interface CommentRow {
  id: string;
  thread_id: string;
  author_id: string;
  body: string;
  created_at: string;
  resolved_at: string | null;
}

export const toComment = (row: CommentRow): NoteComment => ({
  id: row.id,
  threadId: row.thread_id,
  authorId: row.author_id,
  body: row.body,
  createdAt: row.created_at,
  resolvedAt: row.resolved_at,
});

/** Group the rows into conversations. A thread is resolved when its opening
 *  remark is: replying to something already dealt with should not reopen it,
 *  and `resolveThread` writes every row anyway. */
export function threadsOf(comments: NoteComment[]): CommentThread[] {
  const byThread = new Map<string, NoteComment[]>();
  for (const comment of comments) {
    const found = byThread.get(comment.threadId);
    if (found) found.push(comment);
    else byThread.set(comment.threadId, [comment]);
  }
  return [...byThread.values()]
    .map((group) => ({
      threadId: group[0].threadId,
      comments: group,
      resolved: group[0].resolvedAt !== null,
      createdAt: group[0].createdAt,
    }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** The panel in the order the note reads.
 *
 * Threads arrive grouped by when their first remark was written, which is the
 * order a chat has and not the order a document has: a note commented at the
 * top yesterday and near the end this morning listed the end first, and the
 * reader had to match each quote back to a passage by eye to know where they
 * were. `quoteOrder` is the thread ids in the order their marks appear in the
 * document — `commentQuotes()` builds it by walking the document, so it is
 * document order for free and there is nothing to keep in step.
 *
 * A thread whose passage has been deleted has no place in the text, so it
 * keeps its place in time and goes last rather than being dropped: the remarks
 * are still somebody's, and the panel already says the passage is gone.
 */
export function inDocumentOrder(
  threads: CommentThread[],
  quoteOrder: Iterable<string>,
): CommentThread[] {
  const place = new Map<string, number>();
  for (const threadId of quoteOrder) if (!place.has(threadId)) place.set(threadId, place.size);
  const at = (thread: CommentThread) => place.get(thread.threadId) ?? Number.MAX_SAFE_INTEGER;
  return [...threads].sort((a, b) => at(a) - at(b) || a.createdAt.localeCompare(b.createdAt));
}
