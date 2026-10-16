/* Scrivener's corkboard: the chapters as index cards, in the order they are
 * read, with what each one is about written on it. It is the structure laid
 * out wide rather than a second list — the same rows, the same move, the same
 * chapter info — so a card dragged here is a row moved there.
 *
 * The synopsis is written on the card itself, which is the whole use of a
 * corkboard: reading the book's shape and changing it in one place. The card's
 * head is what is held to move it and pressed to open it; the synopsis is for
 * writing, so pressing it never picks the card up. */
import { useState, type CSSProperties, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  CHAPTER_STATUSES,
  SYNOPSIS_LIMIT,
  dropTarget,
  type StructureRow,
  type StructureTarget,
} from "@/lib/manuscript";
import type { ChapterInfo } from "@/lib/types";
import type { MenuItem } from "@/lib/menuShape";
import type { MenuPoint } from "@/lib/contextMenu";
import { PointMenu } from "@/components/ContextMenu";
import { Plus } from "@/components/icons";
import { ChapterField, type ChapterItem } from "./StructurePane";
import { chapterMenuItems, partMenuItems, type StructureActions } from "./structureMenus";

function Card({
  item,
  number,
  over,
  canWrite,
  onOpen,
  onChapter,
  onMenu,
  goal,
  onGoalDone,
  index,
}: {
  item: ChapterItem;
  /** Absent for a page of the notebook, which is not in the book's order. */
  number?: number;
  over: "before" | "after" | null;
  canWrite: boolean;
  onOpen: () => void;
  onChapter?: (info: ChapterInfo | undefined) => void;
  onMenu?: (point: MenuPoint) => void;
  /** The goal field is open under this card. */
  goal?: boolean;
  onGoalDone?: () => void;
  /** Its place in the cascade the board arrives in. */
  index: number;
}) {
  const drag = useDraggable({ id: item.id, disabled: !canWrite || !item.movable });
  const drop = useDroppable({ id: `row:${item.id}` });
  const info = item.chapter;
  const [draft, setDraft] = useState<string | null>(null);
  const status = CHAPTER_STATUSES.find((one) => one.id === info?.status);
  const save = () => {
    if (draft === null || !onChapter) return;
    const next: ChapterInfo = { ...info };
    if (draft.trim()) next.synopsis = draft.trim();
    else delete next.synopsis;
    setDraft(null);
    if ((next.synopsis ?? "") !== (info?.synopsis ?? ""))
      onChapter(Object.keys(next).length > 0 ? next : undefined);
  };
  return (
    <article
      ref={drop.setNodeRef}
      data-card={item.id}
      className={`board-card ${drag.isDragging ? "is-lifted" : ""} ${over ? `is-over-${over}` : ""}`}
      style={{ "--index": index } as CSSProperties}
      onContextMenu={(event) => {
        if (!onMenu) return;
        event.preventDefault();
        onMenu({ x: event.clientX, y: event.clientY });
      }}
    >
      <button
        ref={drag.setNodeRef}
        type="button"
        className="board-card-head press"
        {...drag.listeners}
        {...drag.attributes}
        onClick={onOpen}
      >
        {number !== undefined && <span className="board-card-number">{number}</span>}
        <span className="board-card-title">{item.title || item.preview || "Untitled"}</span>
      </button>
      {canWrite && onChapter ? (
        <textarea
          className="board-card-synopsis"
          aria-label={`Synopsis of ${item.title || "Untitled"}`}
          placeholder="What happens here"
          maxLength={SYNOPSIS_LIMIT}
          value={draft ?? info?.synopsis ?? ""}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={save}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setDraft(null);
              event.currentTarget.blur();
            }
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey))
              event.currentTarget.blur();
          }}
        />
      ) : (
        <p className="board-card-synopsis">{info?.synopsis}</p>
      )}
      {goal && onChapter && onGoalDone && (
        <ChapterField field="goal" info={info} onSave={onChapter} onDone={onGoalDone} />
      )}
      <footer className="board-card-foot">
        {status && (
          <span>
            <i className={`structure-status is-${status.id}`} />
            {status.label}
          </span>
        )}
        <span
          className={`board-card-words ${info?.goal && item.words >= info.goal ? "is-met" : ""}`}
        >
          {item.words.toLocaleString()}
          {info?.goal ? ` / ${info.goal.toLocaleString()}` : ""}
        </span>
      </footer>
    </article>
  );
}

function Part({
  id,
  name,
  editing,
  onRename,
  onMenu,
}: {
  id: string;
  name: string;
  editing: boolean;
  onRename?: (name: string | null) => void;
  onMenu?: (point: MenuPoint) => void;
}) {
  const drop = useDroppable({ id: `part:${id}` });
  return (
    <h3
      ref={drop.setNodeRef}
      className={`board-part ${drop.isOver ? "is-over" : ""}`}
      onContextMenu={(event) => {
        if (!onMenu) return;
        event.preventDefault();
        onMenu({ x: event.clientX, y: event.clientY });
      }}
      onDoubleClick={() => onMenu && onRename?.(name)}
    >
      {editing && onRename ? (
        <input
          autoFocus
          className="structure-part-field"
          aria-label="Part name"
          defaultValue={name}
          maxLength={120}
          onBlur={(event) => onRename(event.currentTarget.value.trim() || null)}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") onRename(null);
          }}
        />
      ) : (
        name || "Untitled part"
      )}
    </h3>
  );
}

