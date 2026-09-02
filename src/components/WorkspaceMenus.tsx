import {
  Archive,
  ArchiveRestore,
  ClipboardCopy,
  Columns2,
  Keyboard,
  Maximize2,
  Minimize2,
  FileDown,
  FolderDown,
  AtSign,
  BookOpen,
  Contrast,
  Copy,
  Image,
  Layers,
  LogOut,
  Mail,
  Palette,
  ShieldCheck,
  Timer,
  Type,
  ArrowDownAZ,
  ArrowDownUp,
  CalendarDays,
  ChevronRight,
  Clock3,
  FolderInput,
  ImagePlus,
  Lock,
  LockOpen,
  Monitor,
  MoreHorizontal,
  Moon,
  Pin,
  Printer,
  Search,
  Settings,
  SpellCheck,
  Sun,
  Trash2,
  Undo2,
  UserRound,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import {
  AXIS_SPECS,
  PRESETS,
  matchingPreset,
  setAxes,
  setAxis,
  useAxes,
  type Axes,
} from "@/lib/axes";
import { AUTO_LOCK_CHOICES, AUTO_LOCK_LABELS, type AutoLockMinutes } from "@/lib/autoLock";
import { SHORTCUTS, shortcutGroups } from "@/lib/shortcuts";
import { AvatarCropper } from "@/components/AvatarCropper";
import type { AvatarCrop } from "@/lib/image";
import {
  APPEARANCE_PRESETS,
  DEFAULT_APPEARANCE,
  setAppearance,
  setTheme,
  setWallpaper,
  useAppearance,
  type ThemeMode,
} from "@/lib/appearance";
import type { Folder, NoteLock } from "@/lib/types";
import type { ListPreferences } from "@/lib/listPreferences";
import { ContextMenu } from "./ContextMenu";
import type { MenuPoint } from "@/lib/contextMenu";
import { MenuButton } from "./MenuPrimitives";
import { useDismiss } from "./useDismiss";
import { PRESENCE_PALETTES, type WritingPreferences } from "@/lib/writingPreferences";

export { MenuButton } from "./MenuPrimitives";

/**
 * Settings and the lock, at the bottom of the leftmost column.
 *
 * They used to hide behind a three-dot button at the top of a rail that no
 * longer exists — two destinations behind a menu that existed only to hold
 * them. Standing where an application's account controls stand, they are one
 * click each and the menu is gone.
 */

/**
 * How the list is ordered, and how it is drawn.
 *
 * *What* it shows is the sidebar's job now, so the scope list and the tag
 * filter have both left this menu: it is about sorting and view, which is what
 * the icon on the collection header has always promised.
 */
export function CollectionMenu({
  preferences,
  onChange,
  onExportAll,
  onOpenPalette,
  onOpenShortcuts,
  bulk,
}: {
  preferences: ListPreferences;
  onChange: (next: ListPreferences) => void;
  onExportAll: () => void;
  /** The two keyboard surfaces, offered by name. A shortcut nobody is told
   *  about is a shortcut nobody has. */
  onOpenPalette: () => void;
  onOpenShortcuts: () => void;
  /** The one act this scope can perform on everything in it at once, or
   *  nothing at all — most scopes have none. */
  bulk?: { label: string; confirm: string; danger: boolean; count: number; run: () => void };
}) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const close = () => {
    setOpen(false);
    setConfirming(false);
  };
  const ref = useDismiss(open, close);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="List options"
        title="Sort and view"
        aria-expanded={open}
        className="toolbar-button press"
        onClick={() => setOpen((current) => !current)}
      >
        <MoreHorizontal size={18} />
      </button>
      {open && (
        <div
          role="menu"
          className="popover menu-popover absolute top-full right-0 z-50 mt-2 w-60 p-1.5"
        >
          <MenuButton
            onClick={() => {
              onOpenPalette();
              close();
            }}
          >
            <Search size={16} />
            Find anything
            <kbd className="menu-key">⌘K</kbd>
          </MenuButton>
          <MenuButton
            onClick={() => {
              onOpenShortcuts();
              close();
            }}
          >
            <Keyboard size={16} />
            Keyboard shortcuts
            <kbd className="menu-key">?</kbd>
          </MenuButton>
          <div className="menu-separator" />
          <p className="menu-label">Sort by</p>
          {(["updated", "created", "title"] as const).map((criterion) => (
            <MenuButton
              key={criterion}
              active={preferences.sortBy === criterion}
              onClick={() => onChange({ ...preferences, sortBy: criterion })}
            >
              {criterion === "title" ? <ArrowDownAZ size={16} /> : <Clock3 size={16} />}
              {criterion === "updated"
                ? "Date edited"
                : criterion === "created"
                  ? "Date created"
                  : "Title"}
            </MenuButton>
          ))}
          <div className="menu-separator" />
          <MenuButton
            active={preferences.direction === "desc"}
            onClick={() => onChange({ ...preferences, direction: "desc" })}
          >
            <ArrowDownUp size={16} />
            Newest first
          </MenuButton>
          <MenuButton
            active={preferences.direction === "asc"}
            onClick={() => onChange({ ...preferences, direction: "asc" })}
          >
            <ArrowDownUp size={16} className="rotate-180" />
            Oldest first
          </MenuButton>
          <div className="menu-separator" />
          <MenuButton
            active={preferences.groupByDate}
            onClick={() => onChange({ ...preferences, groupByDate: !preferences.groupByDate })}
          >
            <CalendarDays size={16} />
            Group by date
          </MenuButton>
          <div className="menu-separator" />
          <MenuButton
            onClick={() => {
              onExportAll();
              close();
            }}
          >
            <FolderDown size={16} />
            Export all as Markdown
          </MenuButton>
          {bulk && bulk.count > 0 && (
            <>
              <div className="menu-separator" />
              {/* Two clicks, the same two the trash asks for on a single row.
                  A confirmation that replaces the label in place says what is
                  about to happen without moving the pointer to a new box. */}
              <MenuButton
                danger={bulk.danger}
                onClick={() => {
                  if (!confirming) {
                    setConfirming(true);
                    return;
                  }
                  bulk.run();
                  close();
                }}
              >
                {bulk.danger ? <Trash2 size={16} /> : <ArchiveRestore size={16} />}
                {confirming ? bulk.confirm : `${bulk.label} (${bulk.count})`}
              </MenuButton>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* The items a note carries, wherever they are asked for: from the ⋯ in the
   editor toolbar, and from a right-click on the page. One list, two doors. */
function NoteMenuContent({
  pinned,
  lock,
  folders,
  recent,
  onTogglePin,
  onFind,
  onToggleFocus,
  focusMode,
  onOpenBeside,
  onMove,
  onRecent,
  onCopyMarkdown,
  onExportMarkdown,
  onPrint,
  onDelete,
  close,
}: {
  pinned: boolean;
  /** Absent where locking is not on offer: Trash, the preview, a reader. */
  lock?: NoteLock;
  folders: Folder[];
  recent: { id: string; title: string }[];
  onTogglePin: () => void;
  onFind: () => void;
  onToggleFocus: () => void;
  focusMode: boolean;
  onOpenBeside: () => void;
  onMove: (folderId: string | null) => void;
  onRecent: (id: string) => void;
  onCopyMarkdown: () => void;
  onExportMarkdown: () => void;
  onPrint: () => void;
  onDelete: () => void;
  close: () => void;
}) {
  const [section, setSection] = useState<"root" | "move" | "recent">("root");
  return (
    <>
      {section !== "root" && (
        <MenuButton onClick={() => setSection("root")}>
          <ChevronRight size={16} className="rotate-180" />
          Back
        </MenuButton>
      )}
      {section === "root" && (
        <>
          <MenuButton
            active={pinned}
            onClick={() => {
              onTogglePin();
              close();
            }}
          >
            <Pin size={16} />
            {pinned ? "Unpin note" : "Pin note"}
          </MenuButton>
          {lock &&
            (lock.mine || !lock.holderName ? (
              <MenuButton
                active={lock.mine}
                onClick={() => {
                  lock.onToggle();
                  close();
                }}
              >
                {lock.mine ? <LockOpen size={16} /> : <Lock size={16} />}
                {lock.mine ? "Let them write again" : "Only I may write this"}
              </MenuButton>
            ) : (
              <p className="menu-label">Locked by {lock.holderName}</p>
            ))}
          <MenuButton
            onClick={() => {
              onFind();
              close();
            }}
          >
            <Search size={16} />
            Find in note
          </MenuButton>
          <MenuButton
            active={focusMode}
            onClick={() => {
              onToggleFocus();
              close();
            }}
          >
            {focusMode ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            {focusMode ? "Leave focus" : "Focus mode"}
            {focusMode && <kbd className="menu-key">esc</kbd>}
          </MenuButton>
          <MenuButton
            onClick={() => {
              onOpenBeside();
              close();
            }}
          >
            <Columns2 size={16} />
            Open a note beside this
          </MenuButton>
          <div className="menu-separator" />
          <MenuButton onClick={() => setSection("move")}>
            <FolderInput size={16} />
            Move note
            <ChevronRight size={16} className="ml-auto" />
          </MenuButton>
          <MenuButton onClick={() => setSection("recent")}>
            <Clock3 size={16} />
            Recent notes
            <ChevronRight size={16} className="ml-auto" />
          </MenuButton>
          <div className="menu-separator" />
          {/* Both doors out of this app, and neither needs a server: the
              clipboard is what Notion and Google Docs read, and the file is
              what Obsidian keeps a vault of. */}
          <MenuButton
            onClick={() => {
              onCopyMarkdown();
              close();
            }}
          >
            <ClipboardCopy size={16} />
            Copy as Markdown
          </MenuButton>
          <MenuButton
            onClick={() => {
              onExportMarkdown();
              close();
            }}
          >
            <FileDown size={16} />
            Export as Markdown
          </MenuButton>
          {/* The third door, and the one that keeps the cover and the
              typesetting: every browser prints to PDF, so a paged copy of the
              note costs a stylesheet rather than a PDF writer in the bundle. */}
          <MenuButton
            onClick={() => {
              close();
              onPrint();
            }}
          >
            <Printer size={16} />
            Print or save as PDF
          </MenuButton>
          <div className="menu-separator" />
          <MenuButton
            danger
            onClick={() => {
              onDelete();
              close();
            }}
          >
            <Trash2 size={16} />
            Delete note
          </MenuButton>
        </>
      )}
      {section === "move" && (
        <>
          <p className="menu-label">Move to</p>
          <MenuButton
            onClick={() => {
              onMove(null);
              close();
            }}
          >
            <FolderInput size={16} />
            Unfiled
          </MenuButton>
          {folders.map((folder) => (
            <MenuButton
              key={folder.id}
              onClick={() => {
                onMove(folder.id);
                close();
              }}
            >
              <FolderInput size={16} />
              {folder.name}
            </MenuButton>
          ))}
        </>
      )}
      {section === "recent" && (
        <>
          <p className="menu-label">Recent notes</p>
          {recent.length ? (
            recent.map((note) => (
              <MenuButton
                key={note.id}
                onClick={() => {
                  onRecent(note.id);
                  close();
                }}
              >
                <Clock3 size={16} />
                <span className="truncate">{note.title || "Untitled"}</span>
              </MenuButton>
            ))
          ) : (
            <p className="px-3 py-4 text-sm text-ink-4">No recent notes yet</p>
          )}
        </>
      )}
    </>
  );
}

export function NoteMenu(props: {
  pinned: boolean;
  /** Absent where locking is not on offer: Trash, the preview, a reader. */
  lock?: NoteLock;
  folders: Folder[];
  recent: { id: string; title: string }[];
  onTogglePin: () => void;
  onFind: () => void;
  onToggleFocus: () => void;
  focusMode: boolean;
  onOpenBeside: () => void;
  onMove: (folderId: string | null) => void;
  onRecent: (id: string) => void;
  onCopyMarkdown: () => void;
  onExportMarkdown: () => void;
  onPrint: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const ref = useDismiss(open, close);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Note actions"
        aria-expanded={open}
        className="toolbar-button"
        onClick={() => setOpen((current) => !current)}
      >
        <MoreHorizontal size={18} />
      </button>
      {open && (
        <div
          role="menu"
          className="popover menu-popover absolute top-full right-0 z-50 mt-2 w-60 p-1.5"
        >
          <NoteMenuContent {...props} close={close} />
        </div>
      )}
    </div>
  );
}

/** The same items, opened where the pointer is. */
export function NoteContextMenu({
  point,
  onClose,
  ...props
}: {
  point: MenuPoint;
  onClose: () => void;
  pinned: boolean;
  /** Absent where locking is not on offer: Trash, the preview, a reader. */
  lock?: NoteLock;
  folders: Folder[];
  recent: { id: string; title: string }[];
  onTogglePin: () => void;
  onFind: () => void;
  onToggleFocus: () => void;
  focusMode: boolean;
  onOpenBeside: () => void;
  onMove: (folderId: string | null) => void;
  onRecent: (id: string) => void;
  onCopyMarkdown: () => void;
  onExportMarkdown: () => void;
  onPrint: () => void;
  onDelete: () => void;
}) {
  return (
    <ContextMenu point={point} onClose={onClose}>
      <NoteMenuContent {...props} close={onClose} />
    </ContextMenu>
  );
}
/* ── Settings ────────────────────────────────────────────────────────────────
   What a preferences sheet in this application is actually for.

   It used to hold three things, and not one of them earned the modal. The
   reading axes were four unlabelled tracks whose effect was hidden behind the
   very panel you were dragging them in. List-versus-gallery was a choice the
   window size already makes correctly on its own. Group-by-date and the lock
   were both duplicates — of the ⋯ menu on the list header, and of the button
   sitting one row above Settings in the same column.

   So: the axes stay, but with a specimen that changes under the slider, which
   is the whole difference between a control you understand and four numbers.
   Appearance, reading and account state each get their own clear section. */

/** The letters that stand in for a face nobody has uploaded. */
function initialsOf(name: string, email: string): string {
  const source = name.trim() || email.split("@")[0]?.replace(/[._-]+/g, " ") || "";
  const words = source.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export function Avatar({
  url,
  name,
  email,
  large = false,
  compact = false,
  online = false,
}: {
  url: string | null;
  name: string;
  email: string;
  large?: boolean;
  compact?: boolean;
  online?: boolean;
}) {
  return (
    <span
      className={`avatar ${large ? "is-large" : ""} ${compact ? "is-compact" : ""} ${online ? "is-online" : ""}`}
      aria-hidden={online ? undefined : true}
      aria-label={online ? `${name || "Member"} is online` : undefined}
      title={online ? "Online now" : undefined}
    >
      {url ? <img src={url} alt="" /> : initialsOf(name, email)}
    </span>
  );
}
