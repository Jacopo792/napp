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
  Image as ImageIcon,
  ImageOff,
  ListChecks,
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
import { MenuItems } from "./MenuPrimitives";
import { pinItem, lockItems, moveItem } from "./menuNoteItems";
import type { MenuItem } from "@/lib/menuShape";

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
  const noteMeta = indexOf(meta).byNote.get(entry.note.id);

  useEffect(() => {
    if (selected) rowRef.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  useEffect(() => {
    if (!confirmDelete) return;
    const timer = window.setTimeout(() => setConfirmDelete(false), 3000);
    return () => window.clearTimeout(timer);
  }, [confirmDelete]);

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
      onClick={() => onSelect(entry)}
      onContextMenu={(event) => onContextMenu(event, entry)}
      style={{
        opacity: isDragging ? 0.4 : 1,
      }}
      className={`note-row group relative cursor-pointer transition-colors ${gallery ? "note-gallery-item flex flex-col" : "flex gap-3"} ${
        mobile && !gallery
          ? "mobile-note-row min-h-[4.5rem] touch-pan-y px-4 py-3"
          : gallery
            ? "touch-pan-y border border-rule-soft p-4"
            : "note-row-list mx-2 touch-none py-2.5 pr-3 pl-1"
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

      {/* Touch has no context menu, so its direct controls cover every action
          that was previously hidden behind a gesture. Pointer users retain the
          row menu instead of carrying duplicate buttons in every row. */}
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
          {!trashMode && !archiveMode && (
            <button
              aria-label={`Archive ${entry.note.title || "Untitled"}`}
              title="Archive note"
              onClick={(event) => {
                event.stopPropagation();
                onArchiveChange(entry, true);
              }}
              onPointerDown={(event) => event.stopPropagation()}
              className="icon-button h-7 w-7 shrink-0 text-ink-3 hover:text-accent"
            >
              <Archive size={16} />
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
                  : `Move "${entry.note.title || "Untitled"} to Trash`
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
  const closeRowMenu = useCallback(() => rowMenu.close(), [rowMenu]);
  const openRowMenu = useCallback(
    (event: ReactMouseEvent, entry: NoteEntry) => rowMenu.open(event, entry),
    [rowMenu],
  );

  const menuEntry = rowMenu.target?.item ?? null;
  const menuPinned = menuEntry
    ? indexOf(meta).byNote.get(menuEntry.note.id)?.pinned === true
    : false;

  /* ── The row's own menu, described rather than written out ──────────────────
     Two hundred lines of JSX with a `moving` flag and a Back button of its own,
     beside a note menu on the page that was already a `MenuItem[]` handed to
     `MenuItems` — which has the going-in-and-coming-back-out built into it. So
     this is a list too: the same shape, the same renderer, and the three items
     both menus carry come from `menuNoteItems.tsx` instead of being spelled
     twice.

     What it is not, yet, is a menu the system draws. `NoteContextMenu` offers
     itself to the window manager and this does not, and that is deliberate:
     the photograph opens a file dialog, which a browser grants to a click and
     not to a message coming back over an IPC bridge. Being a list is what makes
     that a decision somebody can take in one line rather than a rewrite.

     Deleting for good still asks twice, and it asks by being a submenu: the
     confirm-in-place could not survive, because choosing an item closes the
     menu before it runs. A section you go into to say yes is the same two
     presses and says plainly which press is the one that destroys. */
  const rowMenuItems = ((): MenuItem[] => {
    if (!menuEntry) return [];
    const entry = menuEntry;
    const open: MenuItem = {
      kind: "item",
      id: "open",
      label: "Open note",
      icon: <FileText size={16} />,
      run: () => onSelect(entry.note.id),
    };
    if (!canWrite) return [open];
    if (trashMode)
      return [
        {
          kind: "item",
          id: "restore",
          label: "Restore note",
          icon: <RotateCcw size={16} />,
          run: () => onRestore(entry),
        },
        { kind: "separator" },
        {
          kind: "item",
          id: "forever",
          label: "Delete forever",
          icon: <Trash2 size={16} />,
          danger: true,
          submenu: [
            {
              kind: "item",
              id: "forever:yes",
              label: "Yes, delete it now",
              icon: <Trash2 size={16} />,
              danger: true,
              run: () => onDeleteForever(entry),
            },
          ],
        },
      ];
    if (archiveMode)
      return [
        open,
        {
          kind: "item",
          id: "unarchive",
          label: "Move out of Archive",
          icon: <ArchiveRestore size={16} />,
          run: () => onArchiveChange(entry, false),
        },
        { kind: "separator" },
        {
          kind: "item",
          id: "trash",
          label: "Move to Trash",
          icon: <Trash2 size={16} />,
          danger: true,
          run: () => onMoveToTrash(entry),
        },
      ];
    return [
      open,
      pinItem(menuPinned, () => onTogglePin(entry.note.id)),
      ...lockItems(lockOf?.(entry.note.id)),
      {
        kind: "item",
        id: "photo",
        label: entry.note.photo ? "Change photo" : "Add photo",
        icon: <Camera size={16} />,
        run: () => {
          photoNoteRef.current = entry.note.id;
          photoInputRef.current?.click();
        },
      },
      ...(entry.note.photo
        ? [
            {
              kind: "item" as const,
              id: "photo:remove",
              label: "Remove photo",
              icon: <ImageOff size={16} />,
              run: () => onSetPhoto(entry.note.id, null),
            },
          ]
        : []),
      { kind: "separator" },
      moveItem(meta.folders, (folderId) => onMoveToFolder(entry.note.id, folderId)),
      {
        kind: "item",
        id: "archive",
        label: "Archive note",
        icon: <Archive size={16} />,
        run: () => onArchiveChange(entry, true),
      },
      { kind: "separator" },
      {
        kind: "item",
        id: "trash",
        label: "Move to Trash",
        icon: <Trash2 size={16} />,
        danger: true,
        run: () => onMoveToTrash(entry),
      },
    ];
  })();

  const rowMenuPanel =
    rowMenu.target && menuEntry ? (
      <ContextMenu point={rowMenu.target} onClose={closeRowMenu}>
        <MenuItems items={rowMenuItems} close={closeRowMenu} />
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
