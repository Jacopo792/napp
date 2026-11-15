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
import { MoreHorizontal, Plus } from "@/components/icons";
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
  detail = false,
  direction = null,
}: {
  direction?: "down" | "up" | null;
  /** The chapter picked on the spine, drawn large under it: it is not picked
   *  up itself — its block on the spine is. */
  detail?: boolean;
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
  const drag = useDraggable({
    id: detail ? `detail:${item.id}` : item.id,
    disabled: detail || !canWrite || !item.movable,
  });
  const drop = useDroppable({ id: detail ? `detail:${item.id}` : `row:${item.id}` });
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
      data-from={detail && direction ? (direction === "down" ? "below" : "above") : undefined}
      className={`board-card ${detail ? "is-detail" : ""} ${drag.isDragging ? "is-lifted" : ""} ${over ? `is-over-${over}` : ""}`}
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
      {/* Everything a card can do was behind a right-click nothing pointed to. */}
      {onMenu && (
        <button
          type="button"
          className="board-card-more press"
          aria-label={`Actions for ${item.title || "Untitled"}`}
          onClick={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            onMenu({ x: box.left, y: box.bottom + 4 });
          }}
        >
          <MoreHorizontal size={16} />
        </button>
      )}
      {detail ? (
        /* The page itself, as far as it goes, rather than a summary of it. */
        <p className="board-card-preview" translate="no">
          {item.preview || "Empty page"}
        </p>
      ) : canWrite && onChapter ? (
        <textarea
          className="board-card-synopsis"
          aria-label={`Synopsis of ${item.title || "Untitled"}`}
          placeholder="Synopsis"
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
        <p className="board-card-synopsis">{info?.synopsis ?? item.preview}</p>
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
          {item.words === 1 && !info?.goal ? " word" : " words"}
        </span>
      </footer>
    </article>
  );
}

/** A chapter in the board's list: its number, its name, how far along. */
function BoardRow({
  item,
  number,
  chosen,
  over,
  canWrite,
  onChoose,
  onOpen,
  onMenu,
}: {
  item: ChapterItem;
  /** Absent for a page of the notebook, which is not in the book's order. */
  number?: number;
  chosen: boolean;
  over: "before" | "after" | null;
  canWrite: boolean;
  onChoose: () => void;
  onOpen: () => void;
  onMenu?: (point: MenuPoint) => void;
}) {
  const drag = useDraggable({ id: item.id, disabled: !canWrite || !item.movable });
  const drop = useDroppable({ id: `row:${item.id}`, disabled: number === undefined });
  const status = CHAPTER_STATUSES.find((one) => one.id === item.chapter?.status);
  return (
    <button
      ref={(node) => {
        drag.setNodeRef(node);
        drop.setNodeRef(node);
      }}
      type="button"
      className={`board-row press ${chosen ? "is-chosen" : ""} ${
        drag.isDragging ? "is-lifted" : ""
      } ${over ? `is-over-${over}` : ""}`}
      {...drag.listeners}
      {...drag.attributes}
      aria-pressed={chosen}
      onClick={onChoose}
      onDoubleClick={onOpen}
      onContextMenu={(event) => {
        if (!onMenu) return;
        event.preventDefault();
        onChoose();
        onMenu({ x: event.clientX, y: event.clientY });
      }}
    >
      {number !== undefined && <span className="board-row-number">{number}</span>}
      <span className="board-row-title">{item.title || item.preview || "Untitled"}</span>
      {status && <i className={`structure-status is-${status.id}`} />}
      <span className="board-row-words">{item.words.toLocaleString()}</span>
    </button>
  );
}

/** A part's name over its chapters in the list, with their words together.
 *  Dropping a chapter on it puts the chapter in the part. */
