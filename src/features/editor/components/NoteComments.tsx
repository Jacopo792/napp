/* The conversation about a note, beside the note.
 *
 * A thread is a passage in the document plus the remarks about it. The passage
 * is a mark in the Yjs document and the remarks are rows in `note_comments`, so
 * this panel is the one place the two halves are put back together: the quote
 * comes from the live document, the words from the archive.
 *
 * It loads for itself. Comments are not part of the catalogue and must not be
 * on the way to opening a note — the panel is closed until somebody asks for
 * it, and the note is readable long before this has finished. */
import { Check, MessageSquare, RotateCcw, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/WorkspaceMenus";
import {
  addComment,
  deleteComment,
  loadComments,
  resolveThread,
  threadsOf,
  type NoteComment,
} from "@/lib/comments";
import { formatStamp } from "@/lib/format";
import type { AppSession } from "@/lib/session";

export interface CommentAuthor {
  userId: string;
  name: string;
  avatarUrl: string | null;
}

interface Props {
  session: AppSession;
  noteId: string;
  canEdit: boolean;
  /** Who the archive holds, so a remark is signed with a name and a face. */
  authors: Map<string, CommentAuthor>;
  /** The passage each thread is attached to, read from the live document. */
  quotes: Map<string, string>;
  /** A thread the bubble menu has just anchored and not yet said anything in. */
  pendingThread: string | null;
  onPendingHandled: () => void;
  onClose: () => void;
  onReveal: (threadId: string) => void;
  onRemoveAnchor: (threadId: string) => void;
}

export function NoteComments({
  session,
  noteId,
  canEdit,
  authors,
  quotes,
  pendingThread,
  onPendingHandled,
  onClose,
  onReveal,
  onRemoveAnchor,
}: Props) {
  const [comments, setComments] = useState<NoteComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState("");
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [showResolved, setShowResolved] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let live = true;
    setLoading(true);
    loadComments(session, noteId)
      .then((rows) => live && setComments(rows))
      .catch(
        (reason) =>
          live && setFailure(reason instanceof Error ? reason.message : "Could not load comments"),
      )
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [session, noteId]);

  /* A thread just anchored has no row yet, so it cannot come from the archive.
     It is shown as an empty conversation with the composer already focused —
     the passage is selected, the panel is open, and the next thing to happen
     is typing. */
  useEffect(() => {
    if (pendingThread) composerRef.current?.focus();
  }, [pendingThread]);

  const say = useCallback(
    async (threadId: string) => {
      const body = (draft[threadId] ?? "").trim();
      if (!body) return;
      try {
        const saved = await addComment(session, noteId, threadId, body);
        setComments((current) => [...current, saved]);
        setDraft((current) => ({ ...current, [threadId]: "" }));
        setFailure("");
        if (threadId === pendingThread) onPendingHandled();
      } catch (reason) {
        setFailure(reason instanceof Error ? reason.message : "Could not save that comment");
      }
    },
    [draft, session, noteId, pendingThread, onPendingHandled],
  );

  const threads = threadsOf(comments);
  const pendingIsNew = pendingThread && !threads.some((t) => t.threadId === pendingThread);
  const shown = threads.filter((thread) => showResolved || !thread.resolved);
  const resolvedCount = threads.filter((thread) => thread.resolved).length;

  async function toggleResolved(threadId: string, resolved: boolean) {
    try {
      await resolveThread(session, noteId, threadId, resolved);
      const at = resolved ? new Date().toISOString() : null;
      setComments((current) =>
        current.map((c) => (c.threadId === threadId ? { ...c, resolvedAt: at } : c)),
      );
    } catch (reason) {
      setFailure(reason instanceof Error ? reason.message : "Could not update that thread");
    }
  }

  async function remove(comment: NoteComment, lastInThread: boolean) {
    try {
      await deleteComment(session, comment.id);
      setComments((current) => current.filter((c) => c.id !== comment.id));
      /* The last remark gone means nothing is being said about that passage
         any more, so the underline goes too rather than being left behind
         pointing at a conversation that no longer exists. */
      if (lastInThread) onRemoveAnchor(comment.threadId);
    } catch (reason) {
      setFailure(reason instanceof Error ? reason.message : "Could not delete that comment");
    }
  }

  function composer(threadId: string, placeholder: string) {
    return (
      <div className="note-comment-composer">
        <textarea
          ref={threadId === pendingThread ? composerRef : undefined}
          value={draft[threadId] ?? ""}
          onChange={(event) => setDraft((c) => ({ ...c, [threadId]: event.target.value }))}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              void say(threadId);
            }
          }}
          placeholder={placeholder}
          rows={2}
          aria-label={placeholder}
        />
        <button
          type="button"
          className="note-comment-send press"
          disabled={!(draft[threadId] ?? "").trim()}
          onClick={() => void say(threadId)}
        >
          Comment
        </button>
      </div>
    );
  }

  function signature(comment: NoteComment) {
    const author = authors.get(comment.authorId);
    const name = author?.name || "Someone";
    return (
      <div className="note-comment-signature">
        <Avatar url={author?.avatarUrl ?? null} name={name} email="" compact />
        <span className="note-comment-name truncate">{name}</span>
        <span className="readout note-comment-stamp">{formatStamp(comment.createdAt)}</span>
        {comment.authorId === session.userId && (
          <button
            type="button"
            className="note-comment-action press"
            aria-label="Delete this comment"
            title="Delete this comment"
            onClick={() =>
              void remove(
                comment,
                comments.filter((c) => c.threadId === comment.threadId).length === 1,
              )
            }
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    );
  }

  return (
    <aside className="note-comments" aria-label="Comments on this note">
      <header className="note-comments-header">
        <MessageSquare size={15} />
        <span className="note-comments-title">Comments</span>
        {resolvedCount > 0 && (
          <button
            type="button"
            className="note-comment-action press note-comments-toggle"
            onClick={() => setShowResolved((open) => !open)}
          >
            {showResolved ? "Hide resolved" : `${resolvedCount} resolved`}
          </button>
        )}
        <button
          type="button"
          className="note-comment-action press"
          aria-label="Close comments"
          onClick={onClose}
        >
          <X size={15} />
        </button>
      </header>

      {failure && (
        <p role="alert" className="note-comments-failure">
          {failure}
        </p>
      )}

      <div className="note-comments-scroll">
        {pendingIsNew && (
          <article className="note-comment-thread is-pending">
            <p className="note-comment-quote">{quotes.get(pendingThread) || "This passage"}</p>
            {composer(pendingThread, "What about this passage?")}
          </article>
        )}

        {loading && <p className="note-comments-empty">Loading…</p>}

        {!loading && shown.length === 0 && !pendingIsNew && (
          <p className="note-comments-empty">
            Nothing here yet. Select a passage and use the comment button to say something about it.
          </p>
        )}

        {shown.map((thread) => (
          <article
            key={thread.threadId}
            className={`note-comment-thread ${thread.resolved ? "is-resolved" : ""}`}
          >
            <button
              type="button"
              className="note-comment-quote is-link"
              onClick={() => onReveal(thread.threadId)}
              title="Show this passage"
            >
              {quotes.get(thread.threadId) || "The passage this was about is gone"}
            </button>

            {thread.comments.map((comment) => (
              <div key={comment.id} className="note-comment">
                {signature(comment)}
                <p className="note-comment-body">{comment.body}</p>
              </div>
            ))}

            {canEdit && (
              <div className="note-comment-thread-actions">
                <button
                  type="button"
                  className="note-comment-action press"
                  onClick={() => void toggleResolved(thread.threadId, !thread.resolved)}
                >
                  {thread.resolved ? <RotateCcw size={13} /> : <Check size={13} />}
                  {thread.resolved ? "Reopen" : "Resolve"}
                </button>
              </div>
            )}

            {canEdit && !thread.resolved && composer(thread.threadId, "Reply")}
          </article>
        ))}
      </div>
    </aside>
  );
}
