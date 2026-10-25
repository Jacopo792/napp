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
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Quote,
  Smile,
  Trash2,
  UserPlus,
  X,
} from "@/components/icons";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Avatar } from "@/components/WorkspaceMenus";
import { PointMenu } from "@/components/ContextMenu";
import type { MenuItem } from "@/lib/menuShape";
import type { MenuPoint } from "@/lib/contextMenu";
import { useDismiss } from "@/components/useDismiss";
import {
  addComment,
  assignThread,
  deleteComment,
  loadComments,
  loadReactions,
  resolveThread,
  setReaction,
  threadsOf,
  type NoteComment,
  type Reaction,
  updateComment,
} from "@/lib/comments";
import {
  REACTIONS,
  isForYou,
  mentionQuery,
  mentionedIn,
  tally,
  type CommentThread,
} from "@/lib/commentThreads";
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
  /** Something was said, resolved or taken back — so lists outside this
   *  panel can read again now rather than when Realtime gets round to it. */
  onChanged?: () => void;
  /** Where the page has room beside its words: the cards are drawn in this
   *  element, inside the scrolling page, each beside its own passage. */
  margin?: HTMLElement | null;
}

/** How long ago, as the phone's annotations say it: "Now", "2m", "3h", then
 *  the list's own stamp — "Yesterday", a weekday, a date. */
function ago(iso: string): string {
  const then = new Date(iso);
  const seconds = (Date.now() - then.getTime()) / 1000;
  if (seconds < 60) return "Now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (then.toDateString() === new Date().toDateString()) return `${Math.floor(seconds / 3600)}h`;
  return formatStamp(iso);
}

