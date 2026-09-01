import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { useDraggable } from "@dnd-kit/core";
import {
  Archive,
  ArchiveRestore,
  Check,
  ChevronRight,
  FileText,
  FolderInput,
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
import type { Meta } from "@/lib/types";
import { AvatarCropper } from "./AvatarCropper";
import type { AvatarCrop } from "@/lib/image";
import { useStoredImage } from "@/lib/media";
import { formatStamp } from "@/lib/format";
import { derivedOf, indexOf } from "@/lib/derived";
import { documentGlyph } from "@/features/editor/lib/content";
import type { NoteEntry } from "@/lib/entries";
import type { ListView, NoteGroup } from "@/lib/listPreferences";
import type { SwipeAction } from "@/lib/writingPreferences";
import { nextSwipeOffset } from "@/lib/swipe";
import { ContextMenu } from "./ContextMenu";
import { useContextMenu } from "@/lib/contextMenu";
import { MenuButton } from "./WorkspaceMenus";

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
  trashMode: boolean;
  archiveMode: boolean;
  searchRef: React.RefObject<HTMLInputElement | null>;
  onQueryChange: (q: string) => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onMoveToTrash: (entry: NoteEntry) => void;
  onRestore: (entry: NoteEntry) => void;
  onArchiveChange: (entry: NoteEntry, archived: boolean) => void;
  onDeleteForever: (entry: NoteEntry) => void;
  onTogglePin: (noteId: string) => void;
  onMoveToFolder: (noteId: string, folderId: string | null) => void;
  /** A picture for the note itself. A null file takes the current one off. */
  onSetPhoto: (noteId: string, file: File | null, crop?: AvatarCrop) => void;
  resolveImage: (objectId: string) => Promise<Blob>;
  swipeLeftAction: SwipeAction;
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
  swipeLeftAction,
}: {
  mobile: boolean;
  gallery: boolean;
  entry: NoteEntry;
  meta: Meta;
  selected: boolean;
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
  swipeLeftAction: SwipeAction;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: entry.note.id,
    disabled: mobile || trashMode || archiveMode || !canWrite,
  });
  const rowRef = useRef<HTMLDivElement>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [swipeX, setSwipeX] = useState(0);
  const [swipeDragging, setSwipeDragging] = useState(false);
  const [swipeConfirm, setSwipeConfirm] = useState(false);
  const swipeXRef = useRef(0);
  const swipeResetRef = useRef<number | undefined>(undefined);

  const noteMeta = indexOf(meta).byNote.get(entry.note.id);

  useEffect(() => {
    if (selected) rowRef.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  useEffect(() => {
    if (!confirmDelete) return;
    const timer = window.setTimeout(() => setConfirmDelete(false), 3000);
    return () => window.clearTimeout(timer);
  }, [confirmDelete]);

  useEffect(() => {
    return () => window.clearTimeout(swipeResetRef.current);
  }, []);

  const { preview } = derivedOf(entry.note);
  const pinned = noteMeta?.pinned === true;
  const glyph = GLYPHS[documentGlyph(entry.note.content)];
  const Glyph = glyph.icon;
  const photoUrl = useStoredImage(entry.note.photo?.objectId ?? null, resolveImage);
  const canSwipe = !mobile && canWrite && !trashMode && !archiveMode && swipeLeftAction !== "off";
  const swipeLabel = swipeLeftAction === "archive" ? "Archive" : "Move to Trash";

  function settleSwipe() {
    window.clearTimeout(swipeResetRef.current);
    swipeResetRef.current = window.setTimeout(() => {
      const revealed = swipeXRef.current <= -32;
      setSwipeDragging(false);
      setSwipeConfirm(false);
      swipeXRef.current = revealed ? -112 : 0;
      setSwipeX(swipeXRef.current);
    }, 110);
  }

  function handleSwipe(event: React.WheelEvent<HTMLDivElement>) {
    if (!canSwipe || Math.abs(event.deltaX) < 3) return;
    event.preventDefault();
    window.clearTimeout(swipeResetRef.current);
    setSwipeDragging(true);
    const next = nextSwipeOffset(swipeXRef.current, event.deltaX);
    swipeXRef.current = next;
    setSwipeX(next);
    settleSwipe();
  }

  function confirmSwipeAction(event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    if (!swipeConfirm) {
      setSwipeConfirm(true);
      setSwipeDragging(false);
      swipeXRef.current = -148;
      setSwipeX(-148);
      return;
    }
    if (swipeLeftAction === "archive") onArchiveChange(entry, true);
    else onMoveToTrash(entry);
  }

  return (
    <div
      className="note-swipe-shell"
      style={
        {
          "--swipe-action-color": swipeLeftAction === "archive" ? "#6877f5" : "#ef5b63",
        } as React.CSSProperties
      }
    >
      {canSwipe && (
        <button
          type="button"
          className={`note-swipe-action ${swipeConfirm ? "is-confirming" : ""}`}
          aria-label={swipeConfirm ? `Confirm ${swipeLabel.toLowerCase()}` : swipeLabel}
          title={swipeConfirm ? `Confirm ${swipeLabel.toLowerCase()}` : swipeLabel}
          onClick={confirmSwipeAction}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {swipeConfirm ? (
            <>
              <Check size={17} /> Confirm
            </>
          ) : (
            <>
              {swipeLeftAction === "archive" ? <Archive size={17} /> : <Trash2 size={17} />}
              {swipeLabel}
            </>
          )}
        </button>
      )}
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
        onWheel={handleSwipe}
        style={
          {
            opacity: isDragging ? 0.4 : 1,
            "--swipe-x": `${swipeX}px`,
            "--swipe-progress": Math.min(1, Math.abs(swipeX) / 70),
          } as React.CSSProperties
        }
        className={`note-swipe-row ${swipeDragging ? "is-swiping" : ""} group relative cursor-pointer transition-colors ${gallery ? "note-gallery-item flex flex-col" : "flex gap-3"} ${
          mobile && !gallery
            ? "mobile-note-row min-h-[4.5rem] touch-pan-y px-4 py-3"
            : gallery
              ? "touch-pan-y border border-rule-soft p-4"
              : "mx-2 mb-1 touch-none border-b border-rule-soft px-3 py-3"
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
          <span className={`note-photo is-row ${gallery ? "is-gallery" : ""}`}>
            {photoUrl && <img src={photoUrl} alt="" draggable={false} />}
          </span>
        ) : (
          <span
            title={glyph.label}
            aria-label={glyph.label}
            role="img"
            className={`note-row-glyph ${gallery ? "is-gallery" : ""} ${
              selected ? "is-selected" : ""
            } ${pinned ? "is-pinned" : ""}`}
          >
            <Glyph size={mobile && !gallery ? 16 : 14} />
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
            style={{
              fontWeight: 520,
              display: "-webkit-box",
              WebkitLineClamp: gallery ? 4 : 3,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {entry.note.title || "Untitled"}
          </p>

          <p className="note-row-summary mt-1 truncate">
            <span>{formatStamp(entry.note.updatedAt)}</span>
            {preview && <span className="note-row-preview">{preview}</span>}
          </p>
        </div>

        {canWrite && (
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
                <Pin size={14} fill={pinned ? "currentColor" : "none"} />
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
                <RotateCcw size={14} />
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
                <ArchiveRestore size={14} />
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
                <Trash2 size={14} />
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
});

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
  trashMode,
  archiveMode,
  searchRef,
  onQueryChange,
  onSelect,
  onNew,
  onMoveToTrash,
  onRestore,
  onArchiveChange,
  onDeleteForever,
  onTogglePin,
  onMoveToFolder,
  onSetPhoto,
  resolveImage,
  swipeLeftAction,
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
              {confirming ? "Delete forever?" : "Delete forever"}
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
            size={14}
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
                swipeLeftAction={swipeLeftAction}
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
              {loading ? "Loading" : `${entries.length} notes`}
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
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        <div
          key={`${folderLabel}:${query.trim()}`}
          role="listbox"
          aria-label={`Notes in ${folderLabel}`}
          className="list-in min-h-0 flex-1 overflow-y-auto pb-24"
        >
          <div>
            {loading ? (
              <Skeletons />
            ) : entries.length === 0 ? (
              <div className="px-6 py-14 text-center">
                <p className="text-[14px] text-ink-3">
                  {hasQuery ? `Nothing matches “${query.trim()}”` : `${folderLabel} is empty`}
                </p>
                {(hasQuery || (!trashMode && canWrite)) && (
                  <button
                    onClick={() => (hasQuery ? onQueryChange("") : onNew())}
                    className="mt-3 text-[14px] font-medium text-accent"
                  >
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
      <header className="collection-toolbar flex h-13 shrink-0 items-center gap-2 px-4">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-ink">{folderLabel}</h2>
          <p className="readout mt-0.5 text-ink-4">
            {loading ? "Loading" : `${entries.length} notes`}
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
            <SquarePen size={14} />
            <span>New note</span>
          </button>
        )}
        <span className="flex shrink-0 items-center gap-1">{toolbarActions}</span>
      </header>

      {filterStrip}

      <div className="glass-search mx-3 mt-3 flex h-10 shrink-0 items-center gap-2 px-3">
        <Search size={14} className="shrink-0 text-ink-4" />
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
        className="list-in flex-1 overflow-y-auto pt-2 pb-2"
      >
        {loading ? (
          <Skeletons />
        ) : entries.length === 0 ? (
          <div className="mx-3 mt-2 rounded-xl border border-dashed border-rule px-6 py-12 text-center">
            <p className="readout text-ink-2">
              {hasQuery ? `Nothing matches “${query.trim()}”` : `${folderLabel} is empty`}
            </p>
            {(hasQuery || (!trashMode && canWrite)) && (
              <button
                onClick={() => (hasQuery ? onQueryChange("") : onNew())}
                className="label mt-3 text-accent transition-opacity hover:opacity-70"
              >
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
