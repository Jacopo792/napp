/* The conversation about a note, beside the passage it is about.
 *
 * A thread is a passage in the document plus the remarks about it. The passage
 * is a mark in the Yjs document and the remarks are rows in `note_comments`, so
 * this panel is the one place the two halves are put back together: the quote
 * comes from the live document, the words from the archive.
 *
 * ── Why the cards are anchored ──────────────────────────────────────────────
 * They used to be a list. A list beside a document is two documents: the reader
 * had a column of quotes on the right and a column of underlines on the left
 * and had to match them up by eye, every time. So each card now sits at the
 * height of the passage it belongs to, and the matching is done by the layout
 * instead of by the reader.
 *
 * The cards live in a layer that is moved with the editor's own scrolling
 * rather than in a second scroller kept in step with the first — one
 * `translateY` per frame, set on the element and never through React, because
 * the note list and the whole page hang off this component's parent and a
 * scroll position in state would re-render all of it sixty times a second.
 *
 * Anchoring needs room. Below the width where the panel stops being a column
 * and starts covering the page, aligning to text nobody can see is worse than
 * not aligning, so it falls back to the plain list it always was.
 *
 * It loads for itself. Comments are not part of the catalogue and must not be
 * on the way to opening a note — the panel is closed until somebody asks for
 * it, and the note is readable long before this has finished. */
import { Check, ChevronDown, MessageSquare, RotateCcw, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/WorkspaceMenus";
import {
  addComment,
  deleteComment,
  loadComments,
  resolveThread,
  threadsOf,
  type NoteComment,
} from "@/lib/comments";
import { inDocumentOrder, type CommentThread } from "@/lib/commentThreads";
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
  /** Whether there is room to stand the cards beside their passages. */
  anchored: boolean;
  /** The editor's scrolling element, so the layer can follow it. */
  scroller: HTMLElement | null;
  /** Where each thread's passage sits, in the scroller's content space. */
  measureAnchors: () => Map<string, number>;
  onClose: () => void;
  onReveal: (threadId: string) => void;
  onRemoveAnchor: (threadId: string) => void;
}