function BoardPart({
  id,
  name,
  words,
  editing,
  onMenu,
  onRename,
}: {
  id: string;
  name: string;
  words: number;
  editing: boolean;
  onMenu?: (point: MenuPoint) => void;
  /** Called with null to start or cancel, with a name to keep it. */
  onRename?: (name: string | null) => void;
}) {
  const drop = useDroppable({ id: `part:${id}` });
  return (
    <div
      ref={drop.setNodeRef}
      className={`board-list-head ${drop.isOver ? "is-over" : ""}`}
      onContextMenu={(event) => {
        if (!onMenu) return;
        event.preventDefault();
        onMenu({ x: event.clientX, y: event.clientY });
      }}
      onDoubleClick={() => onMenu && onRename?.(null)}
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
        <span className="truncate">{name || "Untitled part"}</span>
      )}
      <span className="board-row-words">{words.toLocaleString()}</span>
    </div>
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
  /** What stands at the start of the strip: on a phone, the way to the
   *  structure. */
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
  const [chosenId, setChosenId] = useState<string | null>(null);
  /* Which way the detail arrives: from below when a later row is picked, from
     above for an earlier one — the notes' own page turn. */
  const [direction, setDirection] = useState<"down" | "up" | null>(null);
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
          {rows.length === 0 && notebook.length === 0 && (
            <div className="board-empty">
              <p>No chapters yet</p>
              {canWrite && actions && (
                <button
                  type="button"
                  className="space-list-button press"
                  onClick={() => actions.onNewChapter(null)}
                >
                  <Plus size={14} />
                  New chapter
                </button>
              )}
            </div>
          )}
          {(rows.length > 0 || notebook.length > 0) &&
            (() => {
              /* The book as a list on the left, by part, and the chapter picked
                 in it on the right, where its synopsis is written. */
              const chapters = rows.flatMap((row) =>
                row.kind === "chapter" ? [{ item: row.item, number: row.number }] : [],
              );
              const all: { item: ChapterItem; number?: number }[] = [
                ...chapters,
                ...notebook.map((item) => ({ item })),
              ];
              const chosen = all.find((one) => one.item.id === chosenId) ?? all[0];
              const choose = (id: string) => {
                if (id === chosen?.item.id) return;
                const from = all.findIndex((one) => one.item.id === chosen?.item.id);
                const to = all.findIndex((one) => one.item.id === id);
                setDirection(to > from ? "down" : "up");
                setChosenId(id);
              };
              const partWords = (folderId: string) =>
                chapters
                  .filter((one) => one.item.folderId === folderId)
                  .reduce((sum, one) => sum + one.item.words, 0);
              const row = (item: ChapterItem, number?: number) => (
                <BoardRow
                  key={item.id}
                  item={item}
                  number={number}
                  chosen={item.id === chosen?.item.id}
                  canWrite={canWrite}
                  over={
                    number !== undefined &&
                    over &&
                    (over.kind === "before" || over.kind === "after") &&
                    over.id === item.id
                      ? over.kind
                      : null
                  }
                  onChoose={() => choose(item.id)}
                  onOpen={() => onOpen(item.id)}
                  onMenu={
                    full
                      ? (point) =>
                          setMenu({
                            point,
                            items: chapterMenuItems(full, item, point, number !== undefined),
                          })
                      : undefined
                  }
                />
              );
              return (
                <div className="board-split">
                  <nav className="board-list" aria-label="Chapters">
                    {rows.map((one) =>
                      one.kind === "part" ? (
                        <BoardPart
                          key={`part:${one.folderId}:${one.continued}`}
                          id={one.folderId}
                          name={parts.get(one.folderId) ?? ""}
                          words={partWords(one.folderId)}
                          editing={renaming === one.folderId}
                          onRename={
                            onRenamePart &&
                            ((name) => {
                              if (renaming === null) return setRenaming(one.folderId);
                              setRenaming(null);
                              if (name && name !== parts.get(one.folderId))
                                onRenamePart(one.folderId, name);
                            })
                          }
                          onMenu={
                            full && canWrite
                              ? (point) =>
                                  setMenu({ point, items: partMenuItems(full, one.folderId) })
                              : undefined
                          }
                        />
                      ) : (
                        row(one.item, one.number)
                      ),
                    )}
                    {notebook.length > 0 && (
                      <div className="board-list-head is-notebook">{notebookName}</div>
                    )}
                    {notebook.map((item) => row(item))}
                  </nav>
                  {chosen && (
                    <Card
                      key={chosen.item.id}
                      detail
                      direction={direction}
                      item={chosen.item}
                      number={chosen.number}
                      canWrite={canWrite}
                      over={null}
                      onOpen={() => onOpen(chosen.item.id)}
                      onChapter={
                        chosen.number !== undefined && onChapter
                          ? (info) => onChapter(chosen.item.id, info)
                          : undefined
                      }
                      onMenu={
                        full
                          ? (point) =>
                              setMenu({
                                point,
                                items: chapterMenuItems(
                                  full,
                                  chosen.item,
                                  point,
                                  chosen.number !== undefined,
                                ),
                              })
                          : undefined
                      }
                      goal={goalFor === chosen.item.id}
                      onGoalDone={() => setGoalFor(null)}
                      index={0}
                    />
                  )}
                </div>
              );
            })()}
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
