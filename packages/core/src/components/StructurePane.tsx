/* The left column of a document: what it is made of, in the order it is read.
 *
 * Not a list of notes. A note list answers "what did I write lately"; this
 * answers "what comes after chapter three", so it is ordered by the document
 * and never by date, it numbers what it shows, and it counts words where a
 * list shows a line of the text. The parts are headings over stretches of the
 * one order (see `manuscript.ts`), and the notebook under it is everything
 * not placed yet — sources, fragments, what might become a chapter.
 *
 * A row is dragged to move it. A press that does not travel opens the chapter
 * — five pixels of travel is what tells them apart, the same distance the
 * note list waits for. The drop says where it will land with a line, before
 * the hand lets go, because a move you have to undo to read is a move nobody
 * makes twice. */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  ArrowDownUp,
  ChevronDown,
  FileText,
  FolderPlus,
  Info,
  NotebookText,
  Pencil,
  Plus,
  Trash2,
} from "@/components/icons";
import { ContextMenu } from "@/components/ContextMenu";
import { MenuItems } from "@/components/MenuPrimitives";
import { useSystemMenu } from "@/components/useSystemMenu";
import type { MenuItem } from "@/lib/menuShape";
import type { MenuPoint } from "@/lib/contextMenu";
import type { StructureRow } from "@/lib/manuscript";

export interface ChapterItem {
  id: string;
  title: string;
  words: number;
  folderId: string | null;
  position?: number | null;
  /** May this one be placed in the manuscript? A partner's notebook note in
   *  a shared manuscript is theirs — see `Notes.tsx`. */
  movable: boolean;
}

export type StructureTarget =
  | { kind: "before"; id: string }
  | { kind: "after"; id: string }
  | { kind: "part"; folderId: string }
  | { kind: "end" }
  | { kind: "notebook" };

function Row({
  item,
  number,
  selected,
  over,
  onOpen,
  onMenu,
}: {
  item: ChapterItem;
  number?: number;
  selected: boolean;
  over: "before" | "after" | null;
  onOpen: () => void;
  onMenu: (point: MenuPoint) => void;
}) {
  const drag = useDraggable({ id: item.id, disabled: !item.movable });
  const drop = useDroppable({ id: `row:${item.id}` });
  return (
    <button
      ref={(node) => {
        drag.setNodeRef(node);
        drop.setNodeRef(node);
      }}
      type="button"
      className={`structure-row press ${selected ? "is-selected" : ""} ${
        drag.isDragging ? "is-lifted" : ""
      } ${over ? `is-over-${over}` : ""}`}
      aria-current={selected ? "page" : undefined}
      {...drag.listeners}
      {...drag.attributes}
      onClick={onOpen}
      onContextMenu={(event) => {
        event.preventDefault();
        onMenu({ x: event.clientX, y: event.clientY });
      }}
    >
      {number !== undefined ? (
        <span className="structure-number">{number}</span>
      ) : (
        <FileText size={14} className="structure-number" />
      )}
      <span className="structure-title">{item.title || "Untitled"}</span>
      <span className="structure-words">{item.words.toLocaleString()}</span>
    </button>
  );
}

function PartHeading({
  id,
  name,
  continued,
  over,
  canWrite,
  editing,
  setEditing,
  onRename,
  onMenu,
}: {
  id: string;
  name: string;
  continued: boolean;
  over: boolean;
  canWrite: boolean;
  editing: boolean;
  setEditing: (editing: boolean) => void;
  onRename: (name: string) => void;
  onMenu: (point: MenuPoint) => void;
}) {
  const drop = useDroppable({ id: `part:${id}` });
  const [draft, setDraft] = useState(name);
  useEffect(() => {
    if (editing) setDraft(name);
  }, [editing, name]);
  return (
    <div
      ref={drop.setNodeRef}
      className={`structure-part ${over ? "is-over" : ""} ${continued ? "is-continued" : ""}`}
      onContextMenu={(event) => {
        event.preventDefault();
        onMenu({ x: event.clientX, y: event.clientY });
      }}
      onDoubleClick={() => canWrite && setEditing(true)}
    >
      {editing ? (
        <input
          autoFocus
          className="structure-part-field"
          aria-label="Part name"
          value={draft}
          maxLength={120}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            setEditing(false);
            if (draft.trim() && draft.trim() !== name) onRename(draft.trim());
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              setDraft(name);
              setEditing(false);
            }
          }}
        />
      ) : (
        <span>{name || "Untitled part"}</span>
      )}
    </div>
  );
}

function Zone({
  id,
  className,
  children,
}: {
  id: string;
  className: string;
  children?: ReactNode;
}) {
  const drop = useDroppable({ id });
  return (
    <div ref={drop.setNodeRef} className={`${className} ${drop.isOver ? "is-over" : ""}`}>
      {children}
    </div>
  );
}

function Menu({ point, items, close }: { point: MenuPoint; items: MenuItem[]; close: () => void }) {
  const taken = useSystemMenu(items, close);
  if (taken) return null;
  return (
    <ContextMenu point={point} onClose={close}>
      <MenuItems items={items} close={close} />
    </ContextMenu>
  );
}

