import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { FOLDER_DRAG, folderDropSide } from "@/lib/folderOrder";
import {
  Archive,
  ChevronRight,
  Folder,
  FolderOpen,
  FolderPlus,
  Info,
  Lock,
  MessageSquare,
  MoreHorizontal,
  NotebookText,
  PanelLeftClose,
  Pencil,
  Pin,
  Settings,
  Trash2,
  X,
} from "@/components/icons";
import { ALL, ARCHIVE, REMARKS, TRASH } from "@/lib/scopes";
import type { Folder as FolderType } from "@/lib/types";
import { ContextMenu } from "./ContextMenu";
import { useContextMenu } from "@/lib/contextMenu";
import { WhatsNewButton } from "./WhatsNewButton";
import { UpdateNotice } from "./UpdateNotice";
import { MenuButton } from "./MenuPrimitives";
import type { SheetOrigin } from "./Sheet";

/* ── The sidebar ─────────────────────────────────────────────────────────────
   Folders belong in the window, not in Settings.

   They had been moved into a settings sheet on the argument that a two-person
   archive changes its folder list rarely. That is true of *editing* the list
   and false of *using* it: choosing which folder you are reading is the most
   frequent navigation there is, and Trash — the one place a note goes when you
   delete it — was three clicks and a modal away from the note you deleted.

   So this is the shape every notes application has settled on: a column of
   destinations, each with a glyph, the scopes first, the folder tree next, the
   wastebasket last. A folder can hold folders, each one's actions live behind
   the same ⋯ the rest of the interface uses, and nothing here is quiet: these
   are the names of your own material, so they are set at reading weight rather
   than as small grey labels. ────────────────────────────────────────────── */

export interface Scope {
  id: string;
  label: string;
  count: number;
  /** Remarks nobody here has read yet. Only Remarks carries one, and it is
   *  separate from `count` because the two say different things: how much is
   *  waiting, and how much of it is new. */
  unread?: number;
}

interface Props {
  scopes: Scope[];
  folders: FolderType[];
  selectedId: string;
  canWrite: boolean;
  /** The pinned notes, in the order the list already pins them. Notes rather
   *  than a destination: a pin is about one note, so the rail carries the note
   *  itself and not a scope that would then have to be filtered. */
  pinned: { id: string; title: string }[];
  selectedNoteId: string | null;
  onSelectNote: (id: string) => void;
  onSelect: (id: string) => void;
  onCreateFolder: (name: string, parentId: string | null) => void;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFolder: (id: string) => void;
  /** The folder's sheet, growing out of its glyph. */
  onFolderInfo: (id: string, origin: SheetOrigin) => void;
  onClose: () => void;
  /** On the phone the column is a sheet and this is how it is put away; on
   *  the desktop hiding the columns lives in the list's own group. */
  closeInStrip?: boolean;
  onSettings: () => void;
  onLock: () => void;
  /** What changed in Napp, and whether there is a release not read yet. */
  onWhatsNew: () => void;
  whatsNewUnseen: boolean;
  /** The archive switch, which belongs above the destinations it re-points. */
  /** Which archive, above whose notes inside it. */
  spaceSwitch: React.ReactNode;
  /** The people this archive is shared between, as faces to switch between. */
  peopleShelf: React.ReactNode;
  scopeLabel: string;
}

const EXPANDED_KEY = "napp:folders-open";

/* How long a press has to stay still to become a hold — the folder's sheet,
   the way a note row's hold is the note's. */
const HOLD_MS = 450;

function glyphOrigin(row: Element): SheetOrigin {
  const { x, y, width, height } = (
    row.querySelector(".sidebar-glyph") ?? row
  ).getBoundingClientRect();
  return { x, y, width, height };
}

/* Whole pixels, both of them. 0.85rem is 13.6px, so every level of nesting used
   to push its glyph another 0.6px off the device grid — the icons at depth two
   were blurrier than the icons at depth one, for no reason anybody could name.
   RAIL matches --rail-offset in the stylesheet. */
const INDENT = 14;
const RAIL = 8;

