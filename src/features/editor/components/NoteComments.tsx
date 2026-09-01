/* The conversation about a note.
 *
 * A thread is a passage in the document plus the remarks about it. The passage
 * is a mark in the Yjs document and the remarks are rows in `note_comments`, so
 * this panel is the one place the two halves are put back together: the quote
 * comes from the live document, the words from the archive.
 *
 * ── A column that starts at the top ─────────────────────────────────────────
 * The cards were briefly pinned to the exact height of their passages, and it
 * was wrong for a reason that only shows once you use it: a card level with its
 * passage is off screen whenever the passage is, so opening the panel on a note
 * you are reading from the top showed an empty column, and a thread on a
 * passage near the foot of the pane was cut off by the panel's bottom edge with
 * nothing to scroll — the column had no scrolling of its own, by construction.
 * Every position in it was decided by where the document happened to be.
 *
 * So the column starts at the top and grows downward, in the order the passages
 * appear in the note. The first thread is always the first thing you see, the
 * panel scrolls like a panel, and `scrollIntoView` works because there is
 * something to scroll.
 *
 * What that costs is the eye-line between a card and its passage, and that is
 * paid back a different way: the open card lights its own passage in the text,
 * and clicking a passage opens and scrolls to its card. The link is stated
 * rather than implied by alignment, and unlike alignment it survives the
 * passage being off screen.
 *
 * It loads for itself. Comments are not part of the catalogue and must not be
 * on the way to opening a note — the panel is closed until somebody asks for
 * it, and the note is readable long before this has finished. */
import { Check, ChevronDown, MessageSquare, Pencil, RotateCcw, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/WorkspaceMenus";
import {
  addComment,
  deleteComment,
  loadComments,
  resolveThread,
  threadsOf,
  type NoteComment,
  updateComment,
} from "@/lib/comments";
import type { CommentThread } from "@/lib/commentThreads";
import { collaborationColor } from "@/features/editor/lib/ydoc";
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
  /** A thread arrived at by clicking its passage in the note. */
  focusThread: string | null;
  onFocusHandled: () => void;
  onClose: () => void;
  onReveal: (threadId: string) => void;
  onRemoveAnchor: (threadId: string) => void;
  onResolveAnchor: (threadId: string, resolved: boolean) => void;
}

/** A thread longer than this is folded in the middle. Somebody arriving at a
 *  conversation wants how it opened and how it stands, not the middle of it. */
const REPLIES_SHOWN = 2;