export function StructurePane({
  header,
  footer,
  documentName,
  total,
  goal,
  rows,
  parts,
  notebook,
  notebookName,
  selectedId,
  canWrite,
  onOpen,
  onNewChapter,
  onNewPart,
  onNewNote,
  onRenamePart,
  onDeletePart,
  onMove,
  onTrash,
  onInfo,
}: {
  header?: ReactNode;
  footer?: ReactNode;
  documentName: string;
  total: number;
  goal?: number;
  rows: StructureRow<ChapterItem>[];
  parts: Map<string, string>;
  notebook: ChapterItem[];
  notebookName: string;
  selectedId: string | null;
  canWrite: boolean;
  onOpen: (id: string) => void;
  onNewChapter: (folderId: string | null) => void;
  onNewPart: () => void;
  onNewNote: () => void;
  onRenamePart: (id: string, name: string) => void;
  onDeletePart: (id: string) => void;
  onMove: (id: string, target: StructureTarget) => void;
  onTrash: (id: string) => void;
  onInfo: (id: string, point: MenuPoint) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [dragging, setDragging] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ point: MenuPoint; items: MenuItem[] } | null>(null);
  const [notebookOpen, setNotebookOpen] = useState(true);
  const [renaming, setRenaming] = useState<string | null>(null);

  const chapters = useMemo(
    () => rows.flatMap((row) => (row.kind === "chapter" ? [row.item] : [])),
    [rows],
  );
  const indexOf = (id: string) => chapters.findIndex((item) => item.id === id);
  const dragged = dragging
    ? (chapters.find((item) => item.id === dragging) ??
      notebook.find((item) => item.id === dragging))
    : undefined;

  /* Moving down lands after the row under the hand, moving up lands before
     it — the reading every sortable list has taught. From the notebook,
     which has no place in the order yet, it is always before. */
  function rowSide(targetId: string): "before" | "after" {
    if (!dragging) return "before";
    const from = indexOf(dragging);
    return from >= 0 && from < indexOf(targetId) ? "after" : "before";
  }

  function targetOf(over: string | null): StructureTarget | null {
    if (!over) return null;
    if (over === "notebook") return { kind: "notebook" };
    if (over === "end") return { kind: "end" };
    if (over.startsWith("part:")) return { kind: "part", folderId: over.slice(5) };
    if (over.startsWith("row:")) {
      const id = over.slice(4);
      if (id === dragging) return null;
      return { kind: rowSide(id), id };
    }
    return null;
  }

  function end(event: DragEndEvent) {
    const target = targetOf((event.over?.id as string | undefined) ?? null);
    const id = event.active.id as string;
    setDragging(null);
    setOverId(null);
    if (target) onMove(id, target);
  }

  function chapterMenu(item: ChapterItem, point: MenuPoint, placed: boolean) {
    const at = indexOf(item.id);
    const items: MenuItem[] = [
      {
        kind: "item",
        id: "open",
        label: placed ? "Open chapter" : "Open",
        run: () => onOpen(item.id),
      },
      {
        kind: "item",
        id: "info",
        label: "Info",
        icon: <Info size={16} />,
        run: () => onInfo(item.id, point),
      },
    ];
    if (canWrite && item.movable) {
      items.push({ kind: "separator" });
      if (placed) {
        if (at > 0)
          items.push({
            kind: "item",
            id: "up",
            label: "Move up",
            icon: <ArrowDownUp size={16} />,
            run: () => onMove(item.id, { kind: "before", id: chapters[at - 1].id }),
          });
        if (at < chapters.length - 1)
          items.push({
            kind: "item",
            id: "down",
            label: "Move down",
            run: () => onMove(item.id, { kind: "after", id: chapters[at + 1].id }),
          });
        if (parts.size > 0)
          items.push({
            kind: "item",
            id: "part",
            label: "Move to part",
            submenu: [...parts].map(([folderId, name]) => ({
              kind: "item" as const,
              id: `part-${folderId}`,
              label: name || "Untitled part",
              checked: item.folderId === folderId,
              run: () => onMove(item.id, { kind: "part", folderId }),
            })),
          });
        items.push({
          kind: "item",
          id: "unplace",
          label: `Back to ${notebookName}`,
          icon: <NotebookText size={16} />,
          run: () => onMove(item.id, { kind: "notebook" }),
        });
      } else {
        items.push({
          kind: "item",
          id: "place",
          label: "Make it a chapter",
          icon: <Plus size={16} />,
          run: () => onMove(item.id, { kind: "end" }),
        });
      }
      items.push(
        { kind: "separator" },
        {
          kind: "item",
          id: "trash",
          label: "Move to Trash",
          danger: true,
          icon: <Trash2 size={16} />,
          run: () => onTrash(item.id),
        },
      );
    }
    setMenu({ point, items });
  }

  function partMenu(folderId: string, point: MenuPoint) {
    if (!canWrite) return;
    setMenu({
      point,
      items: [
        {
          kind: "item",
          id: "chapter",
          label: "New chapter in this part",
          icon: <Plus size={16} />,
          run: () => onNewChapter(folderId),
        },
        {
          kind: "item",
          id: "rename",
          label: "Rename…",
          icon: <Pencil size={16} />,
          hint: "double-click",
          run: () => setRenaming(folderId),
        },
        { kind: "separator" },
        {
          kind: "item",
          id: "delete",
          label: "Delete part",
          danger: true,
          icon: <Trash2 size={16} />,
          submenu: [
            {
              kind: "item",
              id: "delete-yes",
              label: "Delete — its chapters stay",
              danger: true,
              run: () => onDeletePart(folderId),
            },
          ],
        },
      ],
    });
  }

  const over = targetOf(overId);
  const progress = goal ? Math.min(1, total / goal) : 0;

  return (
    <aside className="structure-pane" aria-label="Structure">
      {header}
      <div className="structure-total">
        <strong>{documentName}</strong>
        <span>
          {total.toLocaleString()}
          {goal ? ` of ${goal.toLocaleString()} words` : " words"}
        </span>
        {goal ? (
          <span className="structure-goal" aria-hidden="true">
            <i style={{ transform: `scaleX(${progress})` }} />
          </span>
        ) : null}
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={(event) => setDragging(event.active.id as string)}
        onDragOver={(event) => setOverId((event.over?.id as string | undefined) ?? null)}
        onDragCancel={() => {
          setDragging(null);
          setOverId(null);
        }}
        onDragEnd={end}
      >
        <div className="structure-scroll">
          <div className="structure-heading">
            <span>Structure</span>
            {canWrite && (
              <span className="structure-heading-actions">
                <button
                  type="button"
                  className="toolbar-button press"
                  aria-label="New part"
                  title="New part"
                  onClick={onNewPart}
                >
                  <FolderPlus size={15} />
                </button>
                <button
                  type="button"
                  className="toolbar-button press"
                  aria-label="New chapter"
                  title="New chapter · ⌘N"
                  onClick={() => onNewChapter(null)}
                >
                  <Plus size={15} />
                </button>
              </span>
            )}
          </div>

          {rows.length === 0 && canWrite && (
            <button
              type="button"
              className="structure-empty press"
              onClick={() => onNewChapter(null)}
            >
              Begin the first chapter
            </button>
          )}

          {rows.map((row) =>
            row.kind === "part" ? (
              <PartHeading
                key={`part:${row.folderId}:${row.continued}`}
                id={row.folderId}
                name={parts.get(row.folderId) ?? ""}
                continued={row.continued}
                over={over?.kind === "part" && over.folderId === row.folderId}
                canWrite={canWrite}
                editing={renaming === row.folderId && !row.continued}
                setEditing={(on) => setRenaming(on ? row.folderId : null)}
                onRename={(name) => onRenamePart(row.folderId, name)}
                onMenu={(point) => partMenu(row.folderId, point)}
              />
            ) : (
              <Row
                key={row.item.id}
                item={row.item}
                number={row.number}
                selected={row.item.id === selectedId}
                over={
                  over &&
                  (over.kind === "before" || over.kind === "after") &&
                  over.id === row.item.id
                    ? over.kind
                    : null
                }
                onOpen={() => onOpen(row.item.id)}
                onMenu={(point) => chapterMenu(row.item, point, true)}
              />
            ),
          )}
          {/* Always there, so nothing moves under the hand when a drag
              starts: a target that appears with the drag pushes the one the
              hand was heading for out from under it. */}
          {rows.length > 0 && <Zone id="end" className="structure-end" />}

          <Zone id="notebook" className="structure-notebook">
            <div className="structure-heading">
              <button
                type="button"
                className="structure-fold press"
                aria-expanded={notebookOpen}
                onClick={() => setNotebookOpen((open) => !open)}
              >
                <ChevronDown size={13} className={notebookOpen ? "" : "-rotate-90"} />
                {notebookName}
                <small>{notebook.length || ""}</small>
              </button>
              {canWrite && (
                <span className="structure-heading-actions">
                  <button
                    type="button"
                    className="toolbar-button press"
                    aria-label={`New page in ${notebookName}`}
                    title={`New page in ${notebookName}`}
                    onClick={onNewNote}
                  >
                    <Plus size={15} />
                  </button>
                </span>
              )}
            </div>
            {notebookOpen &&
              notebook.map((item) => (
                <Row
                  key={item.id}
                  item={item}
                  selected={item.id === selectedId}
                  over={null}
                  onOpen={() => onOpen(item.id)}
                  onMenu={(point) => chapterMenu(item, point, false)}
                />
              ))}
          </Zone>
        </div>

        <DragOverlay dropAnimation={null}>
          {dragged ? (
            <div className="drag-chip structure-chip">{dragged.title || "Untitled"}</div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {footer}
      {menu && <Menu point={menu.point} items={menu.items} close={() => setMenu(null)} />}
    </aside>
  );
}
