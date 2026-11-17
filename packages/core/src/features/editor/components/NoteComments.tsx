/* The chat about a note.
 *
 * Until November 2026 this was a column of threads, each a passage and the
 * remarks about it, to be resolved and put away. It is a conversation now:
 * every message the members of the archive send about this note, oldest at
 * the top and newest by the composer, the way any chat reads.
 *
 * A message may still be about a passage. The passage stays a mark in the
 * note's Yjs document and the message carries its id as `thread_id`, so the
 * quote shows inside the bubble and a press on it takes you to the words. A
 * message about the note as a whole uses the note's own id as its thread,
 * which no passage can have.
 *
 * The column opens beside the note as before and can be enlarged into a sheet
 * over the window: the same surface, changing shape, with its contents
 * arriving once it has room (the moving family's `shape`/`wait`/`content`).
 *
 * It loads for itself and listens for itself. Comments are not part of the
 * catalogue and must not be on the way to opening a note. */
import {
  ArrowUp,
  ChevronDown,
  Flag,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Pencil,
  Quote,
  Smile,
  Trash2,
  X,
} from "@/components/icons";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { SafetyActions } from "@/components/SafetyActions";
import { Avatar } from "@/components/WorkspaceMenus";
import { useDismiss } from "@/components/useDismiss";
import {
  addComment,
  deleteComment,
  loadComments,
  loadReactions,
  setReaction,
  type NoteComment,
  type Reaction,
  updateComment,
} from "@/lib/comments";
import { mentionQuery, mentionedIn, tally } from "@/lib/commentThreads";
import { EASE, EASE_OUT, OVERLAY_OUT, SHAPE } from "@/lib/motion";
import type { AppSession } from "@/lib/session";
import { subscribeToComments, unsubscribeFromArchive } from "@/lib/sync";
import { useWritingPreferences } from "@/lib/writingPreferences";
import { EmojiPicker } from "@/components/ChatSettings";
import { ChatBubble } from "./ChatBubble";
import "./chat.css";

export interface CommentAuthor {
  userId: string;
  name: string;
  avatarUrl: string | null;
}

interface Props {
  session: AppSession;
  noteId: string;
  canEdit: boolean;
  /** Who the archive holds, so a message is signed with a name and a face. */
  authors: Map<string, CommentAuthor>;
  /** The passage each thread is attached to, read from the live document. */
  quotes: Map<string, string>;
  /** A passage the bubble menu has just anchored, waiting for its first message. */
  pendingThread: string | null;
  onPendingHandled: () => void;
  /** A passage arrived at by clicking it in the note. */
  focusThread: string | null;
  onFocusHandled: () => void;
  onClose: () => void;
  onReveal: (threadId: string) => void;
  onRemoveAnchor: (threadId: string) => void;
  /** Something was said or taken back — so lists outside this panel can read
   *  again now rather than when Realtime gets round to it. */
  onChanged?: () => void;
  /** Somebody else's message arrived and was seen arriving. */
  onRead?: () => void;
}

/** A message on its way: shown at once, replaced by the saved row. */
interface ChatMessage extends NoteComment {
  sending?: boolean;
  failed?: boolean;
}

/** Messages closer than this, from one person, are one group: one name. */
const GROUP_GAP = 5 * 60_000;

/** One to three emoji, with their skin tones, joiners and variation marks. */
const JUMBO =
  /^(?:\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier})*\s*){1,3}$/u;

const reduced = () =>
  typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