export function NoteComments({
  session,
  noteId,
  canEdit,
  authors,
  quotes,
  pendingThread,
  onPendingHandled,
  focusThread,
  onFocusHandled,
  onClose,
  onReveal,
  onRemoveAnchor,
  onResolveAnchor,
}: Props) {
  const [comments, setComments] = useState<NoteComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState("");
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [showResolved, setShowResolved] = useState(false);
  /** Which thread the reader is in. Drives the accent on the card, the
   *  underline in the text, and whether the composer is more than a line. */
  const [active, setActive] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const threadRefs = useRef(new Map<string, HTMLElement>());

  useEffect(() => {
    let live = true;
    setLoading(true);
    loadComments(session, noteId)
      .then((rows) => {
        if (!live) return;
        setComments(rows);
        /* Older anchors predate the resolved attribute. Bring them in step
           with the database once the comments are deliberately opened. */
        for (const thread of threadsOf(rows)) {
          onResolveAnchor(thread.threadId, thread.resolved);
        }
      })
      .catch(
        (reason) =>
          live && setFailure(reason instanceof Error ? reason.message : "Could not load comments"),
      )
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [session, noteId, onResolveAnchor]);

  /* A thread just anchored has no row yet, so it cannot come from the archive.
     It is shown as an empty conversation with the composer already focused —
     the passage is selected, the panel is open, and the next thing to happen
     is typing. */
  useEffect(() => {
    if (pendingThread) {
      setActive(pendingThread);
      composerRef.current?.focus();
    }
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

  /* Oldest first, so the column is a log: the thread you opened first stays at
     the top and each new one is added underneath. `threadsOf` already sorts
     that way.

     Not document order, which this briefly was. Ordering by where the passage
     sits reads well until you go back and remark on something earlier — and
     then the remark you just made appears *above* the one before it, in a
     column you were watching grow downward. A conversation is a sequence of
     things said, and the panel is read as one. */
  const threads = useMemo(() => threadsOf(comments), [comments]);
  const pendingIsNew = pendingThread && !threads.some((t) => t.threadId === pendingThread);
  const shown = threads.filter((thread) => showResolved || !thread.resolved);
  const resolvedCount = threads.filter((thread) => thread.resolved).length;

  /* Arriving from the passage. The thread may be hidden — a resolved one is
     filtered out — so unhide first, or clicking its underline opens a panel
     with nothing in it and looks broken. */
  useEffect(() => {
    if (!focusThread) return;
    const isResolved = comments.some(
      (comment) => comment.threadId === focusThread && comment.resolvedAt,
    );
    if (isResolved && !showResolved) {
      setShowResolved(true);
      return;
    }
    setActive(focusThread);
    const row = threadRefs.current.get(focusThread);
    if (!row) return;
    row.scrollIntoView({ block: "nearest", behavior: "smooth" });
    row.classList.add("is-arrived");
    const timer = window.setTimeout(() => row.classList.remove("is-arrived"), 1400);
    onFocusHandled();
    return () => window.clearTimeout(timer);
  }, [focusThread, comments, loading, showResolved, onFocusHandled]);

  async function toggleResolved(threadId: string, resolved: boolean) {
    try {
      await resolveThread(session, noteId, threadId, resolved);
      const at = resolved ? new Date().toISOString() : null;
      setComments((current) =>
        current.map((c) => (c.threadId === threadId ? { ...c, resolvedAt: at } : c)),
      );
      onResolveAnchor(threadId, resolved);
      setActive(null);
    } catch (reason) {
      setFailure(reason instanceof Error ? reason.message : "Could not update that thread");
    }
  }

  async function saveEdit(comment: NoteComment) {
    const body = editDraft.trim();
    if (!body) return;
    try {
      const saved = await updateComment(session, comment.id, body);
      setComments((current) =>
        current.map((candidate) => (candidate.id === comment.id ? saved : candidate)),
      );
      setEditing(null);
      setEditDraft("");
      setFailure("");
    } catch (reason) {
      setFailure(reason instanceof Error ? reason.message : "Could not edit that comment");
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

  function composer(threadId: string, placeholder: string, open: boolean) {
    return (
      <div
        className={`note-comment-composer ${open ? "is-open" : ""}`}
        onClick={(event) => event.stopPropagation()}
      >
        <textarea
          ref={threadId === pendingThread ? composerRef : undefined}
          value={draft[threadId] ?? ""}
          onChange={(event) => setDraft((c) => ({ ...c, [threadId]: event.target.value }))}
          onFocus={() => setActive(threadId)}
          onKeyDown={(event) => {
            /* Enter sends. A remark is a line or two said to one other person,
               so the common case is the one that should cost one key — ⌘↵ made
               the short reply the awkward one. Shift+Enter is the way to a new
               line, and ⌘↵ still works for the hands that already learnt it.

               `isComposing` is the guard that matters: while an input method
               is mid-word, Enter is how the *word* is accepted, and sending
               there would post a half-typed one. */
            if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
            if (event.shiftKey) return;
            event.preventDefault();
            void say(threadId);
          }}
          placeholder={placeholder}
          rows={open ? 2 : 1}
          aria-label={placeholder}
        />
        {open && (
          <div className="note-comment-composer-actions">
            <kbd className="readout" title="Shift + Enter for a new line">
              ⇧↵
            </kbd>
            <button
              type="button"
              className="note-comment-send press"
              disabled={!(draft[threadId] ?? "").trim()}
              onClick={() => void say(threadId)}
            >
              {threadId === pendingThread ? "Comment" : "Reply"}
            </button>
          </div>
        )}
      </div>
    );
  }

  /** One remark. `head` is the one that opened the thread — full weight, its
   *  own line for the name. A reply is quieter and sits under the rail, so the
   *  shape of the card says which is which before a word is read. */
  function remark(comment: NoteComment, head: boolean, onlyOne: boolean) {
    const author = authors.get(comment.authorId);
    const name = author?.name || "Someone";
    const mine = comment.authorId === session.userId;
    /* The same colour this person's caret has in the text. Two people writing
       to each other need to be told apart at a glance and one grey name above
       another does not do it — but a second colour system would be worse than
       none, so this is the one the note already uses. */
    const colour = collaborationColor(comment.authorId);
    return (
      <div
        key={comment.id}
        className={`note-comment ${head ? "is-head" : "is-reply"} ${mine ? "is-mine" : ""}`}
        style={{ "--author": colour } as React.CSSProperties}
      >
        <Avatar url={author?.avatarUrl ?? null} name={name} email="" compact />
        <div className="note-comment-said">
          <p className="note-comment-signature">
            <span className="note-comment-name truncate">{name}</span>
            {mine && <span className="note-comment-you">you</span>}
            <span className="readout note-comment-stamp">{formatStamp(comment.createdAt)}</span>
            {mine && (
              <span className="note-comment-own-actions">
                <button
                  type="button"
                  className="note-comment-action is-quiet press"
                  aria-label={head ? "Edit this comment" : "Edit this reply"}
                  title={head ? "Edit this comment" : "Edit this reply"}
                  onClick={(event) => {
                    event.stopPropagation();
                    setEditing(comment.id);
                    setEditDraft(comment.body);
                  }}
                >
                  <Pencil size={12.5} />
                </button>
                <button
                  type="button"
                  className="note-comment-action is-quiet is-delete press"
                  aria-label={head && onlyOne ? "Delete this comment" : "Delete this reply"}
                  title={head && onlyOne ? "Delete this comment" : "Delete this reply"}
                  onClick={(event) => {
                    event.stopPropagation();
                    void remove(comment, onlyOne);
                  }}
                >
                  <Trash2 size={12.5} />
                </button>
              </span>
            )}
          </p>
          {editing === comment.id ? (
            <div className="note-comment-editor" onClick={(event) => event.stopPropagation()}>
              <textarea
                value={editDraft}
                onChange={(event) => setEditDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setEditing(null);
                    setEditDraft("");
                  } else if (
                    event.key === "Enter" &&
                    (event.metaKey || event.ctrlKey) &&
                    !event.nativeEvent.isComposing
                  ) {
                    event.preventDefault();
                    void saveEdit(comment);
                  }
                }}
                aria-label={head ? "Edit comment" : "Edit reply"}
                autoFocus
              />
              <div className="note-comment-editor-actions">
                <button
                  type="button"
                  className="note-comment-action press"
                  onClick={() => {
                    setEditing(null);
                    setEditDraft("");
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="note-comment-send press"
                  disabled={!editDraft.trim() || editDraft.trim() === comment.body}
                  onClick={() => void saveEdit(comment)}
                >
                  Save
                </button>
              </div>
            </div>
          ) : (
            <p className="note-comment-body">{comment.body}</p>
          )}
        </div>
      </div>
    );
  }

  function card(thread: CommentThread) {
    const [head, ...replies] = thread.comments;
    const isActive = active === thread.threadId;
    const folded = !expanded[thread.threadId] && replies.length > REPLIES_SHOWN;
    const visibleReplies = folded ? replies.slice(-REPLIES_SHOWN) : replies;
    const hiddenCount = replies.length - visibleReplies.length;

    return (
      <article
        key={thread.threadId}
        data-thread={thread.threadId}
        ref={(node) => {
          if (node) threadRefs.current.set(thread.threadId, node);
          else threadRefs.current.delete(thread.threadId);
        }}
        className={`note-comment-thread ${thread.resolved ? "is-resolved" : ""} ${
          isActive ? "is-active" : ""
        }`}
        onClick={() => {
          setActive(thread.threadId);
          onReveal(thread.threadId);
        }}
      >
        {/* In a list the quote is the only way to know what is being discussed.
            Standing beside the passage it is a repetition of what the reader is
            already looking at, so it shrinks to a label and stops being a
            paragraph of its own. */}
        {/* The passage, as the thread's title. It is how you know what is being
            discussed without hunting for the underline, and clicking the card
            lights that underline in the text. */}
        <p className={`note-comment-quote ${quotes.has(thread.threadId) ? "" : "is-orphan"}`}>
          {quotes.get(thread.threadId) || "The passage this was about is gone"}
        </p>

        {remark(head, true, thread.comments.length === 1)}

        {hiddenCount > 0 && (
          <button
            type="button"
            className="note-comment-more press"
            onClick={(event) => {
              event.stopPropagation();
              setExpanded((current) => ({ ...current, [thread.threadId]: true }));
            }}
          >
            <ChevronDown size={13} />
            {hiddenCount} earlier {hiddenCount === 1 ? "reply" : "replies"}
          </button>
        )}

        {visibleReplies.map((reply) => remark(reply, false, false))}

        {canEdit && (
          <div className="note-comment-thread-actions">
            <button
              type="button"
              className="note-comment-action press"
              onClick={(event) => {
                event.stopPropagation();
                void toggleResolved(thread.threadId, !thread.resolved);
              }}
              title={
                thread.resolved
                  ? "Put this back among the open threads"
                  : "Mark this dealt with — it stays readable under “resolved”"
              }
            >
              {thread.resolved ? <RotateCcw size={13} /> : <Check size={13} />}
              {thread.resolved ? "Reopen" : "Resolve"}
            </button>
          </div>
        )}

        {canEdit && !thread.resolved && composer(thread.threadId, "Reply", isActive)}
      </article>
    );
  }

  const body = (
    <>
      {loading && <p className="note-comments-empty">Loading…</p>}

      {!loading && shown.length === 0 && !pendingIsNew && (
        <p className="note-comments-empty">
          Nothing here yet. Select a passage and use the comment button to say something about it.
        </p>
      )}

      {shown.map(card)}

      {/* The one being written goes last, where it is about to land.
          Rendered first, it appeared above every existing thread while you
          typed and then jumped to the foot of the column the moment you sent
          it — so the newest remark was at the top for exactly as long as it
          was unsent, which is the opposite of what the column says it does. */}
      {pendingIsNew && (
        <article
          data-thread={pendingThread}
          ref={(node) => {
            if (node) threadRefs.current.set(pendingThread, node);
          }}
          className="note-comment-thread is-pending is-active"
        >
          <p className="note-comment-quote">{quotes.get(pendingThread) || "This passage"}</p>
          {composer(pendingThread, "What about this passage?", true)}
        </article>
      )}
    </>
  );

  /* The other half of the link. A card knows which passage it belongs to and
     says so by standing beside it; the passage has to be able to say it back,
     or the reader is still guessing which underline the open card came from.
     Written as one rule aimed at that thread's mark rather than by putting a
     class on the span: the spans are ProseMirror's to render, and a class this
     component wrote there would be dropped on its next redraw. The id comes
     from `crypto.randomUUID`, and is checked against that shape before it is
     put in a stylesheet. */
  const lit = active && /^[a-zA-Z0-9-]+$/.test(active) ? active : null;

  return (
    <aside className="note-comments" aria-label="Comments on this note">
      {lit && (
        <style>{`.rich-text-content span[data-comment-thread="${lit}"]{background:color-mix(in srgb,var(--accent) 30%,transparent);border-bottom-color:var(--accent);border-bottom-style:solid}`}</style>
      )}
      <header className="note-comments-header">
        <MessageSquare size={15} />
        <span className="note-comments-title">
          Comments
          {threads.length > 0 && <b className="note-comments-count">{threads.length}</b>}
        </span>
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

      <div className="note-comments-scroll">{body}</div>
    </aside>
  );
}
