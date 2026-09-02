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

/* ── Remarks across the whole archive ────────────────────────────────────────
   The panel beside a note asks about that note. This asks the other question a
   shared archive raises: has the other member said anything, anywhere, since I
   last looked. */

/** A remark, plus the note it is on — which the per-note reader never needs
 *  and the archive-wide one cannot do without. */
export interface ArchiveComment extends NoteComment {
  noteId: string;
}

/** The notes carrying a conversation still open.
 *
 *  Resolved threads are left out on purpose: this is what is waiting, not what
 *  has ever been said. A note whose every thread is dealt with leaves the list
 *  the moment the last one is, which is what makes the list worth opening. */
export function notesWithOpenRemarks(comments: ArchiveComment[]): Set<string> {
  const resolvedThreads = new Set<string>();
  for (const comment of comments) if (comment.resolvedAt) resolvedThreads.add(comment.threadId);
  const notes = new Set<string>();
  for (const comment of comments) {
    if (!resolvedThreads.has(comment.threadId)) notes.add(comment.noteId);
  }
  return notes;
}

/** Remarks somebody else wrote since `seenAt`, in an open thread.
 *
 *  Your own are never news, and a thread already dealt with is not waiting for
 *  you. `seenAt` empty means this browser has never looked, so everything the
 *  other member has said still counts as unread — which is the right answer on
 *  a device signing in for the first time, and the reason it is a timestamp
 *  rather than a set of ids nobody would ever finish pruning. */
export function unreadRemarks(
  comments: ArchiveComment[],
  selfId: string,
  seenAt: string,
): ArchiveComment[] {
  const resolvedThreads = new Set<string>();
  for (const comment of comments) if (comment.resolvedAt) resolvedThreads.add(comment.threadId);
  return comments.filter(
    (comment) =>
      comment.authorId !== selfId &&
      !resolvedThreads.has(comment.threadId) &&
      comment.createdAt > seenAt,
  );
}
