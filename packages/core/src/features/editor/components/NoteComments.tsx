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
  Copy,
  Flag,
  Maximize2,
  Minimize2,
  NotebookText,
  Pencil,
  Quote,
  Reply,
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
  type MouseEvent as ReactMouseEvent,
} from "react";
import { createPortal } from "react-dom";
import { PointMenu } from "@/components/ContextMenu";
import { SafetyActions } from "@/components/SafetyActions";
import type { MenuPoint } from "@/lib/contextMenu";
import type { MenuItem } from "@/lib/menuShape";
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
import { mentionQuery, mentionedIn, noteQuery, tally, type NoteRef } from "@/lib/commentThreads";
import { EASE, EASE_OUT, OVERLAY_OUT, SHAPE } from "@/lib/motion";
import type { AppSession } from "@/lib/session";
import { subscribeToArchiveChat, subscribeToComments, unsubscribeFromArchive } from "@/lib/sync";
import { useWritingPreferences } from "@/lib/writingPreferences";
import { EmojiPicker } from "@/components/ChatSettings";
import { ChatBubble } from "./ChatBubble";
import "./chat.css";

/** The clip that shows only `rect` of `box`. A rectangle outside the sheet —
 *  the rail control the general chat opens from — is brought to the sheet's
 *  nearest edge: negative insets drew a stray strip that then snapped open. */
function clipTo(rect: DOMRect, box: DOMRect) {
  const x = (v: number) => Math.min(Math.max(v, box.left), box.right);
  const y = (v: number) => Math.min(Math.max(v, box.top), box.bottom);
  return `inset(${y(rect.top) - box.top}px ${box.right - x(rect.right)}px ${
    box.bottom - y(rect.bottom)
  }px ${x(rect.left) - box.left}px round 0px)`;
}

export interface CommentAuthor {
  userId: string;
  name: string;
  avatarUrl: string | null;
}

interface Props {
  session: AppSession;
  /** The note this chat is about — or, for the general chat, the archive. */
  noteId: string;
  /** The archive's general chat: about no note, opened as a sheet from where
   *  it was asked for, and gone when it closes. */
  general?: { origin: DOMRect | null };
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
  /** General chat: the notes "#" can name. */
  notes?: { id: string; title: string }[];
  /** General chat: a passage brought over from a note to be talked about. */
  quoteDraft?: NoteRef | null;
  /** General chat: go to a note a message talks about. */
  onOpenNote?: (ref: NoteRef) => void;
}

