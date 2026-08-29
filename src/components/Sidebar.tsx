import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import {
  ChevronRight,
  Folder,
  FolderOpen,
  FolderPlus,
  Lock,
  MoreHorizontal,
  NotebookText,
  PanelLeftClose,
  Pencil,
  Settings as SettingsIcon,
  Trash2,
  X,
} from "lucide-react";
import { ALL, TRASH } from "@/lib/scopes";
import type { Folder as FolderType } from "@/lib/types";
import { ContextMenu } from "./ContextMenu";
import { useContextMenu } from "@/lib/contextMenu";
import { MenuButton } from "./WorkspaceMenus";

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
}

interface Props {
  scopes: Scope[];
  folders: FolderType[];
  selectedId: string;
  canWrite: boolean;
  onSelect: (id: string) => void;
  onCreateFolder: (name: string, parentId: string | null) => void;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFolder: (id: string) => void;
  onClose: () => void;
  onSettings: () => void;
  onLock: () => void;
  /** The archive switch, which belongs above the destinations it re-points. */
  archiveSwitch: React.ReactNode;
}

const EXPANDED_KEY = "napp:folders-open";

/* Whole pixels, both of them. 0.85rem is 13.6px, so every level of nesting used
   to push its glyph another 0.6px off the device grid — the icons at depth two
   were blurrier than the icons at depth one, for no reason anybody could name.
   RAIL matches --rail-offset in the stylesheet. */
const INDENT = 14;
const RAIL = 18;

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
        <MoreHorizontal size={14} />
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
          <p className="menu-note">Deleting a folder never deletes its notes; they go unfiled.</p>
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
      <span className="sidebar-glyph">
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
        <X size={14} />
      </button>
    </div>
  );
}

function Row({
  scope,
  glyph,
  depth = 0,
  active,
  droppable = true,
  disclosure,
  actions,
  onSelect,
  onContextMenu,
}: {
  scope: Scope;
  glyph: React.ReactNode;
  depth?: number;
  active: boolean;
  droppable?: boolean;
  disclosure?: React.ReactNode;
  actions?: React.ReactNode;
  onSelect: () => void;
  onContextMenu?: (event: React.MouseEvent) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: scope.id, disabled: !droppable });
  return (
    <div
      ref={setNodeRef}
      className={`sidebar-row ${active ? "is-active" : ""} ${isOver ? "is-over" : ""}`}
      style={{ paddingLeft: `${depth * INDENT}px` }}
      onContextMenu={onContextMenu}
    >
      <span className="sidebar-twisty">{disclosure}</span>
      <button type="button" className="sidebar-target press" onClick={onSelect}>
        <span className="sidebar-glyph">{glyph}</span>
        <span className="sidebar-name">{scope.label}</span>
        <span className="sidebar-count">{scope.count || ""}</span>
      </button>
      {actions && <span className="sidebar-actions">{actions}</span>}
    </div>
  );
}

export function Sidebar({
  scopes,
  folders,
  selectedId,
  canWrite,
  onSelect,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onClose,
  onSettings,
  onLock,
  archiveSwitch,
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
                <ChevronRight size={14} />
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
          onSelect={() => onSelect(node.folder.id)}
          onContextMenu={
            canWrite
              ? (event) => {
                  setConfirmDelete(false);
                  folderMenu.open(event, node.folder);
                }
              : undefined
          }
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
      <div className="sidebar-topbar flex h-13 shrink-0 items-center gap-1 px-2">
        {canWrite && (
          <button
            type="button"
            aria-label="New folder"
            title="New folder"
            className="toolbar-button press shrink-0"
            onClick={() => setAdding("")}
          >
            <FolderPlus size={16} />
          </button>
        )}
        <span className="ml-auto" />
        <button
          type="button"
          onClick={onClose}
          aria-label="Hide the sidebar"
          title="Hide the sidebar"
          className="toolbar-button press shrink-0"
        >
          <PanelLeftClose size={16} />
        </button>
      </div>

      <div className="px-2 pb-2">{archiveSwitch}</div>

      <div className="sidebar-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {all && (
          <Row
            scope={all}
            glyph={<NotebookText size={16} />}
            active={selectedId === ALL}
            onSelect={() => onSelect(ALL)}
          />
        )}

        <p className="sidebar-heading">
          Folders
          <span>{folders.length || ""}</span>
        </p>

        {tree.length === 0 && adding === null && (
          <p className="sidebar-empty">
            {canWrite ? (
              <>
                No folders yet. Use <FolderPlus size={12} /> above to make one.
              </>
            ) : (
              "No folders yet."
            )}
          </p>
        )}

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
          what this session is. */}
      {trash && (
        <div className="sidebar-tail">
          <Row
            scope={trash}
            glyph={<Trash2 size={16} />}
            active={selectedId === TRASH}
            droppable={false}
            onSelect={() => onSelect(TRASH)}
          />
        </div>
      )}

      <div className="sidebar-footer">
        <button type="button" className="sidebar-footer-button press" onClick={onSettings}>
          <SettingsIcon size={16} />
          <span>Settings</span>
          <ChevronRight size={14} className="ml-auto opacity-40" />
        </button>
        <button type="button" className="sidebar-footer-button press" onClick={onLock}>
          <Lock size={16} />
          <span>Lock &amp; sign out</span>
        </button>
      </div>

      {canWrite && folderMenu.target && (
        <ContextMenu point={folderMenu.target} onClose={closeFolderMenu}>
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
          <p className="menu-note">Deleting a folder never deletes its notes; they go unfiled.</p>
        </ContextMenu>
      )}
    </nav>
  );
}
