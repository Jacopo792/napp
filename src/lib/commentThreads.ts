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