/** Air between the page's edge and the cards beside it. */
const MARGIN_ASIDE = 28;

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
  onChanged,
  margin,
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
  const [reactions, setReactions] = useState<Reaction[]>([]);
  /** Only the threads handed to this reader or naming them. */
  const [forYou, setForYou] = useState(false);
  /** The composer an @ is being typed in, and the name so far. */
  const [suggesting, setSuggesting] = useState<{ threadId: string; query: string } | null>(null);
  /** Which remark's reactions are open. */
  const [reacting, setReacting] = useState<string | null>(null);
  /** A thread's ⋯, open under its button. */
  const [threadMenu, setThreadMenu] = useState<(MenuPoint & { items: MenuItem[] }) | null>(null);
  const members = useMemo(() => [...authors.values()], [authors]);
  /* One of each is open at a time, so one ref each, on the one that is. */
  const closeReact = useCallback(() => setReacting(null), []);
  const reactRef = useDismiss<HTMLSpanElement>(reacting !== null, closeReact);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const threadRefs = useRef(new Map<string, HTMLElement>());

  useEffect(() => {
    let live = true;
    setLoading(true);
    /* Reactions are a convenience over the conversation: failing to read them
       must not keep the remarks from showing. */
    loadReactions(session, noteId)
      .then((rows) => live && setReactions(rows))
      .catch(() => live && setReactions([]));
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
        const assignee =
          comments.find((comment) => comment.threadId === threadId)?.assigneeId ?? null;
        const saved = await addComment(
          session,
          noteId,
          threadId,
          body,
          mentionedIn(body, members),
          assignee,
        );
        setComments((current) => [...current, saved]);
        setDraft((current) => ({ ...current, [threadId]: "" }));
        setFailure("");
        if (threadId === pendingThread) onPendingHandled();
        onChanged?.();
      } catch (reason) {
        setFailure(reason instanceof Error ? reason.message : "Could not save that comment");
      }
    },
    [draft, session, noteId, pendingThread, onPendingHandled, onChanged, comments, members],
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
  const forYouCount = threads.filter(
    (thread) => !thread.resolved && isForYou(thread, session.userId),
  ).length;
  const shown = threads.filter(
    (thread) => (showResolved || !thread.resolved) && (!forYou || isForYou(thread, session.userId)),
  );
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
      onChanged?.();
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
      const saved = await updateComment(session, comment.id, body, mentionedIn(body, members));
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

  async function assign(threadId: string, assigneeId: string | null) {
    try {
      await assignThread(session, noteId, threadId, assigneeId);
      setComments((current) =>
        current.map((c) => (c.threadId === threadId ? { ...c, assigneeId } : c)),
      );
      onChanged?.();
    } catch (reason) {
      setFailure(reason instanceof Error ? reason.message : "Could not hand that thread over");
    }
  }

  async function react(commentId: string, emoji: string, on: boolean) {
    setReacting(null);
    const mine = (r: Reaction) =>
      r.commentId === commentId && r.userId === session.userId && r.emoji === emoji;
    const before = reactions;
    /* Shown at once and put back on refusal: a reaction is the one act here
       that should feel like nothing happened between pressing and seeing. */
    setReactions((current) =>
      on
        ? [...current.filter((r) => !mine(r)), { commentId, userId: session.userId, emoji }]
        : current.filter((r) => !mine(r)),
    );
    try {
      await setReaction(session, noteId, commentId, emoji, on);
    } catch (reason) {
      setReactions(before);
      setFailure(reason instanceof Error ? reason.message : "Could not save that reaction");
    }
  }

  /** The draft with the @name being typed replaced by the chosen member. */
  function pickMention(threadId: string, name: string) {
    const field = document.activeElement;
    const text = draft[threadId] ?? "";
    const caret = field instanceof HTMLTextAreaElement ? field.selectionStart : text.length;
    const start = text.slice(0, caret).lastIndexOf("@");
    if (start < 0) return;
    const next = `${text.slice(0, start)}@${name} ${text.slice(caret)}`;
    setDraft((current) => ({ ...current, [threadId]: next }));
    setSuggesting(null);
  }

  /** A remark's words, with the members it names drawn as names. */
  function words(comment: NoteComment) {
    const named = members.filter((member) => comment.mentions.includes(member.userId));
    if (named.length === 0) return comment.body;
    const pattern = new RegExp(
      `(@(?:${named
        .map((member) => member.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .sort((a, b) => b.length - a.length)
        .join("|")}))`,
      "giu",
    );
    return comment.body.split(pattern).map((part, index) =>
      index % 2 === 1 ? (
        <span key={index} className="note-comment-mention">
          {part}
        </span>
      ) : (
        part
      ),
    );
  }

  async function remove(comment: NoteComment, lastInThread: boolean) {
    try {
      await deleteComment(session, comment.id);
      onChanged?.();
      setComments((current) => current.filter((c) => c.id !== comment.id));
      /* The last remark gone means nothing is being said about that passage
         any more, so the underline goes too rather than being left behind
         pointing at a conversation that no longer exists. */
      if (lastInThread) onRemoveAnchor(comment.threadId);
    } catch (reason) {
      setFailure(reason instanceof Error ? reason.message : "Could not delete that comment");
    }
  }

  function suggestions(threadId: string) {
    if (!suggesting || suggesting.threadId !== threadId) return [];
    const wanted = suggesting.query.toLocaleLowerCase();
    return members
      .filter((member) => member.name && member.name.toLocaleLowerCase().startsWith(wanted))
      .slice(0, 5);
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
          onChange={(event) => {
            const text = event.target.value;
            setDraft((c) => ({ ...c, [threadId]: text }));
            const query = mentionQuery(text, event.target.selectionStart ?? text.length);
            setSuggesting(query === null ? null : { threadId, query });
          }}
          onFocus={() => setActive(threadId)}
          onKeyDown={(event) => {
            const offered = suggestions(threadId);
            if (offered.length > 0 && (event.key === "Enter" || event.key === "Tab")) {
              event.preventDefault();
              pickMention(threadId, offered[0].name);
              return;
            }
            if (event.key === "Escape" && suggesting) {
              event.stopPropagation();
              setSuggesting(null);
              return;
            }
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
        {suggestions(threadId).length > 0 && (
          <div className="note-comment-suggestions" role="listbox">
            {suggestions(threadId).map((member, index) => (
              <button
                key={member.userId}
                type="button"
                role="option"
                aria-selected={index === 0}
                className="note-comment-suggestion press"
                onMouseDown={(event) => {
                  // Before the textarea loses focus, or the caret is gone.
                  event.preventDefault();
                  pickMention(threadId, member.name);
                }}
              >
                <Avatar url={member.avatarUrl} name={member.name} email="" compact />
                {member.name}
              </button>
            ))}
          </div>
        )}
        {open && (
          <div className="note-comment-composer-actions">
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
    const mine = comment.authorId === session.userId;
    /* The phone's byline: a neutral face, the name — "You" for your own, as
       Messages says it — and how long ago. The caret colours that once tinted
       each name were a second colour system laid over a conversation that
       reads perfectly well in ink; the face says who. */
    const name = mine ? "You" : author?.name || "Someone";
    return (
      <div
        key={comment.id}
        className={`note-comment ${head ? "is-head" : "is-reply"} ${mine ? "is-mine" : ""}`}
      >
        {/* Who and when on the left; the remark's own small acts on the right,
            under the pointer only. What is done to the whole thread is at its
            foot. */}
        <div className="note-comment-head">
          <Avatar url={author?.avatarUrl ?? null} name={author?.name || name} email="" compact />
          <span className="note-comment-who">
            <span className="note-comment-name truncate">{name}</span>
            <time className="note-comment-stamp" dateTime={comment.createdAt}>
              {ago(comment.createdAt)}
            </time>
          </span>
          <span className="note-comment-tools" onClick={(event) => event.stopPropagation()}>
            {canEdit && reactTool(comment)}
            {mine && (
              <button
                type="button"
                className="note-comment-tool is-quiet press"
                aria-label={head ? "Edit this comment" : "Edit this reply"}
                title={head ? "Edit this comment" : "Edit this reply"}
                onClick={() => {
                  setEditing(comment.id);
                  setEditDraft(comment.body);
                }}
              >
                <Pencil size={14} />
              </button>
            )}
            {mine && (
              <button
                type="button"
                className="note-comment-tool is-quiet is-delete press"
                aria-label={head && onlyOne ? "Delete this comment" : "Delete this reply"}
                title={head && onlyOne ? "Delete this comment" : "Delete this reply"}
                onClick={() => void remove(comment, onlyOne)}
              >
                <Trash2 size={14} />
              </button>
            )}
          </span>
        </div>
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
                  !event.shiftKey &&
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
          <p className="note-comment-body">{words(comment)}</p>
        )}
        {reactionRow(comment)}
      </div>
    );
  }

  /** The chips under a remark. Only there when somebody has reacted: an
   *  empty row held a gap under every remark for a button nobody saw. */
  function reactionRow(comment: NoteComment) {
    const counted = tally(reactions, comment.id, session.userId);
    if (counted.length === 0) return null;
    return (
      <div className="note-comment-reactions" onClick={(event) => event.stopPropagation()}>
        {counted.map(({ emoji, count, mine }) => (
          <button
            key={emoji}
            type="button"
            className={`note-comment-reaction press ${mine ? "is-mine" : ""}`}
            disabled={!canEdit}
            aria-pressed={mine}
            title={reactors(comment.id, emoji)}
            onClick={() => void react(comment.id, emoji, !mine)}
          >
            <span>{emoji}</span>
            <span className="readout">{count}</span>
          </button>
        ))}
      </div>
    );
  }

  function reactTool(comment: NoteComment) {
    const counted = tally(reactions, comment.id, session.userId);
    return (
      <span className="note-comment-react" ref={reacting === comment.id ? reactRef : undefined}>
        <button
          type="button"
          className="note-comment-tool is-quiet press"
          aria-label="React"
          title="React"
          aria-expanded={reacting === comment.id}
          onClick={() => setReacting((open) => (open === comment.id ? null : comment.id))}
        >
          <Smile size={14} />
        </button>
        {reacting === comment.id && (
          <span className="note-comment-palette">
            {REACTIONS.map((emoji) => {
              const mine = counted.some((one) => one.emoji === emoji && one.mine);
              return (
                <button
                  key={emoji}
                  type="button"
                  className={`note-comment-palette-emoji press ${mine ? "is-mine" : ""}`}
                  onClick={() => void react(comment.id, emoji, !mine)}
                >
                  {emoji}
                </button>
              );
            })}
          </span>
        )}
      </span>
    );
  }

  /** Who gave this reaction, by name — the reaction's own tooltip. */
  function reactors(commentId: string, emoji: string) {
    return reactions
      .filter((r) => r.commentId === commentId && r.emoji === emoji)
      .map((r) => (r.userId === session.userId ? "You" : authors.get(r.userId)?.name || "Someone"))
      .join(", ");
  }

  /** A thread's ⋯: where it is in the note, who it is for, and taking it
   *  back — the phone's three, in the page's own menu. Deleting is the
   *  author's alone, so the whole thread is offered only to whoever wrote
   *  every remark in it; it asks twice by being a section you step into. */
  function openThreadMenu(event: React.MouseEvent<HTMLElement>, thread: CommentThread) {
    event.stopPropagation();
    const { left, bottom } = event.currentTarget.getBoundingClientRect();
    const allMine = thread.comments.every((comment) => comment.authorId === session.userId);
    const items: MenuItem[] = [
      ...(quotes.has(thread.threadId)
        ? [
            {
              kind: "item" as const,
              id: "thread:show",
              label: "Show in Note",
              icon: <Quote size={16} />,
              run: () => {
                setActive(thread.threadId);
                onReveal(thread.threadId);
              },
            },
          ]
        : []),
      ...(canEdit && !thread.resolved
        ? [
            {
              kind: "item" as const,
              id: "thread:assign",
              label: "Assign To",
              icon: <UserPlus size={16} />,
              submenu: [
                ...members.map((member) => ({
                  kind: "item" as const,
                  id: `thread:assign:${member.userId}`,
                  label: member.userId === session.userId ? "You" : member.name || "Someone",
                  icon: thread.assigneeId === member.userId ? <Check size={16} /> : undefined,
                  run: () => void assign(thread.threadId, member.userId),
                })),
                {
                  kind: "item" as const,
                  id: "thread:assign:nobody",
                  label: "Nobody",
                  icon: thread.assigneeId ? undefined : <Check size={16} />,
                  run: () => void assign(thread.threadId, null),
                },
              ],
            },
          ]
        : []),
      ...(canEdit && allMine
        ? [
            { kind: "separator" as const },
            {
              kind: "item" as const,
              id: "thread:delete",
              label: "Delete Thread",
              icon: <Trash2 size={16} />,
              danger: true,
              submenu: [
                {
                  kind: "item" as const,
                  id: "thread:delete:confirm",
                  label: "Delete Thread",
                  danger: true,
                  run: () => void removeThread(thread),
                },
              ],
            },
          ]
        : []),
    ];
    setThreadMenu({ x: left, y: bottom + 4, items });
  }

  async function removeThread(thread: CommentThread) {
    for (const [at, comment] of thread.comments.entries())
      await remove(comment, at === thread.comments.length - 1);
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
        {/* The passage, recessed into the card with a rule down its side, as
            the phone draws it — pressed, it lights its words in the note. */}
        <p className={`note-comment-quote ${quotes.has(thread.threadId) ? "" : "is-orphan"}`}>
          <span>{quotes.get(thread.threadId) || "The passage this was about is gone"}</span>
          {quotes.has(thread.threadId) && <ArrowUpRight size={13} aria-hidden="true" />}
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
            <ChevronDown size={12} />
            {hiddenCount} earlier {hiddenCount === 1 ? "reply" : "replies"}
          </button>
        )}

        {visibleReplies.map((reply) => remark(reply, false, false))}

        {/* The thread's foot, in quiet words: who it is for, then Reply,
            Resolve and ⋯ — the phone's, and the order a hand reaches for
            them in. */}
        <div className="note-comment-foot" onClick={(event) => event.stopPropagation()}>
          {thread.assigneeId && (
            <span className="note-comment-assignee">
              <Avatar
                url={authors.get(thread.assigneeId)?.avatarUrl ?? null}
                name={authors.get(thread.assigneeId)?.name || ""}
                email=""
                compact
              />
              {thread.assigneeId === session.userId
                ? "Assigned to you"
                : `For ${authors.get(thread.assigneeId)?.name || "someone"}`}
            </span>
          )}
          {canEdit && !thread.resolved && (
            <button
              type="button"
              className="note-comment-word press"
              onClick={() => {
                setActive(thread.threadId);
                window.requestAnimationFrame(() =>
                  threadRefs.current
                    .get(thread.threadId)
                    ?.querySelector<HTMLTextAreaElement>(".note-comment-composer textarea")
                    ?.focus(),
                );
              }}
            >
              Reply
            </button>
          )}
          {canEdit && (
            <button
              type="button"
              className="note-comment-word press"
              onClick={() => void toggleResolved(thread.threadId, !thread.resolved)}
            >
              {thread.resolved ? "Reopen" : "Resolve"}
            </button>
          )}
          <button
            type="button"
            className="note-comment-tool is-quiet note-comment-more-acts press"
            aria-label="More"
            aria-haspopup="menu"
            title="More"
            onClick={(event) => openThreadMenu(event, thread)}
          >
            <MoreHorizontal size={16} />
          </button>
        </div>

        {/* The reply box belongs to the thread being read. One under every
            card was most of the column's weight — five threads, five empty
            fields asking to be filled. */}
        {canEdit &&
          !thread.resolved &&
          (isActive || (draft[thread.threadId] ?? "") !== "") &&
          composer(thread.threadId, "Reply…", true)}
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
          {composer(pendingThread, "Add a comment…", true)}
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

  /* ── The margin ──────────────────────────────────────────────────────────
     Beside the page, inside its scroller, and held at the top of it while the
     page moves. The cards were level with their passages, which left the
     header alone at the top of the margin and the first remark half a page
     below it; they now stand under the header in the order their passages
     come in the text — the open one lights its words, and a click on the
     words opens its card, so the eye-line is stated rather than implied.
     Written onto the elements directly: it follows every reflow of the
     note, which is not a reason to render the conversation again. */
  const placeRef = useRef<() => void>(() => {});
  placeRef.current = () => {
    if (!margin) return;
    const scope = margin.parentElement;
    if (!scope) return;
    /* Beside the words, not against the far wall: the page is centred in
       what the window leaves it, so a margin pinned to the right edge stood
       further from the sheet the wider the window was. */
    const column =
      scope.querySelector(".manuscript-sheet") ?? scope.querySelector(".rich-text-content");
    if (column) {
      const box = column.getBoundingClientRect();
      const origin = scope.getBoundingClientRect();
      margin.style.left = `${Math.round(box.right - origin.left + scope.scrollLeft + MARGIN_ASIDE)}px`;
      /* As tall as the page, so the column has the length of the page to
         stay pinned along. */
      const bottom = box.bottom - origin.top + scope.scrollTop;
      margin.style.height = `${Math.max(0, Math.round(bottom - margin.offsetTop))}px`;
    }
    margin.style.setProperty("--margin-room", `${scope.clientHeight - 48}px`);
    const anchorTop = (id: string) => {
      const anchor = /^[a-zA-Z0-9-]+$/.test(id)
        ? scope.querySelector(`.rich-text-content span[data-comment-thread="${id}"]`)
        : null;
      return anchor ? anchor.getBoundingClientRect().top : Number.POSITIVE_INFINITY;
    };
    [...threadRefs.current.entries()]
      .filter(([, node]) => node.isConnected)
      .map(([id, node]) => ({ node, at: anchorTop(id) }))
      .sort((a, b) => a.at - b.at)
      .forEach(({ node }, index) => {
        node.style.order = String(index);
      });
  };

  useLayoutEffect(() => placeRef.current());

  useEffect(() => {
    if (!margin?.parentElement) return;
    let frame = 0;
    const later = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => placeRef.current());
    };
    const sizes = new ResizeObserver(later);
    const content = margin.parentElement.querySelector(".rich-text-content");
    if (content) sizes.observe(content);
    sizes.observe(margin.parentElement);
    return () => {
      cancelAnimationFrame(frame);
      sizes.disconnect();
    };
  }, [margin, comments, pendingThread, showResolved, forYou, expanded]);

  const panel = (
    <aside
      className={`note-comments ${margin ? "is-margin" : ""}`}
      aria-label="Comments on this note"
    >
      {lit && (
        <style>{`.rich-text-content span[data-comment-thread="${lit}"]{background:color-mix(in srgb,var(--accent) 30%,transparent);border-bottom-color:var(--accent);border-bottom-style:solid}`}</style>
      )}
      <header className="note-comments-header">
        <MessageSquare size={16} />
        <span className="note-comments-title">
          Comments
          {threads.length > 0 && <b className="note-comments-count">{threads.length}</b>}
        </span>
        {forYouCount > 0 && (
          <button
            type="button"
            className={`note-comment-action press note-comments-toggle ${forYou ? "is-on" : ""}`}
            aria-pressed={forYou}
            onClick={() => setForYou((on) => !on)}
          >
            For you
            <b className="note-comments-count">{forYouCount}</b>
          </button>
        )}
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
          <X size={16} />
        </button>
      </header>

      {failure && (
        <p role="alert" className="note-comments-failure">
          {failure}
        </p>
      )}

      <div className="note-comments-scroll">{body}</div>
      {threadMenu && (
        <PointMenu point={threadMenu} items={threadMenu.items} close={() => setThreadMenu(null)} />
      )}
    </aside>
  );
  return margin ? createPortal(panel, margin) : panel;
}
