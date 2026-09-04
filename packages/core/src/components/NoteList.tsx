import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { useDraggable } from "@dnd-kit/core";
import {
  Archive,
  ArchiveRestore,
  ChevronRight,
  FileText,
  FolderInput,
  Image as ImageIcon,
  ImageOff,
  ListChecks,
  Lock,
  LockOpen,
  Paperclip,
  Pin,
  RotateCcw,
  Camera,
  Search,
  SquarePen,
  Table2,
  Trash2,
  X,
} from "lucide-react";
import type { Meta, NoteLock } from "@/lib/types";
import { AvatarCropper } from "./AvatarCropper";
import type { AvatarCrop } from "@/lib/image";
import { useStoredImage } from "@/lib/media";
import { formatStamp } from "@/lib/format";
import { derivedOf, indexOf } from "@/lib/derived";
import {
  checklistProgress,
  documentGlyph,
  drawingInkBox,
  firstDrawing,
} from "@/features/editor/lib/content";
import type { NoteEntry } from "@/lib/entries";
import type { ListView, NoteGroup } from "@/lib/listPreferences";
import { ContextMenu } from "./ContextMenu";
import { useContextMenu } from "@/lib/contextMenu";
import { MenuButton } from "./WorkspaceMenus";

/** A row that has just been pushed open says so, and every other row closes.
 *  Announced rather than lifted into the list's state: this is a fact about a
 *  hand, it changes on every gesture, and passing it down would re-render the
 *  whole list to move one row. */
const CLOSE_OTHER_SWIPES = "napp:close-other-swipes";

const OPEN = 92;
/* Nothing happens at the end of a push, however long it is. A row uncovers
   its buttons and waits to be pressed — so travel past the open position is
   give and nothing else, and there is no distance at which the hand has
   committed to anything. 56 of give is enough to feel the row resist and
   not enough to look like a threshold that was missed. */
const MAX = OPEN + 56;
/* The clamp is not tidiness. A trackpad keeps sending decaying momentum
   after the fingers have lifted, so an unclamped flick travels half the
   column; clamped it arrives at the give and springs back to open. */
const clamp = (value: number) => Math.max(-MAX, Math.min(MAX, value));

export interface ActiveFilter {
  id: string;
  label: string;
  onClear: () => void;
}

interface Props {
  mobile?: boolean;
  entries: NoteEntry[];
  groups?: NoteGroup[];
  view?: ListView;
  toolbarActions?: ReactNode;
  /** Row above the collection header — the archive switch, the pane toggle. */
  topBar?: ReactNode;
  /** Row below the list — where Settings and the lock stand. */
  footer?: ReactNode;
  /** Scope and tag narrowing currently in force, each one dismissible. */
  filters?: ActiveFilter[];
  meta: Meta;
  selectedId: string | null;
  query: string;
  loading: boolean;
  busy: boolean;
  canWrite: boolean;
  folderLabel: string;
  /** Whose notes these are, when they are not yours. The switch is portraits
   *  now and says no names, so the tally under the folder carries the member —
   *  a readout, which is what that line already is. */
  scopeLabel?: string;
  trashMode: boolean;
  archiveMode: boolean;
  /** Notes carrying a remark the reader has not seen. The badge in the sidebar
   *  says how many are waiting; this is what says which. Without it the count
   *  is a number with nothing under it, and the honest answer to "I have read
   *  them all" is a note nobody could find. */
  unreadIds?: Set<string>;
  searchRef: React.RefObject<HTMLInputElement | null>;
  onQueryChange: (q: string) => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onMoveToTrash: (entry: NoteEntry) => void;
  onRestore: (entry: NoteEntry) => void;
  onArchiveChange: (entry: NoteEntry, archived: boolean) => void;
  onDeleteForever: (entry: NoteEntry) => void;
  onTogglePin: (noteId: string) => void;
  /** Absent where locking is not on offer. */
  lockOf?: (noteId: string) => NoteLock | undefined;
  onMoveToFolder: (noteId: string, folderId: string | null) => void;
  /** A picture for the note itself. A null file takes the current one off. */
  onSetPhoto: (noteId: string, file: File | null, crop?: AvatarCrop) => void;
  resolveImage: (objectId: string) => Promise<Blob>;
}

/* ── What a note is, at a glance ─────────────────────────────────────────────
   The rows used to lead with their position in the sort, which is a number
   about the list rather than about the note. A glyph says what you are about to
   open — a checklist, a note with a picture in it, a note carrying a file — the
   way the sidebar's glyphs say what a scope is. Same alphabet in both columns,
   so the two read as one interface. ──────────────────────────────────────── */
const COLLAPSED_GROUPS_KEY = "napp:note-groups-closed";