export function ChapterBoard({
  lead,
  titlebar,
  rows,
  parts,
  notebook = [],
  notebookName = "Notes",
  canWrite,
  onOpen,
  onMove,
  onChapter,
  actions,
  onRenamePart,
}: {
  /** What stands at the start of the strip: the button that brings the
   *  structure back when it is hidden. */
  lead?: ReactNode;
  /** The window's strip over a book, when the board stands in a window. */
  titlebar?: ReactNode;
  rows: StructureRow<ChapterItem>[];
  parts: Map<string, string>;
  /** The pages that are not chapters, after the book. */
  notebook?: ChapterItem[];
  notebookName?: string;
  canWrite: boolean;
  onOpen: (id: string) => void;
  onMove: (id: string, target: StructureTarget) => void;
  onChapter?: (id: string, info: ChapterInfo | undefined) => void;
  /** Where the board is the whole structure, a card carries the row's menu. */
  actions?: Omit<StructureActions, "chapters" | "parts" | "canWrite" | "write" | "rename">;
  onRenamePart?: (id: string, name: string) => void;
}) {
  const [menu, setMenu] = useState<{ point: MenuPoint; items: MenuItem[] } | null>(null);
  const [goalFor, setGoalFor] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const full: StructureActions | null = actions
    ? {
        ...actions,
        chapters: rows.flatMap((row) => (row.kind === "chapter" ? [row.item] : [])),
        parts,
        canWrite,
        onChapter,
        write: (id, field) => {
          if (field === "goal") setGoalFor(id);
          else document.querySelector<HTMLTextAreaElement>(`[data-card="${id}"] textarea`)?.focus();
        },
        rename: setRenaming,
      }
    : null;
  let cascade = 0;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [dragging, setDragging] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const order = rows.flatMap((row) => (row.kind === "chapter" ? [row.item.id] : []));
  const over = dropTarget(overId, dragging, order);
  const lifted =
    rows.find((row) => row.kind === "chapter" && row.item.id === dragging) ??
    (notebook.some((item) => item.id === dragging)
      ? {
          kind: "chapter" as const,
          item: notebook.find((item) => item.id === dragging)!,
          number: 0,
        }
      : undefined);

  return (
    <section className="editor-shell manuscript-shell flex min-w-0 flex-1 flex-col">
      {titlebar}
      <div className="manuscript-bar shrink-0">
        {lead}
        <span className="manuscript-bar-quiet">Board</span>
        {canWrite && actions && (
          <span className="manuscript-bar-end">
            <button
              type="button"
              className="ribbon-tool press"
              onClick={() => actions.onNewChapter(null)}
            >
              <Plus size={16} />
              <span>New chapter</span>
            </button>
          </span>
        )}
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
        onDragEnd={(event) => {
          const target = dropTarget(
            (event.over?.id as string | undefined) ?? null,
            event.active.id as string,
            order,
          );
          setDragging(null);
          setOverId(null);
          if (target) onMove(event.active.id as string, target);
        }}
      >
        <div className="board-desk min-h-0 flex-1">
          <div className="board-grid">
            {rows.map((row) =>
              row.kind === "part" ? (
                <Part
                  key={`part:${row.folderId}:${row.continued}`}
                  id={row.folderId}
                  name={parts.get(row.folderId) ?? ""}
                  editing={renaming === row.folderId}
                  onRename={
                    onRenamePart &&
                    ((name) => {
                      if (renaming === null) return setRenaming(row.folderId);
                      setRenaming(null);
                      if (name && name !== parts.get(row.folderId))
                        onRenamePart(row.folderId, name);
                    })
                  }
                  onMenu={
                    full && canWrite
                      ? (point) => setMenu({ point, items: partMenuItems(full, row.folderId) })
                      : undefined
                  }
                />
              ) : (
                <Card
                  key={row.item.id}
                  item={row.item}
                  number={row.number}
                  canWrite={canWrite}
                  over={
                    over &&
                    (over.kind === "before" || over.kind === "after") &&
                    over.id === row.item.id
                      ? over.kind
                      : null
                  }
                  onOpen={() => onOpen(row.item.id)}
                  onChapter={onChapter && ((info) => onChapter(row.item.id, info))}
                  onMenu={
                    full
                      ? (point) =>
                          setMenu({ point, items: chapterMenuItems(full, row.item, point, true) })
                      : undefined
                  }
                  goal={goalFor === row.item.id}
                  onGoalDone={() => setGoalFor(null)}
                  index={cascade++}
                />
              ),
            )}
            {notebook.length > 0 && <h3 className="board-part">{notebookName}</h3>}
            {notebook.map((item) => (
              <Card
                key={item.id}
                item={item}
                canWrite={canWrite}
                over={null}
                onOpen={() => onOpen(item.id)}
                onMenu={
                  full
                    ? (point) =>
                        setMenu({ point, items: chapterMenuItems(full, item, point, false) })
                    : undefined
                }
                index={cascade++}
              />
            ))}
          </div>
        </div>
        <DragOverlay dropAnimation={null}>
          {lifted?.kind === "chapter" ? (
            <div className="drag-chip structure-chip">{lifted.item.title || "Untitled"}</div>
          ) : null}
        </DragOverlay>
      </DndContext>
      {menu && <PointMenu point={menu.point} items={menu.items} close={() => setMenu(null)} />}
    </section>
  );
}