const dayOf = (iso: string) => new Date(iso).toDateString();

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(d.getFullYear() === today.getFullYear() ? {} : { year: "numeric" }),
  });
}

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

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
  onChanged,
  onRead,
}: Props) {
  const { chatBubble: myBubble, quickReactions } = useWritingPreferences();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState("");
  const [draft, setDraft] = useState("");
  /** The passage the next message is about, if any. */
  const [about, setAbout] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [reacting, setReacting] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  /** The menu opens upwards when its message is low in the column. */
  const [menuUp, setMenuUp] = useState(false);
  const [tapBelow, setTapBelow] = useState(false);
  const [picking, setPicking] = useState(false);
  const [reporting, setReporting] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  /** Messages that arrived while this was open, to be seen arriving. */
  const [arrived, setArrived] = useState<ReadonlySet<string>>(() => new Set());
  const [unseen, setUnseen] = useState(0);

  const members = useMemo(() => [...authors.values()], [authors]);
  const closeReact = useCallback(() => setReacting(null), []);
  const closeMenu = useCallback(() => {
    setMenuFor(null);
    setReporting(null);
  }, []);
  const reactRef = useDismiss<HTMLDivElement>(reacting !== null, closeReact);
  const closePicker = useCallback(() => setPicking(false), []);
  const pickerRef = useDismiss<HTMLDivElement>(picking, closePicker);
  const menuRef = useDismiss<HTMLDivElement>(menuFor !== null, closeMenu);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const columnRef = useRef<HTMLElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const atBottom = useRef(true);
  /** The id each saved message is drawn under: its local one, so the bubble
   *  that flew in is not replaced by a new one when the row comes back. */
  const keys = useRef(new Map<string, string>());
  const known = useRef<Set<string> | null>(null);
  const readRef = useRef(onRead);
  readRef.current = onRead;

  /* ── Reading, and listening ─────────────────────────────────────────── */

  const read = useCallback(async () => {
    const [rows, given] = await Promise.all([
      loadComments(session, noteId),
      /* Reactions are a convenience over the conversation: failing to read
         them must not keep the messages from showing. */
      loadReactions(session, noteId).catch(() => null),
    ]);
    if (given) setReactions(given);
    const fresh = known.current
      ? rows.filter((row) => !known.current!.has(row.id) && row.authorId !== session.userId)
      : [];
    known.current = new Set(rows.map((row) => row.id));
    if (fresh.length > 0) {
      setArrived((current) => new Set([...current, ...fresh.map((r) => r.id)]));
      readRef.current?.();
    }
    setMessages((current) => [
      ...rows,
      ...current.filter((message) => message.sending || message.failed),
    ]);
  }, [session, noteId]);

  useEffect(() => {
    let live = true;
    setLoading(true);
    read()
      .catch(
        (reason) =>
          live && setFailure(reason instanceof Error ? reason.message : "Couldn't load the chat"),
      )
      .finally(() => live && setLoading(false));
    /* One read per burst: Realtime announces every row separately. */
    let timer = 0;
    const channel = subscribeToComments(session.archiveId, () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void read().catch(() => undefined), 250);
    });
    return () => {
      live = false;
      window.clearTimeout(timer);
      void unsubscribeFromArchive(channel);
    };
  }, [session, read]);

  /* ── Where the next message is about ───────────────────────────────── */

  useEffect(() => {
    if (!pendingThread) return;
    setAbout(pendingThread);
    composerRef.current?.focus();
  }, [pendingThread]);

  /* A passage pressed in the note: the conversation about it comes into view
     and the composer is ready to add to it. */
  useEffect(() => {
    if (!focusThread || loading) return;
    setAbout(focusThread);
    const last = [...messages].reverse().find((message) => message.threadId === focusThread);
    const node =
      last && scrollRef.current?.querySelector<HTMLElement>(`[data-message="${last.id}"]`);
    if (node) {
      node.scrollIntoView({ block: "center", behavior: reduced() ? "auto" : "smooth" });
      node.classList.remove("is-arrived");
      void node.offsetWidth;
      node.classList.add("is-arrived");
    }
    onFocusHandled();
  }, [focusThread, loading, messages, onFocusHandled]);

  const aboutQuote = about ? quotes.get(about) : undefined;

  function dropAbout() {
    /* A passage anchored for a first message that never came is a highlight
       nothing points at: take it out of the text again. */
    if (about && about === pendingThread) {
      onRemoveAnchor(about);
      onPendingHandled();
    }
    setAbout(null);
    composerRef.current?.focus();
  }

  /* ── Staying at the newest ─────────────────────────────────────────── */

  /* The composer grows with what is typed, up to six lines.
     Before the pinning below, which must see the room it leaves. */
  useLayoutEffect(() => {
    const field = composerRef.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${Math.min(field.scrollHeight, 132)}px`;
  }, [draft, expanded]);

  /* By the key it is drawn under: a sent message being replaced by its saved
     row is the same message, and must not scroll the column a second time. */
  const lastId = messages.at(-1)?.id;
  const lastKey = lastId && (keys.current.get(lastId) ?? lastId);
  const lastMine = messages.at(-1)?.authorId === session.userId;
  /** The conversation's height when last laid out, to know how far a new
   *  message pushed everything up. */
  const streamHeight = useRef(0);
  const viewHeight = useRef(0);
  const glide = useRef<Animation | null>(null);
  /* Pinned to the newest the way a chat is. A new message — and the room its
     run's animal moves out of in the same frame — pushes the conversation up
     by one distance; that distance is played as a single glide, so the
     column moves once, the way iMessage's does, instead of jumping and then
     settling back. */
  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    const stream = scroller?.querySelector<HTMLElement>(".chat-stream");
    if (!scroller || loading) return;
    const before = streamHeight.current;
    const after = stream?.offsetHeight ?? 0;
    const view = scroller.clientHeight;
    /* The composer emptying as it sends gives the conversation room below;
       that is part of the same movement, not a drop before the rise. */
    const opened = view - viewHeight.current;
    streamHeight.current = after;
    viewHeight.current = view;
    if (atBottom.current || lastMine) {
      atBottom.current = true;
      /* A glide still under way when the next message comes is carried on
         from where it is, not snapped to its end. */
      const carried =
        stream && glide.current?.playState === "running"
          ? new DOMMatrixReadOnly(getComputedStyle(stream).transform).m42
          : 0;
      glide.current?.cancel();
      scroller.scrollTop = scroller.scrollHeight;
      setUnseen(0);
      const rise = Math.min(after - before - opened + carried, view);
      if (stream && before > 0 && rise > 0 && !reduced()) {
        const run = stream.animate(
          [{ transform: `translateY(${rise}px)` }, { transform: "none" }],
          { duration: SHAPE * 0.8, easing: EASE },
        );
        glide.current = run;
        void run.finished
          .then(() => {
            if (atBottom.current) scroller.scrollTop = scroller.scrollHeight;
          })
          .catch(() => undefined);
      }
    } else setUnseen((count) => count + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a new last message moves it
  }, [lastKey, loading, expanded]);

  const empty = messages.length === 0;
  /* Anything below that changes height afterwards — a reaction, an edit, the
     composer — keeps it pinned. */
  useEffect(() => {
    const scroller = scrollRef.current;
    const stream = scroller?.querySelector<HTMLElement>(".chat-stream");
    if (!scroller || !stream) return;
    const pin = new ResizeObserver(() => {
      streamHeight.current = stream.offsetHeight;
      viewHeight.current = scroller.clientHeight;
      /* While the glide runs, its transform reaches below the end and
         `scrollHeight` counts it: pinning to that would overshoot, and the
         column would drop back when the glide ends. It pins once it has. */
      if (glide.current?.playState === "running") return;
      if (atBottom.current) scroller.scrollTop = scroller.scrollHeight;
    });
    pin.observe(stream);
    pin.observe(scroller);
    return () => pin.disconnect();
  }, [loading, expanded, empty]);

  /* Only the reader's own scrolling unpins it; the pinning itself fires
     scroll events too, and those must not be read as leaving the bottom. */
  const onScroll = () => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const near = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 48;
    if (near) {
      atBottom.current = true;
      setUnseen(0);
    } else if (reading.current) atBottom.current = false;
  };
  const reading = useRef(false);
  const readingTimer = useRef(0);
  const byHand = () => {
    reading.current = true;
    window.clearTimeout(readingTimer.current);
    readingTimer.current = window.setTimeout(() => (reading.current = false), 200);
  };

  /* ── Saying something ──────────────────────────────────────────────── */

  async function send(retry?: ChatMessage) {
    const body = (retry?.body ?? draft).trim();
    if (!body) return;
    const threadId = retry?.threadId ?? (about && quotes.has(about) ? about : noteId);
    const local: ChatMessage = retry ?? {
      id: `local-${crypto.randomUUID()}`,
      threadId,
      authorId: session.userId,
      body,
      createdAt: new Date().toISOString(),
      resolvedAt: null,
      mentions: mentionedIn(body, members),
      assigneeId: null,
      bubble: myBubble,
    };
    setMessages((current) =>
      retry
        ? current.map((m) => (m.id === local.id ? { ...m, sending: true, failed: false } : m))
        : [...current, { ...local, sending: true }],
    );
    if (!retry) {
      setDraft("");
      setSuggesting(null);
      if (threadId === pendingThread) onPendingHandled();
      setAbout(null);
    }
    try {
      const saved = await addComment(
        session,
        noteId,
        threadId,
        body,
        local.mentions,
        null,
        local.bubble ?? null,
      );
      keys.current.set(saved.id, local.id);
      known.current?.add(saved.id);
      setMessages((current) => {
        const rest = current.filter((m) => m.id !== local.id && m.id !== saved.id);
        return [...rest, saved].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      });
      setFailure("");
      onChanged?.();
    } catch {
      setMessages((current) =>
        current.map((m) => (m.id === local.id ? { ...m, sending: false, failed: true } : m)),
      );
    }
  }

  async function saveEdit(message: ChatMessage) {
    const body = editDraft.trim();
    if (!body || body === message.body) return setEditing(null);
    try {
      const saved = await updateComment(session, message.id, body, mentionedIn(body, members));
      setMessages((current) => current.map((m) => (m.id === message.id ? saved : m)));
      setEditing(null);
    } catch (reason) {
      setFailure(reason instanceof Error ? reason.message : "Couldn't edit that message");
    }
  }

  async function remove(message: ChatMessage) {
    closeMenu();
    if (message.failed) {
      setMessages((current) => current.filter((m) => m.id !== message.id));
      return;
    }
    try {
      await deleteComment(session, message.id);
      const rest = messages.filter((m) => m.id !== message.id);
      setMessages(rest);
      onChanged?.();
      /* The last word about a passage gone, its underline goes too. */
      if (message.threadId !== noteId && !rest.some((m) => m.threadId === message.threadId))
        onRemoveAnchor(message.threadId);
    } catch (reason) {
      setFailure(reason instanceof Error ? reason.message : "Couldn't delete that message");
    }
  }

  async function react(messageId: string, emoji: string, on: boolean) {
    setReacting(null);
    const mine = (r: Reaction) =>
      r.commentId === messageId && r.userId === session.userId && r.emoji === emoji;
    const before = reactions;
    setReactions((current) =>
      on
        ? [
            ...current.filter((r) => !mine(r)),
            { commentId: messageId, userId: session.userId, emoji },
          ]
        : current.filter((r) => !mine(r)),
    );
    try {
      await setReaction(session, noteId, messageId, emoji, on);
    } catch (reason) {
      setReactions(before);
      setFailure(reason instanceof Error ? reason.message : "Couldn't save that reaction");
    }
  }

  /* ── Naming people ─────────────────────────────────────────────────── */

  const offered = useMemo(() => {
    if (suggesting === null) return [];
    const wanted = suggesting.toLocaleLowerCase();
    return members
      .filter((m) => m.userId !== session.userId && m.name.toLocaleLowerCase().startsWith(wanted))
      .slice(0, 5);
  }, [suggesting, members, session.userId]);

  /** An emoji where the caret is, and the caret after it. */
  function insertEmoji(emoji: string) {
    const field = composerRef.current;
    const start = field?.selectionStart ?? draft.length;
    const end = field?.selectionEnd ?? draft.length;
    setDraft(`${draft.slice(0, start)}${emoji}${draft.slice(end)}`);
    requestAnimationFrame(() => {
      field?.focus();
      field?.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  }

  function pickMention(name: string) {
    const field = composerRef.current;
    const caret = field?.selectionStart ?? draft.length;
    const start = draft.slice(0, caret).lastIndexOf("@");
    if (start < 0) return;
    setDraft(`${draft.slice(0, start)}@${name} ${draft.slice(caret)}`);
    setSuggesting(null);
  }

  function words(message: ChatMessage) {
    const named = members.filter((member) => message.mentions.includes(member.userId));
    if (named.length === 0) return message.body;
    const pattern = new RegExp(
      `(@(?:${named
        .map((member) => member.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .sort((a, b) => b.length - a.length)
        .join("|")}))`,
      "giu",
    );
    return message.body.split(pattern).map((part, index) =>
      index % 2 === 1 ? (
        <span key={index} className="chat-mention">
          {part}
        </span>
      ) : (
        part
      ),
    );
  }

  /* ── Enlarging ─────────────────────────────────────────────────────── */

  const from = useRef<DOMRect | null>(null);

  function enlarge() {
    from.current = columnRef.current?.getBoundingClientRect() ?? null;
    setExpanded(true);
  }

  /* The column's own rectangle opening out into the sheet. The surface is
     clipped rather than scaled, so nothing in it is ever stretched; what is
     inside waits for it to have room and then arrives. */
  useLayoutEffect(() => {
    const sheet = sheetRef.current;
    const start = from.current;
    if (!expanded || !sheet || !start || reduced()) return;
    const end = sheet.getBoundingClientRect();
    const inset = `inset(${start.top - end.top}px ${end.right - start.right}px ${end.bottom - start.bottom}px ${start.left - end.left}px round 0px)`;
    sheet.animate([{ clipPath: inset }, { clipPath: "inset(0px round 16px)" }], {
      duration: SHAPE,
      easing: EASE,
    });
    sheet.querySelector(".chat-inner")?.animate(
      [
        { opacity: 0, transform: "translateY(6px)" },
        { opacity: 1, transform: "none" },
      ],
      { duration: 260, delay: 150, easing: EASE_OUT, fill: "backwards" },
    );
    composerRef.current?.focus();
  }, [expanded]);

  const shrink = useCallback(() => {
    const sheet = sheetRef.current;
    const end = columnRef.current?.getBoundingClientRect();
    if (!sheet || !end || reduced()) return setExpanded(false);
    const start = sheet.getBoundingClientRect();
    const inset = `inset(${end.top - start.top}px ${start.right - end.right}px ${start.bottom - end.bottom}px ${end.left - start.left}px round 0px)`;
    sheet.closest(".chat-layer")?.classList.add("is-closing");
    sheet.querySelector(".chat-inner")?.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: OVERLAY_OUT.duration,
      easing: OVERLAY_OUT.easing,
      fill: "forwards",
    });
    sheet
      .animate([{ clipPath: "inset(0px round 16px)" }, { clipPath: inset }], {
        duration: SHAPE * 0.8,
        easing: EASE,
        fill: "forwards",
      })
      .finished.then(() => setExpanded(false))
      .catch(() => setExpanded(false));
  }, []);

  useEffect(() => {
    if (!expanded) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || reacting || menuFor || editing) return;
      event.stopPropagation();
      shrink();
    };
    window.addEventListener("keydown", escape, true);
    return () => window.removeEventListener("keydown", escape, true);
  }, [expanded, shrink, reacting, menuFor, editing]);

  /* ── Drawing ───────────────────────────────────────────────────────── */

  const faces = members.filter((member) => member.userId !== session.userId).slice(0, 4);

  function message(m: ChatMessage, index: number) {
    const previous = messages[index - 1];
    const next = messages[index + 1];
    const mine = m.authorId === session.userId;
    const newDay = !previous || dayOf(previous.createdAt) !== dayOf(m.createdAt);
    const joins = (a?: ChatMessage, b?: ChatMessage) =>
      Boolean(
        a &&
        b &&
        a.authorId === b.authorId &&
        dayOf(a.createdAt) === dayOf(b.createdAt) &&
        Math.abs(Date.parse(b.createdAt) - Date.parse(a.createdAt)) < GROUP_GAP,
      );
    const first = !joins(previous, m);
    const last = !joins(m, next);
    const author = authors.get(m.authorId);
    const name = author?.name || "Someone";
    const quote = m.threadId !== noteId ? quotes.get(m.threadId) : undefined;
    const showQuote = quote && (first || previous?.threadId !== m.threadId);
    /* A few emoji and nothing else are said large and without a bubble. */
    const jumbo = !showQuote && editing !== m.id && JUMBO.test(m.body.trim());
    const counted = tally(reactions, m.id, session.userId);
    const motion =
      keys.current.has(m.id) || m.sending ? "is-sent" : arrived.has(m.id) ? "is-received" : "";

    return (
      <div key={keys.current.get(m.id) ?? m.id} className="chat-row-wrap">
        {newDay && (
          <div className="chat-day" role="separator">
            <span>{dayLabel(m.createdAt)}</span>
          </div>
        )}
        <div
          data-message={m.id}
          className={`chat-row ${mine ? "is-mine" : "is-theirs"} ${first ? "is-first" : ""} ${
            last ? "is-last" : ""
          } ${motion} ${m.sending ? "is-sending" : ""} ${m.failed ? "is-failed" : ""}`}
        >
          {first && (
            <div className="chat-sender">
              {!mine && <span className="chat-sender-name">{name}</span>}
              <time className="readout" dateTime={m.createdAt}>
                {clock(m.createdAt)}
              </time>
            </div>
          )}
          <div className="chat-line">
            {!mine && (
              <span className="chat-face">
                {last && <Avatar url={author?.avatarUrl ?? null} name={name} email="" compact />}
              </span>
            )}
            {jumbo ? (
              <span className="chat-jumbo">{m.body.trim()}</span>
            ) : (
              <ChatBubble bubble={m.bubble} mine={mine} bare={!last}>
                {showQuote && (
                  <button
                    type="button"
                    className="chat-quote"
                    onClick={() => onReveal(m.threadId)}
                    title="Show in the note"
                  >
                    {quote}
                  </button>
                )}
                {editing === m.id ? (
                  <textarea
                    className="chat-edit"
                    value={editDraft}
                    autoFocus
                    rows={Math.min(6, editDraft.split("\n").length)}
                    aria-label="Edit message"
                    onChange={(event) => setEditDraft(event.target.value)}
                    onBlur={() => void saveEdit(m)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.stopPropagation();
                        setEditing(null);
                      } else if (
                        event.key === "Enter" &&
                        !event.shiftKey &&
                        !event.nativeEvent.isComposing
                      ) {
                        event.preventDefault();
                        void saveEdit(m);
                      }
                    }}
                  />
                ) : (
                  <span className="chat-words">{words(m)}</span>
                )}
              </ChatBubble>
            )}
            {!m.sending && !m.failed && editing !== m.id && (
              <>
                <div
                  className="chat-tools"
                  data-open={reacting === m.id || menuFor === m.id || undefined}
                >
                  {canEdit && (
                    <button
                      type="button"
                      className="chat-tool press"
                      aria-label="React"
                      title="React"
                      aria-expanded={reacting === m.id}
                      onClick={(event) => {
                        /* Above the bubble, unless that is off the top of the column. */
                        const scroller = scrollRef.current?.getBoundingClientRect();
                        const line = event.currentTarget
                          .closest(".chat-line")
                          ?.getBoundingClientRect();
                        setTapBelow(Boolean(scroller && line && line.top - scroller.top < 56));
                        setReacting((open) => (open === m.id ? null : m.id));
                      }}
                    >
                      <Smile size={15} />
                    </button>
                  )}
                  <button
                    type="button"
                    className="chat-tool press"
                    aria-label="More"
                    title="More"
                    aria-expanded={menuFor === m.id}
                    onClick={(event) => {
                      const scroller = scrollRef.current?.getBoundingClientRect();
                      const at = event.currentTarget.getBoundingClientRect();
                      setMenuUp(Boolean(scroller && at.top > scroller.top + scroller.height / 2));
                      setMenuFor((open) => (open === m.id ? null : m.id));
                    }}
                  >
                    <MoreHorizontal size={15} />
                  </button>
                </div>
                {menuFor === m.id && (
                  <div
                    className={`chat-menu popover ${menuUp ? "is-above" : ""}`}
                    ref={menuRef}
                    role="menu"
                  >
                    {reporting === m.id ? (
                      <SafetyActions noteId={noteId} userId={m.authorId} commentId={m.id} compact />
                    ) : (
                      <>
                        {quote && canEdit && (
                          <button
                            type="button"
                            role="menuitem"
                            className="menu-row press"
                            onClick={() => {
                              closeMenu();
                              setAbout(m.threadId);
                              composerRef.current?.focus();
                            }}
                          >
                            <Quote size={15} />
                            Reply about this passage
                          </button>
                        )}
                        {mine && (
                          <button
                            type="button"
                            role="menuitem"
                            className="menu-row press"
                            onClick={() => {
                              closeMenu();
                              setEditing(m.id);
                              setEditDraft(m.body);
                            }}
                          >
                            <Pencil size={15} />
                            Edit
                          </button>
                        )}
                        {mine && (
                          <button
                            type="button"
                            role="menuitem"
                            className="menu-row press is-danger"
                            onClick={() => void remove(m)}
                          >
                            <Trash2 size={15} />
                            Delete
                          </button>
                        )}
                        {!mine && (
                          <button
                            type="button"
                            role="menuitem"
                            className="menu-row press"
                            onClick={() => setReporting(m.id)}
                          >
                            <Flag size={15} />
                            Report
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </>
            )}
            {reacting === m.id && (
              <div
                className={`chat-tapback ${tapBelow ? "is-below" : ""}`}
                ref={reactRef}
                role="menu"
              >
                {quickReactions.map((emoji, at) => {
                  const on = counted.some((one) => one.emoji === emoji && one.mine);
                  return (
                    <button
                      key={emoji}
                      type="button"
                      role="menuitemcheckbox"
                      aria-checked={on}
                      className={`chat-tapback-emoji ${on ? "is-on" : ""}`}
                      style={{ "--at": at } as CSSProperties}
                      onClick={() => void react(m.id, emoji, !on)}
                    >
                      {emoji}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          {counted.length > 0 && (
            <div className="chat-reactions">
              {counted.map(({ emoji, count, mine: ownReaction }) => (
                <button
                  key={emoji}
                  type="button"
                  className={`chat-reaction press ${ownReaction ? "is-mine" : ""}`}
                  disabled={!canEdit}
                  aria-pressed={ownReaction}
                  title={reactions
                    .filter((r) => r.commentId === m.id && r.emoji === emoji)
                    .map((r) =>
                      r.userId === session.userId
                        ? "You"
                        : authors.get(r.userId)?.name || "Someone",
                    )
                    .join(", ")}
                  onClick={() => void react(m.id, emoji, !ownReaction)}
                >
                  <span>{emoji}</span>
                  {count > 1 && <span className="readout">{count}</span>}
                </button>
              ))}
            </div>
          )}
          {m.failed && (
            <button type="button" className="chat-retry press" onClick={() => void send(m)}>
              Not sent · Retry
            </button>
          )}
        </div>
      </div>
    );
  }

  const inner = (
    <div className="chat-inner">
      <header className="chat-header">
        <span className="chat-title">Chat</span>
        {faces.length > 0 && (
          <span className="chat-faces" aria-label={faces.map((face) => face.name).join(", ")}>
            {faces.map((face) => (
              <Avatar key={face.userId} url={face.avatarUrl} name={face.name} email="" compact />
            ))}
          </span>
        )}
        <span className="chat-header-tools">
          <button
            type="button"
            className="chat-tool press"
            aria-label={expanded ? "Make smaller" : "Enlarge"}
            title={expanded ? "Make smaller" : "Enlarge"}
            onClick={expanded ? shrink : enlarge}
          >
            {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
          <button
            type="button"
            className="chat-tool press"
            aria-label="Close chat"
            title="Close chat"
            onClick={expanded ? () => (shrink(), onClose()) : onClose}
          >
            <X size={16} />
          </button>
        </span>
      </header>

      {failure && (
        <p role="alert" className="chat-failure">
          {failure}
        </p>
      )}

      <div
        className="chat-scroll"
        ref={scrollRef}
        onScroll={onScroll}
        onWheel={byHand}
        onTouchMove={byHand}
        onKeyDown={byHand}
        onPointerDown={byHand}
      >
        {loading ? (
          <p className="chat-quiet">Loading…</p>
        ) : messages.length === 0 ? (
          <div className="chat-empty">
            <ChatBubble bubble={myBubble} mine>
              Say hi 👋
            </ChatBubble>
          </div>
        ) : (
          <div className="chat-stream">{messages.map(message)}</div>
        )}
      </div>

      {unseen > 0 && (
        <button
          type="button"
          className="chat-unseen press"
          onClick={() =>
            scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
          }
        >
          <ChevronDown size={14} />
          {unseen === 1 ? "New message" : `${unseen} new messages`}
        </button>
      )}

      {canEdit && (
        <div className="chat-composer">
          {about && aboutQuote && (
            <div className="chat-about">
              <Quote size={13} />
              <span className="chat-about-words">{aboutQuote}</span>
              <button
                type="button"
                className="chat-tool press"
                aria-label="Not about this passage"
                onClick={dropAbout}
              >
                <X size={13} />
              </button>
            </div>
          )}
          {offered.length > 0 && (
            <div className="chat-suggestions popover" role="listbox">
              {offered.map((member, index) => (
                <button
                  key={member.userId}
                  type="button"
                  role="option"
                  aria-selected={index === 0}
                  className="menu-row press"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    pickMention(member.name);
                  }}
                >
                  <Avatar url={member.avatarUrl} name={member.name} email="" compact />
                  {member.name}
                </button>
              ))}
            </div>
          )}
          <div className="chat-compose-row">
            <div className="chat-field">
              <textarea
                ref={composerRef}
                rows={1}
                value={draft}
                placeholder="Message"
                aria-label="Message"
                onChange={(event) => {
                  setDraft(event.target.value);
                  setSuggesting(mentionQuery(event.target.value, event.target.selectionStart ?? 0));
                }}
                onKeyDown={(event) => {
                  if (offered.length > 0 && (event.key === "Enter" || event.key === "Tab")) {
                    event.preventDefault();
                    pickMention(offered[0]!.name);
                    return;
                  }
                  if (event.key === "Escape" && suggesting !== null) {
                    event.stopPropagation();
                    setSuggesting(null);
                    return;
                  }
                  /* Enter sends; Shift+Enter is a new line. While an input method
                   is mid-word, Enter accepts the word, not the message. */
                  if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing)
                    return;
                  event.preventDefault();
                  void send();
                }}
              />
              <button
                type="button"
                className="chat-send press"
                aria-label="Send"
                data-ready={draft.trim() ? "" : undefined}
                disabled={!draft.trim()}
                onClick={() => void send()}
              >
                <ArrowUp size={16} stroke={2.4} />
              </button>
            </div>
            {/* iMessage's place for it: beside the field, outside it. */}
            <span className="chat-emoji-slot">
              <button
                type="button"
                className={`chat-tool chat-emoji-button press ${picking ? "is-open" : ""}`}
                aria-label="Emoji"
                title="Emoji"
                aria-expanded={picking}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setPicking((open) => !open)}
              >
                <Smile size={19} />
              </button>
              {picking && (
                <div
                  ref={pickerRef}
                  className="emoji-picker popover is-above"
                  role="dialog"
                  aria-label="Emoji"
                >
                  <EmojiPicker chosen={[]} onPick={insertEmoji} />
                </div>
              )}
            </span>
          </div>
        </div>
      )}
    </div>
  );

  /* The passage of the message being written is lit in the text, as the
     open thread used to be. A rule aimed at that mark rather than a class on
     ProseMirror's span, which its next redraw would drop. */
  const lit = about && /^[a-zA-Z0-9-]+$/.test(about) ? about : null;
  const light = lit && (
    <style>{`.rich-text-content span[data-comment-thread="${lit}"]{background:color-mix(in srgb,var(--accent) 24%,transparent);border-bottom-color:var(--accent);border-bottom-style:solid}`}</style>
  );

  return (
    <aside
      ref={columnRef}
      className={`note-comments chat ${expanded ? "is-away" : ""}`}
      aria-label="Chat about this note"
    >
      {light}
      {expanded ? (
        <>
          <header className="chat-header">
            <span className="chat-title">Chat</span>
          </header>
          {createPortal(
            <div className="chat-layer" role="presentation">
              <button
                type="button"
                className="chat-scrim"
                aria-label="Make smaller"
                onClick={shrink}
              />
              {/* The shadow is drawn by the frame from what the sheet shows,
                  so it follows the surface while it is still changing shape. */}
              <div className="chat-sheet-frame">
                <section
                  ref={sheetRef}
                  className="chat chat-sheet"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Chat"
                >
                  {inner}
                </section>
              </div>
            </div>,
            document.body,
          )}
        </>
      ) : (
        inner
      )}
    </aside>
  );
}