function loadExpanded(): Set<string> {
  try {
    const raw = localStorage.getItem(EXPANDED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

interface TreeNode {
  scope: Scope;
  folder: FolderType;
  children: TreeNode[];
  /** Notes in this folder plus every folder under it, the way Finder counts. */
  total: number;
}

/**
 * Builds the folder tree.
 *
 * A parent that has been deleted leaves its children orphaned rather than
 * invisible: anything whose parent is missing is treated as top level, so a
 * folder can never disappear from the interface while its notes still exist.
 */
function buildTree(folders: FolderType[], counts: Map<string, number>): TreeNode[] {
  const known = new Set(folders.map((folder) => folder.id));
  const nodes = new Map<string, TreeNode>(
    folders.map((folder) => [
      folder.id,
      {
        folder,
        scope: { id: folder.id, label: folder.name, count: counts.get(folder.id) ?? 0 },
        children: [],
        total: counts.get(folder.id) ?? 0,
      },
    ]),
  );

  const roots: TreeNode[] = [];
  for (const folder of folders) {
    const node = nodes.get(folder.id)!;
    const parentId = folder.parentId ?? null;
    const parent = parentId && known.has(parentId) ? nodes.get(parentId) : undefined;
    if (parent && parent !== node) parent.children.push(node);
    else roots.push(node);
  }

  const total = (node: TreeNode, seen: Set<string>): number => {
    if (seen.has(node.folder.id)) return 0;
    seen.add(node.folder.id);
    node.total = node.scope.count + node.children.reduce((sum, c) => sum + total(c, seen), 0);
    return node.total;
  };
  for (const root of roots) total(root, new Set());
  return roots;
}

/** The ⋯ menu a folder carries: everything you can do to the folder itself. */
function FolderMenu({
  onRename,
  onNewSubfolder,
  onDelete,
}: {
  onRename: () => void;
  onNewSubfolder: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  useEffect(() => {
    if (!open) setConfirm(false);
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-label="Folder actions"
        aria-haspopup="menu"
        aria-expanded={open}
        className={`sidebar-action ${open ? "is-open" : ""}`}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div role="menu" className="popover menu-popover sidebar-menu">
          <button
            type="button"
            role="menuitem"
            className="menu-row text-ink-2"
            onClick={() => {
              setOpen(false);
              onRename();
            }}
          >
            <Pencil size={16} className="text-ink-3" />
            Rename folder
          </button>
          <button
            type="button"
            role="menuitem"
            className="menu-row text-ink-2"
            onClick={() => {
              setOpen(false);
              onNewSubfolder();
            }}
          >
            <FolderPlus size={16} className="text-ink-3" />
            New folder inside
          </button>
          <div className="menu-separator" />
          <button
            type="button"
            role="menuitem"
            className="menu-row text-danger"
            onClick={() => {
              if (!confirm) {
                setConfirm(true);
                return;
              }
              setOpen(false);
              onDelete();
            }}
          >
            <Trash2 size={16} />
            {confirm ? "Delete — click to confirm" : "Delete folder"}
          </button>
        </div>
      )}
    </div>
  );
}

/** A name being typed: a new folder, or an old one being renamed. */
function NameField({
  value,
  depth,
  placeholder,
  onCommit,
  onCancel,
}: {
  value: string;
  depth: number;
  placeholder?: string;
  onCommit: (name: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(value);
  return (
    /* An editing row has no disclosure column, so it pays the rail out of its
       own padding to keep its glyph on the same line as every other one. */
    <div className="sidebar-row is-editing" style={{ paddingLeft: `${RAIL + depth * INDENT}px` }}>
      <span className="sidebar-glyph" data-tone="folder">
        <Folder size={16} />
      </span>
      <input
        autoFocus
        value={draft}
        placeholder={placeholder}
        aria-label={placeholder ?? "Folder name"}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => onCommit(draft)}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Enter") onCommit(draft);
          if (event.key === "Escape") onCancel();
        }}
        className="sidebar-input"
      />
      <button
        type="button"
        aria-label="Cancel"
        className="sidebar-action"
        onMouseDown={(event) => event.preventDefault()}
        onClick={onCancel}
      >
        <X size={16} />
      </button>
    </div>
  );
}

function Row({
  scope,
  glyph,
  motion,
  depth = 0,
  active,
  droppable = true,
  disclosure,
  actions,
  onSelect,
  onContextMenu,
  onHold,
  movable = false,
  dropSide,
}: {
  scope: Scope;
  glyph: React.ReactNode;
  /** Which move this glyph makes when the pointer arrives on it. The
   *  stylesheet holds the moves; this only says which one. */
  motion?: string;
  depth?: number;
  active: boolean;
  droppable?: boolean;
  disclosure?: React.ReactNode;
  actions?: React.ReactNode;
  onSelect: () => void;
  onContextMenu?: (event: React.MouseEvent) => void;
  /** A mouse pressed and kept still; the click that ends it is not a select. */
  onHold?: (row: Element) => void;
  /** A folder that can be dragged to another place among the folders. */
  movable?: boolean;
  /** Where a folder being dragged over this one would land beside it. */
  dropSide?: (draggedId: string) => "before" | "after" | null;
}) {
  const {
    setNodeRef,
    isOver,
    active: carried,
  } = useDroppable({
    id: scope.id,
    disabled: !droppable,
  });
  const drag = useDraggable({ id: `${FOLDER_DRAG}${scope.id}`, disabled: !movable });
  const activeId = carried ? String(carried.id) : "";
  const folderOver = isOver && activeId.startsWith(FOLDER_DRAG);
  const side = folderOver ? (dropSide?.(activeId.slice(FOLDER_DRAG.length)) ?? null) : null;
  const hold = useRef<{ timer: number; x: number; y: number; fired: boolean } | null>(null);
  function holdEnd() {
    const press = hold.current;
    if (press && !press.fired) {
      window.clearTimeout(press.timer);
      hold.current = null;
    }
  }
  useEffect(() => () => window.clearTimeout(hold.current?.timer), []);
  return (
    <div
      ref={setNodeRef}
      className={`sidebar-row ${active ? "is-active" : ""} ${isOver && !folderOver ? "is-over" : ""} ${
        side ? `is-over-${side}` : ""
      } ${drag.isDragging ? "is-lifted" : ""}`}
      data-folder-row={onHold ? scope.id : undefined}
      style={{ paddingLeft: `${depth * INDENT}px` }}
      onContextMenu={onContextMenu}
    >
      <button
        ref={drag.setNodeRef}
        {...drag.attributes}
        {...drag.listeners}
        type="button"
        className="sidebar-target press"
        onClick={() => {
          if (hold.current?.fired) return void (hold.current = null);
          onSelect();
        }}
        onPointerDown={(event) => {
          drag.listeners?.onPointerDown?.(event);
          if (!onHold || event.pointerType !== "mouse" || event.button !== 0) return;
          window.clearTimeout(hold.current?.timer);
          const row = event.currentTarget;
          const press = { x: event.clientX, y: event.clientY, fired: false, timer: 0 };
          press.timer = window.setTimeout(() => {
            press.fired = true;
            onHold(row);
          }, HOLD_MS);
          hold.current = press;
        }}
        onPointerMove={(event) => {
          const press = hold.current;
          if (
            press &&
            !press.fired &&
            Math.hypot(event.clientX - press.x, event.clientY - press.y) > 6
          )
            holdEnd();
        }}
        onPointerUp={holdEnd}
        onPointerLeave={holdEnd}
        onPointerCancel={holdEnd}
      >
        <span className="sidebar-glyph" data-motion={motion} data-tone={motion}>
          {glyph}
        </span>
        <span className="sidebar-name">{scope.label}</span>
        {/* The dot replaces the count rather than crowding beside it: while
            something is new, how much is new is the only number worth
            reading, and the tally comes back the moment it has been. */}
        {scope.unread ? (
          <span className="sidebar-unread" aria-label={`${scope.unread} unread`}>
            {scope.unread}
          </span>
        ) : (
          <span className="sidebar-count">{scope.count || ""}</span>
        )}
      </button>
      {disclosure && <span className="sidebar-twisty">{disclosure}</span>}
      {actions && <span className="sidebar-actions">{actions}</span>}
    </div>
  );
}

export function Sidebar({
  scopes,
  folders,
  selectedId,
  canWrite,
  pinned,
  selectedNoteId,
  onSelectNote,
  onSelect,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onFolderInfo,
  onClose,
  closeInStrip = false,
  onSettings,
  onLock,
  onWhatsNew,
  whatsNewUnseen,
  spaceSwitch,
  peopleShelf,
  scopeLabel,
}: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(loadExpanded);
  /** Where a new folder is being typed: null for none, "" for the top level. */
  const [adding, setAdding] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  /* The same three actions the folder's own ⋯ carries, on the right button. */
  const folderMenu = useContextMenu<FolderType>();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const closeFolderMenu = useCallback(() => {
    folderMenu.close();
    setConfirmDelete(false);
  }, [folderMenu]);

  useEffect(() => {
    try {
      localStorage.setItem(EXPANDED_KEY, JSON.stringify([...expanded]));
    } catch {
      /* The preference is optional; the tree still opens without storage. */
    }
  }, [expanded]);

  const counts = useMemo(() => new Map(scopes.map((scope) => [scope.id, scope.count])), [scopes]);
  const tree = useMemo(() => buildTree(folders, counts), [folders, counts]);
  const all = scopes.find((scope) => scope.id === ALL);
  const trash = scopes.find((scope) => scope.id === TRASH);
  const archive = scopes.find((scope) => scope.id === ARCHIVE);
  const remarks = scopes.find((scope) => scope.id === REMARKS);

  function toggle(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function startSubfolder(parentId: string) {
    setExpanded((current) => new Set(current).add(parentId));
    setAdding(parentId);
  }

  function renderNode(node: TreeNode, depth: number): React.ReactNode {
    const open = expanded.has(node.folder.id);
    const hasChildren = node.children.length > 0;
    const active = selectedId === node.folder.id;

    if (renaming === node.folder.id) {
      return (
        <NameField
          key={node.folder.id}
          value={node.folder.name}
          depth={depth}
          onCommit={(name) => {
            setRenaming(null);
            const trimmed = name.trim();
            if (trimmed && trimmed !== node.folder.name) onRenameFolder(node.folder.id, trimmed);
          }}
          onCancel={() => setRenaming(null)}
        />
      );
    }

    return (
      <div key={node.folder.id}>
        <Row
          scope={{
            id: node.folder.id,
            label: node.folder.name,
            /* A closed folder counts everything it is hiding, so collapsing a
               branch never makes its notes look like they went away. */
            count: open || !hasChildren ? node.scope.count : node.total,
          }}
          glyph={active || (open && hasChildren) ? <FolderOpen size={16} /> : <Folder size={16} />}
          motion="folder"
          depth={depth}
          active={active}
          droppable={canWrite}
          disclosure={
            hasChildren ? (
              <button
                type="button"
                aria-label={open ? `Collapse ${node.folder.name}` : `Expand ${node.folder.name}`}
                aria-expanded={open}
                className={`sidebar-disclosure ${open ? "is-open" : ""}`}
                onClick={(event) => {
                  event.stopPropagation();
                  toggle(node.folder.id);
                }}
              >
                <ChevronRight size={16} />
              </button>
            ) : null
          }
          actions={
            canWrite ? (
              <FolderMenu
                onRename={() => setRenaming(node.folder.id)}
                onNewSubfolder={() => startSubfolder(node.folder.id)}
                onDelete={() => onDeleteFolder(node.folder.id)}
              />
            ) : undefined
          }
          movable={canWrite}
          dropSide={(draggedId) =>
            draggedId === node.folder.id ? null : folderDropSide(folders, draggedId, node.folder.id)
          }
          onSelect={() => onSelect(node.folder.id)}
          onHold={(row) => onFolderInfo(node.folder.id, glyphOrigin(row))}
          onContextMenu={(event) => {
            setConfirmDelete(false);
            folderMenu.open(event, node.folder);
          }}
        />

        {open && hasChildren && (
          <div className="sidebar-branch">
            {/* The inner element is what the grid row measures. Without it the
                0fr→1fr open animates only the first child, because every child
                after the first lands in an implicit `auto` row. */}
            <div className="sidebar-branch-inner">
              {node.children.map((child) => renderNode(child, depth + 1))}
            </div>
          </div>
        )}

        {canWrite && adding === node.folder.id && (
          <NameField
            value=""
            depth={depth + 1}
            placeholder="Folder name"
            onCommit={(name) => {
              setAdding(null);
              const trimmed = name.trim();
              if (trimmed) onCreateFolder(trimmed, node.folder.id);
            }}
            onCancel={() => setAdding(null)}
          />
        )}
      </div>
    );
  }

  return (
    <nav aria-label="Folders" className="sidebar-column flex h-full w-full shrink-0 flex-col">
      {/* No band of its own. Mail and Notes draw the sidebar as one column
          from the top of the window to the bottom, with the traffic lights
          standing in it and the toolbar's hairline starting where the content
          does; an empty strip here was a shelf of nothing over the people, and
          in full screen the one thing in the window off its axis. The element
          stays for the two places it holds something: the traffic lights'
          room on a Mac window (see the stylesheet), and the close button on
          the phone's folders sheet. */}
      <div
        className={`sidebar-topbar flex h-13 shrink-0 items-center gap-2 px-2 ${
          closeInStrip ? "has-close" : ""
        }`}
      >
        {closeInStrip && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Hide the sidebar"
            title="Hide the sidebar"
            className="toolbar-button press shrink-0"
          >
            <PanelLeftClose size={16} />
          </button>
        )}
      </div>

      <div className="sidebar-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {spaceSwitch}
        {peopleShelf}
        {all && (
          <Row
            scope={all}
            glyph={<NotebookText size={16} />}
            motion="notes"
            active={selectedId === ALL}
            onSelect={() => onSelect(ALL)}
          />
        )}

        {/* Pinned notes, above the folders and below All notes. A pin already
            floats a note to the top of its list; up here it is reachable from
            whichever list you are in, which is the thing pinning was for. The
            block simply is not there when nothing is pinned — an empty
            "Pinned" heading teaches the reader to ignore that part of the
            column. */}
        {pinned.length > 0 && (
          <>
            <p className="sidebar-heading">
              Pinned
              <span>{pinned.length}</span>
            </p>
            {pinned.map((note) => (
              <div
                key={note.id}
                className={`sidebar-row ${selectedNoteId === note.id ? "is-active" : ""}`}
              >
                <button
                  type="button"
                  aria-current={selectedNoteId === note.id ? "true" : undefined}
                  className="sidebar-target press"
                  onClick={() => onSelectNote(note.id)}
                >
                  <span className="sidebar-glyph" data-motion="pin" data-tone="pin">
                    <Pin size={16} />
                  </span>
                  <span className="sidebar-name truncate">{note.title || "Untitled"}</span>
                </button>
              </div>
            ))}
          </>
        )}

        {/* A heading and a tally, like every other heading in this column.
            The act that makes one lives in the strip above, where the window
            keeps the acts that are about the column rather than about a row
            in it. */}
        {/* New folder stands on the heading of the folders it adds to. It
            was in the window strip, beside the button that hides the column —
            two unrelated acts side by side above the people, and the one that
            makes a folder nowhere near the folders. */}
        <div className="sidebar-heading">
          Folders
          {canWrite ? (
            <button
              type="button"
              onClick={() => setAdding("")}
              aria-label="New folder"
              title="New folder"
              className="sidebar-heading-add press"
            >
              <FolderPlus size={16} />
            </button>
          ) : (
            <span>{folders.length || ""}</span>
          )}
        </div>

        {tree.length === 0 && adding === null && <p className="sidebar-empty">No folders yet.</p>}

        {tree.map((node) => renderNode(node, 0))}

        {canWrite && adding === "" && (
          <NameField
            value=""
            depth={0}
            placeholder="Folder name"
            onCommit={(name) => {
              setAdding(null);
              const trimmed = name.trim();
              if (trimmed) onCreateFolder(trimmed, null);
            }}
            onCancel={() => setAdding(null)}
          />
        )}
      </div>

      {/* Trash sits at the foot of the column rather than trailing the folder
          list. Left inline it floated at the top of a tall empty space with the
          account controls stranded far below it; down here the column reads as
          three settled blocks — where notes are, where deleted notes go, and
          what this session is.

          Archive shares that block, above Trash: both are places a note leaves
          the folders for, and the one you can come back from belongs first. */}
      {(remarks || archive || trash) && (
        <div className="sidebar-tail">
          {/* What has been said, above what has been filed and what has been
              thrown away. It is the one row here you can arrive at with
              something waiting in it, so it is the one row that can carry a
              dot, and the dot is all it carries. */}
          {remarks && (remarks.count > 0 || (remarks.unread ?? 0) > 0) && (
            <Row
              /* The row carries the dot and nothing else. A tally of notes
                 being talked about sits in the same slot the dot does and
                 clears only when the last thread is resolved — so once the dot
                 goes the number that replaces it reads as an unread count
                 stuck at one, which is the one thing a badge must never do. */
              scope={{ ...remarks, count: 0 }}
              glyph={<MessageSquare size={16} />}
              motion="remarks"
              active={selectedId === REMARKS}
              droppable={false}
              onSelect={() => onSelect(REMARKS)}
            />
          )}
          {archive && (
            <Row
              scope={archive}
              glyph={<Archive size={16} />}
              motion="archive"
              active={selectedId === ARCHIVE}
              droppable={false}
              onSelect={() => onSelect(ARCHIVE)}
            />
          )}
          {trash && (
            <Row
              scope={trash}
              glyph={<Trash2 size={16} />}
              motion="trash"
              active={selectedId === TRASH}
              droppable={false}
              onSelect={() => onSelect(TRASH)}
            />
          )}
        </div>
      )}

      {/* Where an application's account controls stand, which is what this
          block was built for and what the stylesheet still says it holds. The
          two of them left together when the top of the column grew a face;
          only the lock came back. */}
      <div className="sidebar-footer">
        <UpdateNotice />
        <WhatsNewButton unseen={whatsNewUnseen} onOpen={onWhatsNew} />
        <button
          type="button"
          className="sidebar-footer-button press"
          data-motion="settings"
          onClick={onSettings}
        >
          <span className="sidebar-glyph" data-tone="settings">
            <Settings size={16} />
          </span>
          <span>Settings</span>
        </button>
        <button
          type="button"
          className="sidebar-footer-button press"
          data-motion="lock"
          onClick={onLock}
        >
          <span className="sidebar-glyph" data-tone="lock">
            <Lock size={16} />
          </span>
          <span>Lock &amp; sign out</span>
        </button>
      </div>

      {folderMenu.target && (
        <ContextMenu point={folderMenu.target} onClose={closeFolderMenu}>
          <MenuButton
            onClick={() => {
              const id = folderMenu.target!.item.id;
              const row = document.querySelector(`[data-folder-row="${CSS.escape(id)}"]`);
              if (row) onFolderInfo(id, glyphOrigin(row));
              closeFolderMenu();
            }}
          >
            <Info size={16} />
            Folder info
          </MenuButton>
          {canWrite && (
            <>
              <div className="menu-separator" />
              <MenuButton
                onClick={() => {
                  setRenaming(folderMenu.target!.item.id);
                  closeFolderMenu();
                }}
              >
                <Pencil size={16} />
                Rename folder
              </MenuButton>
              <MenuButton
                onClick={() => {
                  startSubfolder(folderMenu.target!.item.id);
                  closeFolderMenu();
                }}
              >
                <FolderPlus size={16} />
                New folder inside
              </MenuButton>
              <div className="menu-separator" />
              <MenuButton
                danger
                onClick={() => {
                  if (!confirmDelete) return setConfirmDelete(true);
                  onDeleteFolder(folderMenu.target!.item.id);
                  closeFolderMenu();
                }}
              >
                <Trash2 size={16} />
                {confirmDelete ? "Delete — click to confirm" : "Delete folder"}
              </MenuButton>
            </>
          )}
        </ContextMenu>
      )}
    </nav>
  );
}
