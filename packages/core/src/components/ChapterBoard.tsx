/* Scrivener's corkboard: the chapters as index cards, in the order they are
 * read, with what each one is about written on it. It is the structure laid
 * out wide rather than a second list — the same rows, the same move, the same
 * chapter info — so a card dragged here is a row moved there.
 *
 * The synopsis is written on the card itself, which is the whole use of a
 * corkboard: reading the book's shape and changing it in one place. The card's
 * head is what is held to move it and pressed to open it; the synopsis is for
 * writing, so pressing it never picks the card up. */
import { useState, type ReactNode } from "react";
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
import type { ChapterItem } from "./StructurePane";

function Card({
  item,
  number,
  over,
  canWrite,
  onOpen,
  onChapter,
}: {
  item: ChapterItem;
  number: number;
  over: "before" | "after" | null;
  canWrite: boolean;
  onOpen: () => void;
  onChapter?: (info: ChapterInfo | undefined) => void;
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
      className={`board-card ${drag.isDragging ? "is-lifted" : ""} ${over ? `is-over-${over}` : ""}`}
    >
      <button
        ref={drag.setNodeRef}
        type="button"
        className="board-card-head press"
        {...drag.listeners}
        {...drag.attributes}
        onClick={onOpen}
      >
        <span className="board-card-number">{number}</span>
        <span className="board-card-title">{item.title || "Untitled"}</span>
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

function Part({ id, name }: { id: string; name: string }) {
  const drop = useDroppable({ id: `part:${id}` });
  return (
    <h3 ref={drop.setNodeRef} className={`board-part ${drop.isOver ? "is-over" : ""}`}>
      {name || "Untitled part"}
    </h3>
  );
}

export function ChapterBoard({
  lead,
  rows,
  parts,
  canWrite,
  onOpen,
  onMove,
  onChapter,
}: {
  /** What stands at the start of the strip: the button that brings the
   *  structure back when it is hidden. */
  lead?: ReactNode;
  rows: StructureRow<ChapterItem>[];
  parts: Map<string, string>;
  canWrite: boolean;
  onOpen: (id: string) => void;
  onMove: (id: string, target: StructureTarget) => void;
  onChapter?: (id: string, info: ChapterInfo | undefined) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [dragging, setDragging] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const order = rows.flatMap((row) => (row.kind === "chapter" ? [row.item.id] : []));
  const over = dropTarget(overId, dragging, order);
  const lifted = rows.find((row) => row.kind === "chapter" && row.item.id === dragging);

  return (
    <section className="editor-shell manuscript-shell flex min-w-0 flex-1 flex-col">
      <div className="manuscript-bar shrink-0">
        {lead}
        <span className="manuscript-bar-quiet">Board</span>
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
                />
              ),
            )}
          </div>
        </div>
        <DragOverlay dropAnimation={null}>
          {lifted?.kind === "chapter" ? (
            <div className="drag-chip structure-chip">{lifted.item.title || "Untitled"}</div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </section>
  );
}