function loadCollapsedGroups(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSED_GROUPS_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

const GLYPHS = {
  attachment: { icon: Paperclip, label: "Has an attachment" },
  image: { icon: ImageIcon, label: "Has a picture" },
  checklist: { icon: ListChecks, label: "Checklist" },
  table: { icon: Table2, label: "Has a table" },
  text: { icon: FileText, label: "Note" },
} as const;

/* The catalogue. Titles here are never truncated to one line: the real corpus
   names notes things like "MAPPA 5: SK GROUP (il chaebol che ha catturato i
   pezzi giusti)", and a list that cuts that at 30 characters throws away the
   naming scheme its owner built. Three lines, then it stops. */

const Row = memo(function Row({
  mobile,
  gallery,
  entry,
  meta,
  selected,
  unread,
  onSelect,
  trashMode,
  archiveMode,
  canWrite,
  onMoveToTrash,
  onRestore,
  onArchiveChange,
  onDeleteForever,
  onTogglePin,
  onContextMenu,
  resolveImage,
}: {
  mobile: boolean;
  gallery: boolean;
  entry: NoteEntry;
  meta: Meta;
  selected: boolean;
  unread: boolean;
  trashMode: boolean;
  archiveMode: boolean;
  canWrite: boolean;
  /* Every handler takes the entry it acts on, so the parent can pass one stable
     function per action instead of minting a closure per row per render. */
  onSelect: (entry: NoteEntry) => void;
  onMoveToTrash: (entry: NoteEntry) => void;
  onRestore: (entry: NoteEntry) => void;
  onArchiveChange: (entry: NoteEntry, archived: boolean) => void;
  onDeleteForever: (entry: NoteEntry) => void;
  onTogglePin: (entry: NoteEntry) => void;
  onContextMenu: (event: ReactMouseEvent, entry: NoteEntry) => void;
  resolveImage: (objectId: string) => Promise<Blob>;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: entry.note.id,
    disabled: mobile || trashMode || archiveMode || !canWrite,
  });
  const rowRef = useRef<HTMLDivElement>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [slid, setSlid] = useState(0);
  /* Following a hand and settling afterwards are two motions and want two
     curves. Without this the row snapped to its open position at the end of
     every gesture, which is the one frame that says whether it was caught. */
  const [dragging, setDragging] = useState(false);

  const noteMeta = indexOf(meta).byNote.get(entry.note.id);

  useEffect(() => {
    if (selected) rowRef.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  useEffect(() => {
    if (!confirmDelete) return;
    const timer = window.setTimeout(() => setConfirmDelete(false), 3000);
    return () => window.clearTimeout(timer);
  }, [confirmDelete]);

  /* ── The swipe ──────────────────────────────────────────────────────────
     What Mail and Notes taught the hand, and it is three behaviours rather
     than one. Push a row and an action is *uncovered* behind it, growing as
     the row travels; let go partway and the row stays open with its button
     showing, so the act is still a deliberate press; push it past the far
     threshold and let go, and it happens on its own. A row that only ever
     sprang back said nothing about what it was about to do, which is what made
     the gesture read as a twitch instead of a control.

     The directions are Apple's, because that is where the hand learned them:
     pushing left uncovers the destructive one on the right of the row, pushing
     right uncovers the one that files it somewhere.

     A finger drags it; a trackpad pushes it with two fingers. Two inputs, one
     travel, one settle, so the phone and the desk cannot drift apart.

     **Every scope has the gesture**, and each one has its own pair. It was only
     the ordinary list at first, on the argument that Trash and Archive have
     different acts — they do, and that is a reason to give them their own pair
     rather than a reason to take the hand's gesture away in the two places
     where a row is most likely to want moving. */
  const gesturable = canWrite;
  const swipeable = mobile && gesturable;
  const swipe = useRef<{ x: number; y: number; from: number; live: boolean } | null>(null);

  /* Where a row rests with one action showing, how far it has to be pushed for
     the action to happen by itself, and how far it may travel at all.
     ponytail: three constants tuned by hand against Mail; if the row ever
     carries two actions on a side, OPEN is what has to grow. */
  /* What the row is inset by, which the panel behind it has to make up. */
  const EDGE = mobile || gallery ? 0 : 8;

  /* One row open at a time. A second open row is a second answer to "which one
     am I about to act on", and the id travels rather than the state because
     every row would otherwise need the whole list's attention passed down to
     it. Same shape as the pen's announcement in the editor. */
  useEffect(() => {
    function onOther(event: Event) {
      if ((event as CustomEvent<string>).detail !== entry.note.id) setSlid(0);
    }
    window.addEventListener(CLOSE_OTHER_SWIPES, onOther);
    return () => window.removeEventListener(CLOSE_OTHER_SWIPES, onOther);
  }, [entry.note.id]);

  const claim = useCallback(() => {
    window.dispatchEvent(new CustomEvent(CLOSE_OTHER_SWIPES, { detail: entry.note.id }));
  }, [entry.note.id]);

  /* What each scope's two directions do. The shape is the same everywhere so
     the hand learns one gesture; what changes is what is under it, which is
     what changes about the scope anyway.

     None of them is done by the push. `final` used to mark the one act a full
     swipe was not allowed to perform on its own; every act is that act now, so
     there is no flag and no exception to remember. */
  const acts = trashMode
    ? {
        left: { label: "Delete", Icon: Trash2, tone: "trash", run: onDeleteForever },
        right: { label: "Restore", Icon: RotateCcw, tone: "archive", run: onRestore },
      }
    : archiveMode
      ? {
          left: { label: "Delete", Icon: Trash2, tone: "trash", run: onMoveToTrash },
          right: {
            label: "Put back",
            Icon: ArchiveRestore,
            tone: "archive",
            run: (e: NoteEntry) => onArchiveChange(e, false),
          },
        }
      : {
          left: { label: "Delete", Icon: Trash2, tone: "trash", run: onMoveToTrash },
          right: {
            label: "Archive",
            Icon: Archive,
            tone: "archive",
            run: (e: NoteEntry) => onArchiveChange(e, true),
          },
        };
  /* The end of a gesture is a position and never an act. A push far enough
     used to run the act on release, which meant the hand had to be careful:
     flick a row a little too hard and a note was archived nobody meant to
     archive, and the only way to know how hard was too hard was to have got it
     wrong once. The row opens, the button shows, and the button is pressed —
     which is the same two-step every irreversible act here already asked for,
     now asked for by all of them. */
  const settle = useCallback((travelled: number) => {
    if (travelled <= -OPEN / 2) setSlid(-OPEN);
    else if (travelled >= OPEN / 2) setSlid(OPEN);
    else setSlid(0);
    setDragging(false);
  }, []);

  /* A trackpad has no gesture-end event: the fingers lift and macOS keeps
     sending decaying momentum for a while afterwards. So the end is a silence,
     and the travel is held in a ref rather than in the effect's closure — the
     row re-renders on every one of these events, and a gesture must not lose
     its distance because a dependency changed underneath it. */
  const wheel = useRef({ dx: 0, axis: null as null | "x" | "y", idle: 0 });
  /* Read through a ref, not closed over. Every wheel event re-renders this row,
     which remakes `settle`, which would re-run the effect below — and its
     cleanup would cancel the very timer that ends the gesture. The row then
     travelled and never sprang back. */
  const settleRef = useRef(settle);
  settleRef.current = settle;
  const claimRef = useRef(claim);
  claimRef.current = claim;
  /* Likewise: where the row already was when this gesture started, so a push
     from an open row carries on from where it is rather than jumping to zero. */
  const slidRef = useRef(slid);
  slidRef.current = slid;
  useEffect(() => {
    const row = rowRef.current;
    if (!row || !gesturable || mobile) return;
    const state = wheel.current;

    function end() {
      const travelled = state.dx;
      state.dx = 0;
      state.axis = null;
      settleRef.current(travelled);
    }

    function onWheel(event: WheelEvent) {
      window.clearTimeout(state.idle);
      state.idle = window.setTimeout(end, 90);
      /* The list scrolls up and down; this only ever answers to sideways, and
         once a gesture has been read as one it stays that one. */
      if (state.axis === null) {
        state.axis = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? "x" : "y";
        if (state.axis === "x") {
          state.dx = slidRef.current;
          setDragging(true);
          claimRef.current();
        }
      }
      if (state.axis !== "x") return;
      /* Or the window takes the same swipe as "go back". */
      event.preventDefault();
      /* Fingers moving left report a positive deltaX, and the row they are
         pushing goes left. */
      state.dx = clamp(state.dx - event.deltaX);
      setSlid(state.dx);
    }

    /* Not passive, or preventDefault above is ignored and the gesture is the
       browser's before it is ours. */
    row.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      row.removeEventListener("wheel", onWheel);
      window.clearTimeout(state.idle);
    };
  }, [gesturable, mobile]);

  function swipeStart(event: React.PointerEvent) {
    if (!swipeable || event.pointerType === "mouse") return;
    swipe.current = { x: event.clientX, y: event.clientY, from: slid, live: false };
  }

  function swipeMove(event: React.PointerEvent) {
    const from = swipe.current;
    if (!from) return;
    const dx = event.clientX - from.x;
    const dy = event.clientY - from.y;
    /* The list scrolls up and down; this only ever answers to sideways. Once
       a gesture has been read as one it stays that one. */
    if (!from.live) {
      if (Math.abs(dy) > Math.abs(dx)) {
        swipe.current = null;
        return;
      }
      if (Math.abs(dx) < 12) return;
      from.live = true;
      setDragging(true);
      claim();
    }
    setSlid(clamp(from.from + dx));
  }

  function swipeEnd() {
    const from = swipe.current;
    swipe.current = null;
    if (from?.live) settle(slid);
  }

  const { preview } = derivedOf(entry.note);
  const pinned = noteMeta?.pinned === true;
  const glyph = GLYPHS[documentGlyph(entry.note.content)];
  const Glyph = glyph.icon;
  /* A note with a sketch in it shows the sketch where the glyph goes — the
     same slot the note's own picture takes, and for the same reason: one place
     in the row says what you are about to open. It costs a walk of a document
     already in memory and no Storage object at all, because the strokes are
     in the note. */
  const sketch = useMemo(() => {
    const drawing = firstDrawing(entry.note.content);
    if (!drawing) return null;
    /* Forty strokes is already more than a 28px square can say, and the box is
       measured on the same ones that get drawn — measured on all of them it
       would hold room open for ink nobody is going to see. The surface the
       drawing was made on does not come into it: what the slot wants is where
       the ink is, not what it was drawn on. */
    const strokes = drawing.strokes.slice(0, 40);
    return { strokes, box: drawingInkBox(strokes) };
  }, [entry.note.content]);
  const checklist = useMemo(() => checklistProgress(entry.note.content), [entry.note.content]);
  const photoUrl = useStoredImage(entry.note.photo?.objectId ?? null, resolveImage);
  return (
    <div
      ref={(el) => {
        setNodeRef(el);
        rowRef.current = el;
      }}
      {...(!mobile && canWrite ? listeners : {})}
      {...(!mobile && canWrite ? attributes : {})}
      role="option"
      aria-selected={selected}
      /* A row standing open is showing a question, and the answer to it is
         either the button beside it or "never mind" — never the note. */
      onClick={() => (slid === 0 ? onSelect(entry) : setSlid(0))}
      onContextMenu={(event) => onContextMenu(event, entry)}
      onPointerDown={swipeStart}
      onPointerMove={swipeMove}
      onPointerUp={swipeEnd}
      onPointerCancel={swipeEnd}
      style={{
        opacity: isDragging ? 0.4 : 1,
        /* Written even when it is nothing: a row that comes back from a swipe
           and simply stops carrying the property keeps the last one it was
           given. */
        transform: slid === 0 ? "" : `translateX(${slid}px)`,
        /* Two motions on one row, so they are kept on two properties and given
           two curves. `transform` is the swipe letting go, which wants the
           spring: a card thrown at the edge should come back with some weight
           in it. `translate` — the standalone property, not the function — is
           the pointer arriving, which wants none of that: a row that overshoots
           under the cursor reads as the list twitching. Sharing one property
           would mean sharing one curve, and the inline value here wins over any
           stylesheet, so the hover could not have had its own. */
        transition: dragging
          ? "none"
          : "transform var(--dur-swipe) var(--ease-bounce), translate var(--dur-base) var(--ease)",
      }}
      className={`note-row group relative cursor-pointer transition-colors ${slid !== 0 ? "is-swiped" : ""} ${gallery ? "note-gallery-item flex flex-col" : "flex gap-3"} ${
        mobile && !gallery
          ? "mobile-note-row min-h-[4.5rem] touch-pan-y px-4 py-3"
          : gallery
            ? "touch-pan-y border border-rule-soft p-4"
            : "note-row-list mx-2 touch-none px-3 py-2.5"
      } ${
        selected
          ? mobile
            ? "bg-accent-wash"
            : "bg-accent-wash"
          : mobile
            ? "hover:bg-page"
            : "hover:bg-page"
      }`}
    >
      {/* The note's own picture stands where its kind-of-document glyph
          stands: one place in the row says what you are about to open. */}
      {entry.note.photo ? (
        <span
          className={`note-photo is-row ${gallery ? "is-gallery" : ""} ${unread ? "has-unread" : ""}`}
        >
          {photoUrl && <img src={photoUrl} alt="" draggable={false} />}
        </span>
      ) : sketch ? (
        <span
          title="Has a drawing"
          aria-label="Has a drawing"
          role="img"
          className={`note-row-glyph is-sketch ${gallery ? "is-gallery" : ""} ${
            unread ? "has-unread" : ""
          }`}
        >
          <svg
            viewBox={`${sketch.box.x} ${sketch.box.y} ${sketch.box.width} ${sketch.box.height}`}
            preserveAspectRatio="xMidYMid meet"
            aria-hidden
          >
            {sketch.strokes.map((stroke, index) => (
              <path
                key={index}
                d={stroke.d}
                fill="none"
                stroke={stroke.color}
                /* Constant apparent weight, whatever the drawing's own scale:
                   the slot is about 23px across once its padding is off, so the
                   box's long side over 90 puts a default five-unit pen at
                   roughly one and a third device pixels there — and leaves a
                   highlighter the six times wider it was drawn as. */
                strokeWidth={(stroke.width * Math.max(sketch.box.width, sketch.box.height)) / 90}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </svg>
        </span>
      ) : (
        <span
          title={glyph.label}
          aria-label={glyph.label}
          role="img"
          className={`note-row-glyph ${gallery ? "is-gallery" : ""} ${
            selected ? "is-selected" : ""
          } ${pinned ? "is-pinned" : ""} ${unread ? "has-unread" : ""}`}
        >
          <Glyph size={16} />
        </span>
      )}

      <div className="min-w-0 flex-1">
        <p
          /* Whole-pixel leading. A ratio of 1.35 puts a line box at 18.225px,
             so every row below the first started on a fraction of a pixel and
             its 1px rule was painted across two device rows at half strength —
             the blur down the list that looked like bad icon rendering. */
          className={`${gallery ? "text-[15px] leading-[20px]" : mobile ? "text-[16px] leading-[22px]" : "text-[13.5px] leading-[18px]"} ${
            entry.note.title ? "text-ink" : "text-ink-4 italic"
          }`}
          /* One line in the column, and that is the whole of why the list
             reads as a list. A title allowed three lines is three lines of one
             sentence, and the rows below it start wherever that sentence
             happened to end — so the column has no rhythm and you cannot see
             how many notes are under a heading without reading all of them.
             A card in the gallery has room for four; a phone keeps three,
             where a thumb is scrolling and the rows are further apart. */
          style={{
            fontWeight: 520,
            display: "-webkit-box",
            WebkitLineClamp: gallery ? 4 : mobile ? 3 : 1,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {entry.note.title || "Untitled"}
        </p>

        <p className="note-row-summary mt-1 truncate">
          <span>{formatStamp(entry.note.updatedAt)}</span>
          {/* What is left, where the list already says when. A checklist is
              the one kind of note whose state is the reason you open it. */}
          {checklist && (
            <span
              className={`note-row-tally ${checklist.done === checklist.total ? "is-done" : ""}`}
            >
              {checklist.done}/{checklist.total}
            </span>
          )}
          {preview && <span className="note-row-preview">{preview}</span>}
        </p>
      </div>

      {/* What is under the row. Each panel is parked just outside the edge it
          belongs to, so the row travelling is the only thing that moves and the
          panel is simply uncovered — the list clips its own overflow, which is
          what keeps a parked panel invisible until there is a gap for it.

          `left: 100%` and `right: 100%` rather than a wrapper around the row:
          the row is already the positioned element and already the thing that
          translates, and a wrapper would have to reproduce every one of the
          layout classes below it, in three variants. */}
      {gesturable &&
        slid !== 0 &&
        (["left", "right"] as const).map((side) => {
          const act = acts[side];
          return (
            <button
              key={side}
              type="button"
              className={`note-row-action is-${act.tone} is-${side}`}
              /* Plus the margin the row itself keeps on a pointer machine, or
                 the panel stops short of the column's edge and leaves a sliver
                 of background beside it. `--reveal` is how far open the row is
                 — the mark inside grows on the same travel rather than being
                 there in full behind a row that has barely moved. */
              style={
                {
                  width: Math.max(OPEN, side === "left" ? -slid : slid) + EDGE,
                  "--reveal": Math.min(1, Math.abs(slid) / OPEN),
                } as React.CSSProperties
              }
              /* The row is travelling under the pointer; a press has to be the
                 end of the gesture rather than a click that also opens the note
                 underneath. */
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                setSlid(0);
                act.run(entry);
              }}
            >
              <act.Icon size={16} />
              <span>{act.label}</span>
            </button>
          );
        })}

      {/* Touch keeps the acts a swipe does not do: pinning, which has no
          direction to it, and restoring or deleting for good, which are what
          Trash and Archive are rather than what a note in them is filed as. A
          pointer keeps none of them — it has the row's right-click menu, and a
          pin and a bin standing in every row said the same things twice. */}
      {canWrite && mobile && (
        <div className="note-row-actions flex shrink-0 items-center gap-0.5">
          {!trashMode && !archiveMode && (
            <button
              aria-label={
                pinned
                  ? `Unpin ${entry.note.title || "Untitled"}`
                  : `Pin ${entry.note.title || "Untitled"}`
              }
              title={pinned ? "Unpin note" : "Pin note to top"}
              aria-pressed={pinned}
              onClick={(event) => {
                event.stopPropagation();
                onTogglePin(entry);
              }}
              onPointerDown={(event) => event.stopPropagation()}
              className={`icon-button h-7 w-7 shrink-0 transition-all ${
                pinned ? "text-accent opacity-100" : "text-ink-3 hover:text-accent"
              }`}
            >
              <Pin size={16} fill={pinned ? "currentColor" : "none"} />
            </button>
          )}
          {trashMode && (
            <button
              aria-label={`Restore ${entry.note.title || "Untitled"}`}
              title="Restore note"
              onClick={(event) => {
                event.stopPropagation();
                onRestore(entry);
              }}
              onPointerDown={(event) => event.stopPropagation()}
              className="icon-button h-7 w-7 shrink-0 text-accent"
            >
              <RotateCcw size={16} />
            </button>
          )}
          {archiveMode && (
            <button
              aria-label={`Move ${entry.note.title || "Untitled"} out of Archive`}
              title="Move out of Archive"
              onClick={(event) => {
                event.stopPropagation();
                onArchiveChange(entry, false);
              }}
              onPointerDown={(event) => event.stopPropagation()}
              className="icon-button h-7 w-7 shrink-0 text-accent"
            >
              <ArchiveRestore size={16} />
            </button>
          )}

          {!swipeable && (
            <button
              aria-label={
                confirmDelete
                  ? `Confirm permanent deletion of ${entry.note.title || "Untitled"}`
                  : trashMode
                    ? `Delete ${entry.note.title || "Untitled"} forever`
                    : `Move ${entry.note.title || "Untitled"} to Trash`
              }
              title={
                confirmDelete
                  ? trashMode
                    ? "Click again to permanently delete"
                    : "Click again to move to Trash"
                  : trashMode
                    ? `Delete "${entry.note.title || "Untitled"}" forever`
                    : `Move "${entry.note.title || "Untitled"}" to Trash`
              }
              onClick={(e) => {
                e.stopPropagation();
                if (confirmDelete) {
                  if (trashMode) onDeleteForever(entry);
                  else onMoveToTrash(entry);
                } else setConfirmDelete(true);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className={`icon-button h-7 shrink-0 px-1.5 transition-all ${
                confirmDelete
                  ? "bg-danger-fill text-on-danger opacity-100"
                  : "text-ink-3 hover:text-danger"
              }`}
            >
              {confirmDelete ? (
                <span className="label text-[10px]">{trashMode ? "Forever?" : "Trash?"}</span>
              ) : (
                <Trash2 size={16} />
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
});

/** The tally under the collection's name. One note is a note — said in both
 *  headers below, so it is said here once.
 *
 *  The Trash says the one thing about it that is not visible in it: that
 *  waiting here runs out. It is the tally answering, not a paragraph under a
 *  control — the reader is owed the fact that something will be destroyed for
 *  them, and this is the line that is already there to say it.
 *
 *  Said in as few words as it takes, because the line has one line to say it
 *  in. "deleted for good after 30 days" wrapped, and a second line in a header
 *  that is one line tall is not a second line — it is the first one squashed.
 *  The header below grew a floor for the same reason; the word "Trash" is
 *  already at the top of it, so "deleted" need not be said twice. */
function noteTally(count: number, trash = false): string {
  const notes = `${count} ${count === 1 ? "note" : "notes"}`;
  return trash && count > 0 ? `${notes} · erased after 30 days` : notes;
}

function Skeletons() {
  return (
    <div aria-hidden>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="mx-2 mb-1 flex gap-3 rounded-xl border border-rule-soft px-3 py-3">
          <div className="skeleton mt-0.5 h-2.5 w-4 shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-3" style={{ width: `${78 - (i % 3) * 16}%` }} />
            <div className="skeleton h-2" style={{ width: `${58 - (i % 4) * 9}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function NoteList({
  mobile = false,
  entries,
  groups = [{ id: "notes", label: "Notes", entries }],
  view = "list",
  toolbarActions,
  topBar,
  footer,
  filters = [],
  meta,
  selectedId,
  query,
  loading,
  busy,
  canWrite,
  folderLabel,
  scopeLabel,
  trashMode,
  archiveMode,
  unreadIds,
  searchRef,
  onQueryChange,
  onSelect,
  onNew,
  onMoveToTrash,
  onRestore,
  onArchiveChange,
  onDeleteForever,
  onTogglePin,
  lockOf,
  onMoveToFolder,
  onSetPhoto,
  resolveImage,
}: Props) {
  const hasQuery = query.trim().length > 0;
  /* The page speaks in note ids; the rows hand back the whole entry. One stable
     adapter per action beats one fresh closure per row per render. */
  const selectEntry = useCallback((entry: NoteEntry) => onSelect(entry.note.id), [onSelect]);
  const togglePinEntry = useCallback(
    (entry: NoteEntry) => onTogglePin(entry.note.id),
    [onTogglePin],
  );
  const gallery = view === "gallery";

  /* Right-click on the note it is about. Every item here already exists behind
     a button somewhere; what was missing was reaching them from the row. */
  const rowMenu = useContextMenu<NoteEntry>();
  const [moving, setMoving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  /* Which note the picture being cut is for: the menu is gone by the time the
     cropper is on screen. */
  const [cropping, setCropping] = useState<{ noteId: string; file: File } | null>(null);
  /* Which date groups are folded shut. The *closed* ones are what is stored, so
     a bucket that appears for the first time — a new month, a new year — opens
     rather than arriving already hidden. Same shape as the folder tree's
     `napp:folders-open`, one key over. */
  const [collapsed, setCollapsed] = useState<Set<string>>(loadCollapsedGroups);

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_GROUPS_KEY, JSON.stringify([...collapsed]));
    } catch {
      /* The preference is optional; the groups still fold without storage. */
    }
  }, [collapsed]);

  const toggleGroup = useCallback((id: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const photoNoteRef = useRef<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const closeRowMenu = useCallback(() => {
    rowMenu.close();
    setMoving(false);
    setConfirming(false);
  }, [rowMenu]);
  const openRowMenu = useCallback(
    (event: ReactMouseEvent, entry: NoteEntry) => {
      setMoving(false);
      setConfirming(false);
      rowMenu.open(event, entry);
    },
    [rowMenu],
  );

  const menuEntry = rowMenu.target?.item ?? null;
  const menuPinned = menuEntry
    ? indexOf(meta).byNote.get(menuEntry.note.id)?.pinned === true
    : false;

  /* Permanent deletion asks twice here too. The row's own button has always
     done that, and a menu item is not a good reason to make it one click. */
  const rowMenuPanel =
    rowMenu.target && menuEntry ? (
      <ContextMenu point={rowMenu.target} onClose={closeRowMenu}>
        {!canWrite ? (
          <MenuButton
            onClick={() => {
              onSelect(menuEntry.note.id);
              closeRowMenu();
            }}
          >
            <FileText size={16} />
            Open note
          </MenuButton>
        ) : moving ? (
          <>
            <MenuButton onClick={() => setMoving(false)}>
              <ChevronRight size={16} className="rotate-180" />
              Back
            </MenuButton>
            <p className="menu-label">Move to</p>
            <MenuButton
              onClick={() => {
                onMoveToFolder(menuEntry.note.id, null);
                closeRowMenu();
              }}
            >
              <FolderInput size={16} />
              Unfiled
            </MenuButton>
            {meta.folders.map((folder) => (
              <MenuButton
                key={folder.id}
                onClick={() => {
                  onMoveToFolder(menuEntry.note.id, folder.id);
                  closeRowMenu();
                }}
              >
                <FolderInput size={16} />
                <span className="truncate">{folder.name}</span>
              </MenuButton>
            ))}
          </>
        ) : trashMode ? (
          <>
            <MenuButton
              onClick={() => {
                onRestore(menuEntry);
                closeRowMenu();
              }}
            >
              <RotateCcw size={16} />
              Restore note
            </MenuButton>
            <div className="menu-separator" />
            <MenuButton
              danger
              onClick={() => {
                if (!confirming) return setConfirming(true);
                onDeleteForever(menuEntry);
                closeRowMenu();
              }}
            >
              <Trash2 size={16} />
              {/* The second press is the one that destroys, so it says so. A
                  label that only grew a question mark read as the same button
                  asked twice — and the reader who had already decided could
                  not tell whether the first press had done it. */}
              {confirming ? "Yes, delete it now" : "Delete forever"}
            </MenuButton>
          </>
        ) : archiveMode ? (
          <>
            <MenuButton
              onClick={() => {
                onSelect(menuEntry.note.id);
                closeRowMenu();
              }}
            >
              <FileText size={16} />
              Open note
            </MenuButton>
            <MenuButton
              onClick={() => {
                onArchiveChange(menuEntry, false);
                closeRowMenu();
              }}
            >
              <ArchiveRestore size={16} />
              Move out of Archive
            </MenuButton>
            <div className="menu-separator" />
            <MenuButton
              danger
              onClick={() => {
                onMoveToTrash(menuEntry);
                closeRowMenu();
              }}
            >
              <Trash2 size={16} />
              Move to Trash
            </MenuButton>
          </>
        ) : (
          <>
            <MenuButton
              onClick={() => {
                onSelect(menuEntry.note.id);
                closeRowMenu();
              }}
            >
              <FileText size={16} />
              Open note
            </MenuButton>
            <MenuButton
              active={menuPinned}
              onClick={() => {
                onTogglePin(menuEntry.note.id);
                closeRowMenu();
              }}
            >
              <Pin size={16} />
              {menuPinned ? "Unpin note" : "Pin note"}
            </MenuButton>
            {(() => {
              /* Taking the note back from the other member, from the row it
                 is named on. A lock they hold is a line rather than a button:
                 lifting it is theirs to do, here and in Postgres. */
              const lock = lockOf?.(menuEntry.note.id);
              if (!lock) return null;
              return lock.mine || !lock.holderName ? (
                <MenuButton
                  active={lock.mine}
                  onClick={() => {
                    lock.onToggle();
                    closeRowMenu();
                  }}
                >
                  {lock.mine ? <LockOpen size={16} /> : <Lock size={16} />}
                  {lock.mine ? "Let them write again" : "Only I may write this"}
                </MenuButton>
              ) : (
                <p className="menu-label">Locked by {lock.holderName}</p>
              );
            })()}
            <MenuButton
              onClick={() => {
                photoNoteRef.current = menuEntry.note.id;
                photoInputRef.current?.click();
                closeRowMenu();
              }}
            >
              <Camera size={16} />
              {menuEntry.note.photo ? "Change photo" : "Add photo"}
            </MenuButton>
            {menuEntry.note.photo && (
              <MenuButton
                onClick={() => {
                  onSetPhoto(menuEntry.note.id, null);
                  closeRowMenu();
                }}
              >
                <ImageOff size={16} />
                Remove photo
              </MenuButton>
            )}
            <div className="menu-separator" />
            <MenuButton onClick={() => setMoving(true)}>
              <FolderInput size={16} />
              Move note
              <ChevronRight size={16} className="ml-auto" />
            </MenuButton>
            <MenuButton
              onClick={() => {
                onArchiveChange(menuEntry, true);
                closeRowMenu();
              }}
            >
              <Archive size={16} />
              Archive note
            </MenuButton>
            <div className="menu-separator" />
            <MenuButton
              danger
              onClick={() => {
                onMoveToTrash(menuEntry);
                closeRowMenu();
              }}
            >
              <Trash2 size={16} />
              Move to Trash
            </MenuButton>
          </>
        )}
      </ContextMenu>
    ) : null;

  /* One input and one cropper for the whole list: the menu names the note,
     the ref carries it across the file dialog. */
  const photoPicker = (
    <>
      <input
        ref={photoInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          const noteId = photoNoteRef.current;
          if (file && noteId) setCropping({ noteId, file });
          event.target.value = "";
        }}
      />
      {cropping && (
        <AvatarCropper
          file={cropping.file}
          busy={false}
          onCancel={() => setCropping(null)}
          onConfirm={(crop) => {
            onSetPhoto(cropping.noteId, cropping.file, crop);
            setCropping(null);
          }}
        />
      )}
    </>
  );

  const renderedGroups = groups.map((group, groupIndex) => {
    const open = !collapsed.has(group.id);
    return (
      <section key={group.id} className="note-group" aria-labelledby={`note-group-${group.id}`}>
        {/* The heading is the control. The count stays out on the right whether
          the group is open or shut, because "Previous 30 Days · 24" is the
          whole reason to fold it and still the reason to keep it on screen. */}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`note-group-body-${group.id}`}
          onClick={() => toggleGroup(group.id)}
          className={`note-group-heading ${groupIndex === 0 ? "is-first" : ""}`}
        >
          <ChevronRight
            size={16}
            aria-hidden="true"
            className={`note-group-twisty ${open ? "is-open" : ""}`}
          />
          <h3 id={`note-group-${group.id}`}>{group.label}</h3>
          <span>{group.entries.length}</span>
        </button>
        <div
          id={`note-group-body-${group.id}`}
          className={`note-group-body ${open ? "is-open" : ""}`}
        >
          <div className={gallery ? "note-gallery-grid" : ""}>
            {group.entries.map((entry) => (
              <Row
                mobile={mobile}
                gallery={gallery}
                key={entry.note.id}
                entry={entry}
                meta={meta}
                selected={selectedId === entry.note.id}
                unread={unreadIds?.has(entry.note.id) ?? false}
                trashMode={trashMode}
                archiveMode={archiveMode}
                canWrite={canWrite}
                onSelect={selectEntry}
                onMoveToTrash={onMoveToTrash}
                onRestore={onRestore}
                onArchiveChange={onArchiveChange}
                onDeleteForever={onDeleteForever}
                onTogglePin={togglePinEntry}
                onContextMenu={openRowMenu}
                resolveImage={resolveImage}
              />
            ))}
          </div>
        </div>
      </section>
    );
  });

  /* What is narrowing the list, and how to stop it narrowing. With the folder
     rail gone this is the only standing sign of a scope that is not "everything",
     so it is never hidden behind the menu that set it. */
  const filterStrip = filters.length > 0 && (
    <div className="filter-strip flex shrink-0 flex-wrap items-center gap-1.5 px-4 pt-2">
      {filters.map((filter) => (
        <button
          key={filter.id}
          type="button"
          className="filter-chip press"
          onClick={filter.onClear}
          aria-label={`Stop showing ${filter.label}`}
        >
          <span className="truncate">{filter.label}</span>
          <X size={12} className="shrink-0" />
        </button>
      ))}
    </div>
  );

  if (mobile) {
    return (
      <section className="mobile-note-list relative flex h-full w-full flex-col overflow-hidden">
        <header className="collection-toolbar flex shrink-0 items-end px-5 pt-5 pb-3">
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-[2rem] font-semibold leading-none tracking-[-0.035em]">
              {folderLabel}
            </h1>
            <p className="readout mt-1.5 text-ink-4">
              {loading ? "Loading" : noteTally(entries.length, trashMode)}
              {scopeLabel && !loading && <span className="scope-tag">{scopeLabel}</span>}
            </p>
          </div>
          <span className="flex items-center gap-1">{toolbarActions}</span>
        </header>

        {filterStrip}

        <div className="mobile-search-wrap absolute right-20 bottom-5 left-5 z-20">
          <div className="glass-toolbar flex h-13 items-center gap-2 px-4">
            <Search size={16} className="shrink-0 text-ink-4" />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.stopPropagation();
                  onQueryChange("");
                  event.currentTarget.blur();
                }
              }}
              placeholder="Search notes"
              aria-label="Search notes"
              className="min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-ink-4"
            />
            {hasQuery && (
              <button
                title="Clear search"
                onClick={() => onQueryChange("")}
                className="icon-button h-8 w-8 shrink-0 text-ink-4"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        <div
          key={`${folderLabel}:${query.trim()}`}
          role="listbox"
          aria-label={`Notes in ${folderLabel}`}
          className="list-in min-h-0 flex-1 overflow-x-hidden overscroll-x-contain overflow-y-auto pb-24"
        >
          <div>
            {loading ? (
              <Skeletons />
            ) : entries.length === 0 ? (
              <div className="empty-state">
                <p>{hasQuery ? `Nothing matches “${query.trim()}”` : `${folderLabel} is empty`}</p>
                {(hasQuery || (!trashMode && canWrite)) && (
                  <button onClick={() => (hasQuery ? onQueryChange("") : onNew())}>
                    {hasQuery ? "Clear search" : "Write the first note"}
                  </button>
                )}
              </div>
            ) : (
              renderedGroups
            )}
          </div>
        </div>

        {canWrite && !trashMode && (
          <button
            type="button"
            onClick={onNew}
            disabled={busy || loading}
            aria-label="New note"
            className="mobile-compose glass-toolbar absolute right-5 bottom-5 flex h-13 w-13 items-center justify-center text-accent disabled:opacity-40"
          >
            <SquarePen size={24} />
          </button>
        )}
        {rowMenuPanel}
        {photoPicker}
      </section>
    );
  }

  return (
    <section
      className={`collection-column flex h-full w-full shrink-0 flex-col ${gallery ? "is-gallery" : ""}`}
    >
      {topBar}
      <header className="collection-toolbar flex min-h-13 shrink-0 items-center gap-2 px-4">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-ink">{folderLabel}</h2>
          <p className="readout mt-0.5 text-ink-4">
            {loading ? "Loading" : noteTally(entries.length, trashMode)}
            {scopeLabel && !loading && <span className="scope-tag">{scopeLabel}</span>}
          </p>
        </div>
        {/* The compose control belongs beside the thing it adds to, not wedged
            into the search field where it covered the text being typed. */}
        {canWrite && !trashMode && (
          <button
            onClick={onNew}
            disabled={busy || loading}
            title="New note · N"
            className="new-note-button press shrink-0"
          >
            <SquarePen size={16} />
            <span>New note</span>
          </button>
        )}
        <span className="flex shrink-0 items-center gap-1">{toolbarActions}</span>
      </header>

      {filterStrip}

      {/* 42, not 40: the scope switch in the column beside this one is 34 of
          button inside 4 of padding, and these two are the second row of their
          columns. They meet at the switch's height rather than the switch
          being cut down to this one's, which squeezed the faces in it. 44 and
          not 42, because the switch is a pill with a border and the border is
          two of those pixels. */}
      <div className="glass-search mx-3 mt-3 flex h-11 shrink-0 items-center gap-2 px-3">
        <Search size={16} className="shrink-0 text-ink-4" />
        <input
          ref={searchRef}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              onQueryChange("");
              e.currentTarget.blur();
            }
          }}
          placeholder="Search"
          aria-label="Search notes"
          className="readout min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-4"
        />
        {hasQuery && (
          <button
            title="Clear search"
            onClick={() => onQueryChange("")}
            className="icon-button shrink-0 p-1 text-ink-4 transition-colors hover:text-ink"
          >
            <X size={12} />
          </button>
        )}
      </div>

      <div
        key={`${folderLabel}:${query.trim()}`}
        role="listbox"
        aria-label={`Notes in ${folderLabel}`}
        className="list-in flex-1 overflow-x-hidden overscroll-x-contain overflow-y-auto pt-2 pb-2"
      >
        {loading ? (
          <Skeletons />
        ) : entries.length === 0 ? (
          /* No box, and nothing dashed. A dashed rectangle is a drop target or
             a thing still loading, and this is neither — it is a place with
             nothing in it, which every Mac list says with words alone. The
             sentence was also set in the monospace readout, which is the voice
             this app keeps for counts and states, not for talking. */
          <div className="empty-state">
            <p>{hasQuery ? `Nothing matches “${query.trim()}”` : `${folderLabel} is empty`}</p>
            {(hasQuery || (!trashMode && canWrite)) && (
              <button onClick={() => (hasQuery ? onQueryChange("") : onNew())}>
                {hasQuery ? "Clear search" : "Write the first note"}
              </button>
            )}
          </div>
        ) : (
          renderedGroups
        )}
      </div>
      {footer}
      {rowMenuPanel}
      {photoPicker}
    </section>
  );
}