/** Air between two cards that would otherwise overlap. */
const CARD_GAP = 10;
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
  anchored,
  scroller,
  measureAnchors,
  onClose,
  onReveal,
  onRemoveAnchor,
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
  const [anchors, setAnchors] = useState<Map<string, number>>(() => new Map());
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const threadRefs = useRef(new Map<string, HTMLElement>());

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
    if (pendingThread) {
      setActive(pendingThread);
      composerRef.current?.focus();
    }
  }, [pendingThread]);

  /* Where the passages are. Re-measured when the text reflows for any reason —
     an edit, a picture finishing loading, the pane being resized — because a
     card anchored to where a paragraph used to be is worse than a card in a
     list, which at least never claimed to point anywhere. */
  const remeasure = useCallback(() => setAnchors(measureAnchors()), [measureAnchors]);

  useEffect(() => {
    if (!anchored || !scroller) return;
    remeasure();
    const observer = new ResizeObserver(remeasure);
    observer.observe(scroller);
    const content = scroller.querySelector(".rich-text-content");
    if (content) observer.observe(content);
    return () => observer.disconnect();
  }, [anchored, scroller, remeasure, comments, quotes]);

  /* The layer follows the editor's scrolling. Imperatively and on a frame,
     never through state: this component's parent owns the whole page. */
  useEffect(() => {
    if (!anchored || !scroller) return;
    let frame = 0;
    const sync = () => {
      frame = 0;
      const layer = layerRef.current;
      const field = layer?.parentElement;
      if (!layer || !field) return;
      /* The layer starts below this panel's header and the text starts at the
         top of the pane, so the two coordinate systems are offset by however
         tall the header happens to be — and it is not a constant: the failure
         banner appears between them. Measured each time rather than assumed,
         which costs one rect on a frame that is already reading one. */
      const offset = scroller.getBoundingClientRect().top - field.getBoundingClientRect().top;
      layer.style.transform = `translateY(${offset - scroller.scrollTop}px)`;
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(sync);
    };
    sync();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [anchored, scroller]);

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

  /* `quotes` is built by walking the document, so its key order is the order
     the passages appear in the note — which is the order the panel reads in. */
  const threads = useMemo(
    () => inDocumentOrder(threadsOf(comments), quotes.keys()),
    [comments, quotes],
  );
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
    if (!anchored) row.scrollIntoView({ block: "nearest", behavior: "smooth" });
    row.classList.add("is-arrived");
    const timer = window.setTimeout(() => row.classList.remove("is-arrived"), 1400);
    onFocusHandled();
    return () => window.clearTimeout(timer);
  }, [focusThread, comments, loading, showResolved, anchored, onFocusHandled]);

  /* Standing the cards beside their passages, without letting them overlap.
     One sweep down the column: each card wants to be level with its own
     passage and takes the first position at or below that which is still free.
     Done here rather than in the render because it needs each card's measured
     height, and a card's height is not known until it has been laid out. */
  useLayoutEffect(() => {
    const layer = layerRef.current;
    if (!anchored || !layer) return;
    let next = 0;
    for (const card of layer.querySelectorAll<HTMLElement>("[data-thread]")) {
      const wanted = anchors.get(card.dataset.thread ?? "") ?? next;
      const top = Math.max(wanted, next);
      card.style.top = `${top}px`;
      next = top + card.offsetHeight + CARD_GAP;
    }
  });

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

  function composer(threadId: string, placeholder: string, open: boolean) {
    return (
      <div className={`note-comment-composer ${open ? "is-open" : ""}`}>
        <textarea
          ref={threadId === pendingThread ? composerRef : undefined}
          value={draft[threadId] ?? ""}
          onChange={(event) => setDraft((c) => ({ ...c, [threadId]: event.target.value }))}
          onFocus={() => setActive(threadId)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              void say(threadId);
            }
          }}
          placeholder={placeholder}
          rows={open ? 2 : 1}
          aria-label={placeholder}
        />
        {open && (
          <div className="note-comment-composer-actions">
            <kbd className="readout">⌘↵</kbd>
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
    return (
      <div key={comment.id} className={`note-comment ${head ? "is-head" : "is-reply"}`}>
        <Avatar url={author?.avatarUrl ?? null} name={name} email="" compact />
        <div className="note-comment-said">
          <p className="note-comment-signature">
            <span className="note-comment-name truncate">{name}</span>
            <span className="readout note-comment-stamp">{formatStamp(comment.createdAt)}</span>
            {comment.authorId === session.userId && (
              <button
                type="button"
                className="note-comment-action is-quiet press"
                aria-label={head && onlyOne ? "Delete this comment" : "Delete this reply"}
                title={head && onlyOne ? "Delete this comment" : "Delete this reply"}
                onClick={() => void remove(comment, onlyOne)}
              >
                <Trash2 size={12.5} />
              </button>
            )}
          </p>
          <p className="note-comment-body">{comment.body}</p>
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
        {!anchored && (
          <p className="note-comment-quote">
            {quotes.get(thread.threadId) || "The passage this was about is gone"}
          </p>
        )}
        {anchored && !quotes.has(thread.threadId) && (
          <p className="note-comment-quote is-orphan">The passage this was about is gone</p>
        )}

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

      {loading && <p className="note-comments-empty">Loading…</p>}

      {!loading && shown.length === 0 && !pendingIsNew && (
        <p className="note-comments-empty">
          Nothing here yet. Select a passage and use the comment button to say something about it.
        </p>
      )}

      {shown.map(card)}
    </>
  );

  return (
    <aside
      className={`note-comments ${anchored ? "is-anchored" : ""}`}
      aria-label="Comments on this note"
    >
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

      {anchored ? (
        <div className="note-comments-field">
          <div ref={layerRef} className="note-comments-layer">
            {body}
          </div>
        </div>
      ) : (
        <div className="note-comments-scroll">{body}</div>
      )}
    </aside>
  );
}