const titled = (title: string) => title.trim() || "Untitled";

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
  general,
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
  notes,
  quoteDraft,
  onOpenNote,
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
  /** A message's menu, where it was asked for: the same list for a
   *  right-click and for the ⋯ beside the bubble. */
  const [menu, setMenu] = useState<(MenuPoint & { id: string }) | null>(null);
  const menuFor = menu?.id ?? null;
  /** The report form opens upwards when its message is low in the column. */
  const [reportUp, setReportUp] = useState(false);
  /** The message the next one answers, if any — yours as much as anyone's. */
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [tapBelow, setTapBelow] = useState(false);
  const [picking, setPicking] = useState(false);
  const [reporting, setReporting] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState<string | null>(null);
  /** General chat: the passage the next message quotes, and the notes it names. */
  const [quoted, setQuoted] = useState<NoteRef | null>(quoteDraft ?? null);
  const [noteChips, setNoteChips] = useState<NoteRef[]>([]);
  const [findingNote, setFindingNote] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(Boolean(general));
  /** What the calls below read and write: a note's chat, or (null) the
   *  archive's general one. */
  const isGeneral = Boolean(general);
  const source = isGeneral ? null : noteId;
  /** Messages that arrived while this was open, to be seen arriving. */
  const [arrived, setArrived] = useState<ReadonlySet<string>>(() => new Set());
  const [unseen, setUnseen] = useState(0);

  const members = useMemo(() => [...authors.values()], [authors]);
  const closeReact = useCallback(() => setReacting(null), []);
  const closeMenu = useCallback(() => setMenu(null), []);
  const closeReport = useCallback(() => setReporting(null), []);
  const reactRef = useDismiss<HTMLDivElement>(reacting !== null, closeReact);
  const closePicker = useCallback(() => setPicking(false), []);
  const pickerRef = useDismiss<HTMLDivElement>(picking, closePicker);
  const reportRef = useDismiss<HTMLDivElement>(reporting !== null, closeReport);
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
  /** Messages whose arrival has been played. A bubble drawn again — the
   *  column enlarged into the sheet and back — is not arriving again. */
  const settled = useRef(new Set<string>());
  /** Reactions already shown, by message and emoji: only one given while
   *  the chat is open pops in; opening or enlarging it does not replay them. */
  const shownReactions = useRef<Set<string> | null>(null);

  /* ── Reading, and listening ─────────────────────────────────────────── */

  const read = useCallback(async () => {
    const [rows, given] = await Promise.all([
      loadComments(session, source),
      /* Reactions are a convenience over the conversation: failing to read
         them must not keep the messages from showing. */
      loadReactions(session, source).catch(() => null),
    ]);
    if (given) {
      shownReactions.current ??= new Set(given.map((r) => `${r.commentId}:${r.emoji}`));
      setReactions(given);
    }
    const fresh = known.current
      ? rows.filter((row) => !known.current!.has(row.id) && row.authorId !== session.userId)
      : [];
    const first = known.current === null;
    known.current = new Set(rows.map((row) => row.id));
    if (first) rows.forEach((row) => settled.current.add(row.id));
    if (fresh.length > 0) {
      setArrived((current) => new Set([...current, ...fresh.map((r) => r.id)]));
    }
    /* Opening the chat is reading it, not only a message arriving while it
       is open: a note already selected never passes through the list again. */
    if (first || fresh.length > 0) readRef.current?.();
    setMessages((current) => {
      /* Realtime can announce your own message before the insert has
         answered. The saved row takes the place of the bubble already on its
         way, under its key, instead of standing beside it for a moment and
         then replacing it — the doubling and the jump back were the bounce. */
      const waiting = current.filter((message) => message.sending || message.failed);
      for (const row of rows) {
        if (row.authorId !== session.userId || keys.current.has(row.id)) continue;
        const at = waiting.findIndex(
          (m) => m.sending && m.body === row.body && m.threadId === row.threadId,
        );
        if (at < 0) continue;
        keys.current.set(row.id, waiting[at]!.id);
        waiting.splice(at, 1);
      }
      /* Updaters may run twice; the second run finds the keys already set. */
      const placed = new Set(rows.map((row) => keys.current.get(row.id)));
      return [...rows, ...waiting.filter((m) => !placed.has(m.id))];
    });
  }, [session, source]);

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
    const channel = (isGeneral ? subscribeToArchiveChat : subscribeToComments)(
      session.archiveId,
      () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => void read().catch(() => undefined), 250);
      },
    );
    return () => {
      live = false;
      window.clearTimeout(timer);
      void unsubscribeFromArchive(channel);
    };
  }, [session, read, isGeneral]);

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
  const replying = replyTo ? messages.find((m) => m.id === replyTo) : undefined;

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
      replyTo: replyTo && messages.some((m) => m.id === replyTo) ? replyTo : null,
      /* Only the notes still named in the words: a chip deleted while
         writing is not something the message is about. */
      refs: [
        ...(quoted ? [quoted] : []),
        ...noteChips.filter(
          (ref, at, all) =>
            body.includes(`#${ref.title}`) && all.findIndex((one) => one.note === ref.note) === at,
        ),
      ].slice(0, 8),
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
      setReplyTo(null);
      setQuoted(null);
      setNoteChips([]);
      setFindingNote(null);
    }
    try {
      const saved = await addComment(
        session,
        source,
        threadId,
        body,
        local.mentions,
        null,
        local.bubble ?? null,
        local.replyTo ?? null,
        local.refs ?? [],
      );
      /* Realtime may have put it in place already, under this same key. */
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
      const saved = await updateComment(
        session,
        message.id,
        body,
        mentionedIn(body, members),
        isGeneral,
      );
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
      await deleteComment(session, message.id, isGeneral);
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
      await setReaction(session, source, messageId, emoji, on);
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
    const chips = (message.refs ?? []).filter((ref) => !ref.quote && ref.title);
    const tokens = [
      ...named.map((member) => `@${member.name}`),
      ...chips.map((ref) => `#${ref.title}`),
    ];
    if (tokens.length === 0) return message.body;
    const pattern = new RegExp(
      `(${tokens
        .sort((a, b) => b.length - a.length)
        .map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("|")})`,
      "giu",
    );
    return message.body.split(pattern).map((part, index) => {
      if (index % 2 === 0) return part;
      const chip =
        part.startsWith("#") &&
        chips.find((ref) => `#${ref.title}`.toLocaleLowerCase() === part.toLocaleLowerCase());
      if (!chip)
        return (
          <span key={index} className="chat-mention">
            {part}
          </span>
        );
      return (
        <button
          key={index}
          type="button"
          className="chat-note-chip press"
          title={`Open ${titled(chip.title)}`}
          onClick={() => openNote(chip)}
        >
          <NotebookText size={12} />
          {part.slice(1)}
        </button>
      );
    });
  }

  /** A note a message talks about is still there to go to. */
  const reachable = (ref: NoteRef) => !notes || notes.some((note) => note.id === ref.note);

  /** To the note, and the sheet back where it came from while it opens. */
  function openNote(ref: NoteRef) {
    if (!onOpenNote || !reachable(ref)) return;
    onOpenNote(ref);
    if (isGeneral) shrink();
  }

  /* ── Naming notes ──────────────────────────────────────────────────── */

  const offeredNotes = useMemo(() => {
    if (findingNote === null || !notes) return [];
    const wanted = findingNote.toLocaleLowerCase();
    return notes
      .filter((note) => note.title.trim() && note.title.toLocaleLowerCase().includes(wanted))
      .slice(0, 5);
  }, [findingNote, notes]);

  function pickNote(note: { id: string; title: string }) {
    const field = composerRef.current;
    const caret = field?.selectionStart ?? draft.length;
    const start = draft.slice(0, caret).lastIndexOf("#");
    if (start < 0) return;
    const title = note.title.trim();
    const next = `${draft.slice(0, start)}#${title} ${draft.slice(caret)}`;
    setDraft(next);
    setNoteChips((current) => [...current, { note: note.id, title }]);
    setFindingNote(null);
    requestAnimationFrame(() => {
      field?.focus();
      field?.setSelectionRange(start + title.length + 2, start + title.length + 2);
    });
  }

  /* ── Enlarging ─────────────────────────────────────────────────────── */

  /** Where the sheet grows out of and goes back to: the column, or for the
   *  general chat the control that opened it. */
  const from = useRef<DOMRect | null>(general?.origin ?? null);
  const origin = general?.origin ?? null;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

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
    if (isGeneral) {
      /* The general chat zooms out of the control or passage that asked for
         it. Scale and opacity only, on the frame that carries the shadow: the
         compositor runs them, where an animated clip repainted the whole
         sheet every frame and stuttered in the desktop app's window. */
      const frame = sheet.parentElement;
      if (!frame) return;
      const box = frame.getBoundingClientRect();
      frame.style.transformOrigin = `${start.left + start.width / 2 - box.left}px ${
        start.top + start.height / 2 - box.top
      }px`;
      frame.animate(
        [
          { transform: "scale(0.6)", opacity: 0 },
          { opacity: 1, offset: 0.3 },
          { transform: "none", opacity: 1 },
        ],
        { duration: SHAPE, easing: EASE },
      );
      composerRef.current?.focus();
      return;
    }
    const inset = clipTo(start, sheet.getBoundingClientRect());
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
  }, [expanded, isGeneral]);

  const shrink = useCallback(() => {
    const sheet = sheetRef.current;
    /* The general chat has no column to go back into: it closes into where
       it came from, and then it is gone. */
    const done = isGeneral ? () => closeRef.current() : () => setExpanded(false);
    const end = isGeneral ? origin : columnRef.current?.getBoundingClientRect();
    if (!sheet || !end || reduced()) return done();
    const layer = sheet.closest(".chat-layer");
    layer?.classList.add("is-closing");
    if (isGeneral && sheet.parentElement) {
      /* Back into where it came from, whole: the words go with the surface,
         so it never shrinks as an empty box. The scrim keeps its time. */
      const away = { duration: SHAPE * 0.6, easing: OVERLAY_OUT.easing, fill: "forwards" } as const;
      layer?.querySelector(".chat-scrim")?.animate([{ opacity: 1 }, { opacity: 0 }], away);
      sheet.parentElement
        .animate(
          [
            { transform: "none", opacity: 1 },
            { opacity: 1, offset: 0.5 },
            { transform: "scale(0.6)", opacity: 0 },
          ],
          away,
        )
        .finished.then(done)
        .catch(done);
      return;
    }
    const inset = clipTo(end, sheet.getBoundingClientRect());
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
      .finished.then(done)
      .catch(done);
  }, [isGeneral, origin]);

  useEffect(() => {
    if (!expanded) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || reacting || menuFor || reporting || editing) return;
      event.stopPropagation();
      shrink();
    };
    window.addEventListener("keydown", escape, true);
    return () => window.removeEventListener("keydown", escape, true);
  }, [expanded, shrink, reacting, menuFor, reporting, editing]);

  /* ── A message's menu ──────────────────────────────────────────────── */

  function openMenu(m: ChatMessage, point: MenuPoint) {
    if (m.sending || m.failed || editing === m.id) return;
    setReacting(null);
    setReporting(null);
    setMenu({ ...point, id: m.id });
  }

  /** Right-click on a message is its menu. Anywhere else in the chat the
   *  note's own menu must not answer: the chat is not the page. The field
   *  keeps the browser's menu, for spelling and paste. */
  function onChatContextMenu(event: ReactMouseEvent) {
    event.stopPropagation();
    const target = event.target as HTMLElement;
    if (target.closest("textarea, input")) return;
    event.preventDefault();
    const id = target.closest<HTMLElement>("[data-message]")?.dataset.message;
    const m = id ? messages.find((one) => one.id === id) : undefined;
    if (m) openMenu(m, { x: event.clientX, y: event.clientY });
  }

  function replyToMessage(m: ChatMessage) {
    setReplyTo(m.id);
    /* An answer to something said about a passage is about that passage too. */
    if (m.threadId !== noteId && quotes.has(m.threadId)) setAbout(m.threadId);
    composerRef.current?.focus();
  }

  function menuItems(m: ChatMessage): MenuItem[] {
    const mine = m.authorId === session.userId;
    const items: MenuItem[] = [];
    if (canEdit) {
      items.push({
        kind: "item",
        id: "chat-reply",
        label: mine ? "Reply to yourself" : "Reply",
        icon: <Reply size={16} />,
        run: () => replyToMessage(m),
      });
      items.push({
        kind: "item",
        id: "chat-react",
        label: "React",
        icon: <Smile size={16} />,
        run: () => {
          const line = scrollRef.current?.querySelector(`[data-message="${m.id}"] .chat-line`);
          const box = scrollRef.current?.getBoundingClientRect();
          const at = line?.getBoundingClientRect();
          setTapBelow(Boolean(box && at && at.top - box.top < 56));
          setReacting(m.id);
        },
      });
    }
    items.push({
      kind: "item",
      id: "chat-copy",
      label: "Copy",
      icon: <Copy size={16} />,
      run: () => void navigator.clipboard?.writeText(m.body).catch(() => undefined),
    });
    if (mine) {
      items.push(
        { kind: "separator" },
        {
          kind: "item",
          id: "chat-edit",
          label: "Edit",
          icon: <Pencil size={16} />,
          run: () => {
            setEditing(m.id);
            setEditDraft(m.body);
          },
        },
        {
          kind: "item",
          id: "chat-delete",
          label: "Delete",
          danger: true,
          icon: <Trash2 size={16} />,
          run: () => void remove(m),
        },
      );
    } else {
      items.push(
        { kind: "separator" },
        {
          kind: "item",
          id: "chat-report",
          label: "Report",
          icon: <Flag size={16} />,
          run: () => {
            const row = scrollRef.current?.querySelector(`[data-message="${m.id}"]`);
            const box = scrollRef.current?.getBoundingClientRect();
            const at = row?.getBoundingClientRect();
            setReportUp(Boolean(box && at && at.top > box.top + box.height / 2));
            setReporting(m.id);
          },
        },
      );
    }
    return items;
  }

  const menuMessage = menu ? messages.find((m) => m.id === menu.id) : undefined;

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
    const key = keys.current.get(m.id) ?? m.id;
    const motion = settled.current.has(key)
      ? ""
      : keys.current.has(m.id) || m.sending
        ? "is-sent"
        : arrived.has(m.id)
          ? "is-received"
          : "";
    const answered = m.replyTo ? messages.find((one) => one.id === m.replyTo) : undefined;
    const answeredName = answered
      ? answered.authorId === session.userId
        ? "You"
        : authors.get(answered.authorId)?.name || "Someone"
      : "";

    return (
      <div key={key} className="chat-row-wrap">
        {newDay && (
          <div className="chat-day" role="separator">
            <span>{dayLabel(m.createdAt)}</span>
          </div>
        )}
        <div
          data-message={m.id}
          className={`chat-row ${mine ? "is-mine" : "is-theirs"} ${first ? "is-first" : ""} ${
            last ? "is-last" : ""
          } ${motion} ${m.sending ? "is-sending" : ""} ${m.failed ? "is-failed" : ""} ${
            menuFor === m.id ? "is-menu" : ""
          }`}
          onAnimationEnd={(event) => {
            /* Played once: the animal is the last thing to arrive. */
            if (
              event.animationName === "chat-piece" ||
              !event.currentTarget.querySelector(".chat-bubble-piece")
            )
              settled.current.add(key);
          }}
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
            {jumbo && !answered ? (
              <span className="chat-jumbo">{m.body.trim()}</span>
            ) : (
              <ChatBubble bubble={m.bubble} mine={mine} bare={!last}>
                {answered && (
                  <button
                    type="button"
                    className="chat-replied"
                    title="Show the message this answers"
                    onClick={() => {
                      const node = scrollRef.current?.querySelector<HTMLElement>(
                        `[data-message="${answered.id}"]`,
                      );
                      if (!node) return;
                      node.scrollIntoView({
                        block: "center",
                        behavior: reduced() ? "auto" : "smooth",
                      });
                      node.classList.remove("is-arrived");
                      void node.offsetWidth;
                      node.classList.add("is-arrived");
                    }}
                  >
                    <span className="chat-replied-name">{answeredName}</span>
                    <span className="chat-replied-words">{answered.body}</span>
                  </button>
                )}
                {m.refs
                  ?.filter((ref) => ref.quote)
                  .map((ref) => (
                    <button
                      key={`${ref.note}:${ref.quote}`}
                      type="button"
                      className="chat-note-quote"
                      title={`Show in ${titled(ref.title)}`}
                      onClick={() => openNote(ref)}
                      aria-disabled={!reachable(ref) || undefined}
                    >
                      <span className="chat-note-quote-title">
                        <NotebookText size={12} />
                        {titled(ref.title)}
                      </span>
                      <span className="chat-note-quote-words">{ref.quote}</span>
                    </button>
                  ))}
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
                  {canEdit && (
                    <button
                      type="button"
                      className="chat-tool press"
                      aria-label={m.authorId === session.userId ? "Reply to yourself" : "Reply"}
                      title="Reply"
                      onClick={() => replyToMessage(m)}
                    >
                      <Reply size={15} />
                    </button>
                  )}
                </div>
                {reporting === m.id && (
                  <div
                    className={`chat-menu popover ${reportUp ? "is-above" : ""}`}
                    ref={reportRef}
                    role="dialog"
                    aria-label="Report"
                  >
                    <SafetyActions
                      noteId={isGeneral ? undefined : noteId}
                      userId={m.authorId}
                      commentId={m.id}
                      compact
                    />
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
                  className={`chat-reaction press ${ownReaction ? "is-mine" : ""} ${
                    shownReactions.current?.has(`${m.id}:${emoji}`) ? "" : "is-new"
                  }`}
                  onAnimationEnd={(event) => {
                    event.stopPropagation();
                    shownReactions.current?.add(`${m.id}:${emoji}`);
                  }}
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
        <span className="chat-title">{isGeneral ? "General chat" : "Chat"}</span>
        {faces.length > 0 && (
          <span className="chat-faces" aria-label={faces.map((face) => face.name).join(", ")}>
            {faces.map((face) => (
              <Avatar key={face.userId} url={face.avatarUrl} name={face.name} email="" compact />
            ))}
          </span>
        )}
        <span className="chat-header-tools">
          {!isGeneral && (
            <button
              type="button"
              className="chat-tool press"
              aria-label={expanded ? "Make smaller" : "Enlarge"}
              title={expanded ? "Make smaller" : "Enlarge"}
              onClick={expanded ? shrink : enlarge}
            >
              {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          )}
          <button
            type="button"
            className="chat-tool press"
            aria-label="Close chat"
            title="Close chat"
            onClick={isGeneral ? shrink : expanded ? () => (shrink(), onClose()) : onClose}
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
          {replying && (
            <div className="chat-about chat-replying">
              <Reply size={13} />
              <span className="chat-about-words">
                <strong>
                  {replying.authorId === session.userId
                    ? "Yourself"
                    : authors.get(replying.authorId)?.name || "Someone"}
                </strong>{" "}
                {replying.body}
              </span>
              <button
                type="button"
                className="chat-tool press"
                aria-label="Not a reply"
                onClick={() => {
                  setReplyTo(null);
                  composerRef.current?.focus();
                }}
              >
                <X size={13} />
              </button>
            </div>
          )}
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
          {quoted && (
            <div className="chat-about chat-about-note">
              <NotebookText size={13} />
              <span className="chat-about-words">
                <strong>{titled(quoted.title)}</strong> {quoted.quote}
              </span>
              <button
                type="button"
                className="chat-tool press"
                aria-label="Not about this passage"
                onClick={() => {
                  setQuoted(null);
                  composerRef.current?.focus();
                }}
              >
                <X size={13} />
              </button>
            </div>
          )}
          {offeredNotes.length > 0 && (
            <div className="chat-suggestions popover" role="listbox" aria-label="Notes">
              {offeredNotes.map((note, index) => (
                <button
                  key={note.id}
                  type="button"
                  role="option"
                  aria-selected={index === 0}
                  className="menu-row press"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    pickNote(note);
                  }}
                >
                  <NotebookText size={16} />
                  <span className="chat-suggestion-title">{note.title}</span>
                </button>
              ))}
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
                  const caret = event.target.selectionStart ?? 0;
                  setSuggesting(mentionQuery(event.target.value, caret));
                  if (notes) setFindingNote(noteQuery(event.target.value, caret));
                }}
                onKeyDown={(event) => {
                  if (offeredNotes.length > 0 && (event.key === "Enter" || event.key === "Tab")) {
                    event.preventDefault();
                    pickNote(offeredNotes[0]!);
                    return;
                  }
                  if (event.key === "Escape" && findingNote !== null) {
                    event.stopPropagation();
                    setFindingNote(null);
                    return;
                  }
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

  const menuLayer = menu && menuMessage && (
    <PointMenu
      key={`${menu.x}:${menu.y}`}
      point={menu}
      items={menuItems(menuMessage)}
      close={closeMenu}
    />
  );

  const sheet = createPortal(
    <div className="chat-layer" role="presentation" onContextMenu={onChatContextMenu}>
      <button
        type="button"
        className="chat-scrim"
        aria-label={isGeneral ? "Close chat" : "Make smaller"}
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
          aria-label={isGeneral ? "General chat" : "Chat"}
        >
          {inner}
        </section>
      </div>
    </div>,
    document.body,
  );

  if (isGeneral)
    return (
      <>
        {menuLayer}
        {sheet}
      </>
    );

  return (
    <aside
      ref={columnRef}
      className={`note-comments chat ${expanded ? "is-away" : ""}`}
      aria-label="Chat about this note"
      /* The sheet is portalled, but its events still come through here. */
      onContextMenu={onChatContextMenu}
    >
      {light}
      {menuLayer}
      {expanded ? (
        <>
          <header className="chat-header">
            <span className="chat-title">Chat</span>
          </header>
          {sheet}
        </>
      ) : (
        inner
      )}
    </aside>
  );
}
