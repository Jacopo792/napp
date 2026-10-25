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
  /** The members this remark names with @ — who it is said to. */
  mentions: string[];
  /** Whose job the thread is. Carried on every row, read off the first. */
  assigneeId: string | null;
}

/** Somebody answering a remark without words. */
export interface Reaction {
  commentId: string;
  userId: string;
  emoji: string;
}

/** The six a reaction can be. A fixed handful, the way Slack and Notion open
 *  with one: a remark is answered at a glance, and a picker of every emoji is
 *  a search nobody wanted to run to say "yes". */
export const REACTIONS = ["👍", "❤️", "😄", "🎉", "👀", "✅"] as const;

/** One passage's conversation, oldest first. */
export interface CommentThread {
  threadId: string;
  comments: NoteComment[];
  resolved: boolean;
  /** The first remark decides where the thread sits in the list. */
  createdAt: string;
  assigneeId: string | null;
}

export interface CommentRow {
  id: string;
  thread_id: string;
  author_id: string;
  body: string;
  created_at: string;
  resolved_at: string | null;
  mentions?: string[] | null;
  assignee_id?: string | null;
}

export const toComment = (row: CommentRow): NoteComment => ({
  id: row.id,
  threadId: row.thread_id,
  authorId: row.author_id,
  body: row.body,
  createdAt: row.created_at,
  resolvedAt: row.resolved_at,
  mentions: row.mentions ?? [],
  assigneeId: row.assignee_id ?? null,
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
      assigneeId: group[0].assigneeId,
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

/** The last thing said in a thread still open, per note — what the
 *  Comments scope shows in a row, as the phone's tab does: whoever spoke
 *  last, their words, and when. */
export function lastOpenRemarks(comments: ArchiveComment[]): Map<string, ArchiveComment> {
  const resolvedThreads = new Set<string>();
  for (const comment of comments) if (comment.resolvedAt) resolvedThreads.add(comment.threadId);
  const last = new Map<string, ArchiveComment>();
  for (const comment of comments) {
    if (resolvedThreads.has(comment.threadId)) continue;
    const before = last.get(comment.noteId);
    if (!before || before.createdAt < comment.createdAt) last.set(comment.noteId, comment);
  }
  return last;
}

/** When this browser last read each note's remarks, keyed by note. */
export type RemarksSeen = Record<string, string>;

/** Remarks somebody else wrote since this browser last opened their note, in
 *  an open thread.
 *
 *  Your own are never news, and a thread already dealt with is not waiting for
 *  you. The line is drawn per note rather than across the archive because that
 *  is the granularity of having read one: opening a note is the act, and a
 *  single archive-wide line meant reading one conversation marked every other
 *  member's remark read along with it — or, when nothing moved the line, meant
 *  a badge that stayed up after you had read the only thing under it.
 *
 *  A note with no line has never been looked at on this device, so everything
 *  the other member said on it is still unread — the right answer for a device
 *  signing in for the first time, and the reason these are timestamps rather
 *  than a set of ids nobody would ever finish pruning. */
export function unreadRemarks(
  comments: ArchiveComment[],
  selfId: string,
  seen: RemarksSeen,
): ArchiveComment[] {
  const resolvedThreads = new Set<string>();
  for (const comment of comments) if (comment.resolvedAt) resolvedThreads.add(comment.threadId);
  return comments.filter(
    (comment) =>
      comment.authorId !== selfId &&
      !resolvedThreads.has(comment.threadId) &&
      comment.createdAt > (seen[comment.noteId] ?? ""),
  );
}

/* ── Addressing a remark ───────────────────────────────────────────────────── */

/** Who a remark names: every member whose name follows an @ in it, as a
 *  whole word. Read off the words when the remark is sent rather than kept
 *  beside them while typing, so a name deleted from the draft is not named. */
export function mentionedIn(body: string, members: { userId: string; name: string }[]): string[] {
  const folded = body.toLocaleLowerCase();
  /* Longest names first, and an @ taken by one is not read again: "@Anna
     Maria" names Anna Maria, not Anna as well. */
  const taken = new Set<number>();
  const named = new Set<string>();
  const longestFirst = [...members].sort((a, b) => b.name.length - a.name.length);
  for (const { userId, name } of longestFirst) {
    const wanted = `@${name.trim().toLocaleLowerCase()}`;
    if (wanted.length < 2) continue;
    for (let at = folded.indexOf(wanted); at >= 0; at = folded.indexOf(wanted, at + 1)) {
      const next = folded[at + wanted.length];
      if (taken.has(at) || (next !== undefined && /[\p{L}\p{N}]/u.test(next))) continue;
      taken.add(at);
      named.add(userId);
    }
  }
  return members.filter(({ userId }) => named.has(userId)).map(({ userId }) => userId);
}

/** The name being typed after an @ at the caret, or null — what the
 *  composer's suggestions are filtered by. */
export function mentionQuery(text: string, caret: number): string | null {
  const match = /(?:^|\s)@([\p{L}\p{N}._-]*)$/u.exec(text.slice(0, caret));
  return match ? match[1] : null;
}

/** A thread that wants this reader: handed to them, or naming them. */
export function isForYou(thread: CommentThread, selfId: string): boolean {
  return (
    thread.assigneeId === selfId ||
    thread.comments.some((comment) => comment.mentions.includes(selfId))
  );
}

/** A remark's reactions, one entry per emoji in `REACTIONS` order, then any
 *  other in the order first given. */
export function tally(
  reactions: Reaction[],
  commentId: string,
  selfId: string,
): { emoji: string; count: number; mine: boolean }[] {
  const byEmoji = new Map<string, { count: number; mine: boolean }>();
  for (const reaction of reactions) {
    if (reaction.commentId !== commentId) continue;
    const found = byEmoji.get(reaction.emoji) ?? { count: 0, mine: false };
    found.count += 1;
    found.mine ||= reaction.userId === selfId;
    byEmoji.set(reaction.emoji, found);
  }
  const rank = (emoji: string) => {
    const at = (REACTIONS as readonly string[]).indexOf(emoji);
    return at < 0 ? REACTIONS.length : at;
  };
  return [...byEmoji.entries()]
    .map(([emoji, found]) => ({ emoji, ...found }))
    .sort((a, b) => rank(a.emoji) - rank(b.emoji));
}
