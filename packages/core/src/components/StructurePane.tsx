/* The left column of a document: what it is made of, in the order it is read.
 *
 * Not a list of notes. A note list answers "what did I write lately"; this
 * answers "what comes after chapter three", so it is ordered by the document
 * and never by date, it numbers what it shows, and it counts words where a
 * list shows a line of the text. The parts are headings over stretches of the
 * one order (see `manuscript.ts`), and the notebook under it is everything
 * not placed yet. Under them, the notes left on passages: a remark made with
 * a right-click on the words, listed here so the way back to the words is one
 * press — the passage is lit for a moment and let go.
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
import { PointMenu } from "@/components/ContextMenu";
import type { MenuItem } from "@/lib/menuShape";
import type { MenuPoint } from "@/lib/contextMenu";
import type { ContentsHeading, StructureRow } from "@/lib/manuscript";
import { keyName } from "@/lib/shortcuts";

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

/** A note left on a passage — the opening remark of an open thread. */
export interface PassageNote {
  threadId: string;
  noteId: string;
  body: string;
  /** Where it is: "Chapter 2", or the page's title. */
  where: string;
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

const signed = (words: number) =>
  `${words > 0 ? "+" : words < 0 ? "−" : ""}${Math.abs(words).toLocaleString()}`;

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
  passageNotes = [],
  onOpenPassage,
  selectedId,
  canWrite,
  onOpen,
  onNewChapter,
  onNewPart,
  onRenamePart,
  onDeletePart,
  onMove,
  onTrash,
  onInfo,
  headings = [],
  onHeading,
  stats,
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
  passageNotes?: PassageNote[];
  onOpenPassage?: (note: PassageNote) => void;
  selectedId: string | null;
  canWrite: boolean;
  onOpen: (id: string) => void;
  onNewChapter: (folderId: string | null) => void;
  /** A part is made with a chapter already in it: an empty heading over
   *  nothing was a thing nobody could tell the use of. */
  onNewPart: (chapterId: string) => void;
  onRenamePart: (id: string, name: string) => void;
  onDeletePart: (id: string) => void;
  onMove: (id: string, target: StructureTarget) => void;
  onTrash: (id: string) => void;
  onInfo: (id: string, point: MenuPoint) => void;
  /** The open chapter's headings, under its row — the navigation pane of a
   *  long document, numbered as the page numbers them. */
  headings?: ContentsHeading[];
  onHeading?: (text: string) => void;
  /** Words written today (yours, from the versions). Absent when the reader
   *  switched it off. */
  stats?: { today: number | null };
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
        items.push({
          kind: "item",
          id: "part",
          label: "Group in a part",
          icon: <FolderPlus size={16} />,
          submenu: [
            ...[...parts].map(([folderId, name]) => ({
              kind: "item" as const,
              id: `part-${folderId}`,
              label: name || "Untitled part",
              checked: item.folderId === folderId,
              run: () => onMove(item.id, { kind: "part", folderId }),
            })),
            ...(parts.size > 0 ? [{ kind: "separator" as const }] : []),
            {
              kind: "item" as const,
              id: "part-new",
              label: "New part",
              icon: <Plus size={16} />,
              run: () => onNewPart(item.id),
            },
          ],
        });
        items.push({
          kind: "item",
          id: "unplace",
          label: `Move to ${notebookName}`,
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
            <span>Chapters</span>
          </div>

          {rows
            .map((row) =>
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
            )
            .flatMap((element, index) => {
              const row = rows[index];
              if (row.kind !== "chapter" || row.item.id !== selectedId || headings.length === 0)
                return [element];
              return [
                element,
                <ol key={`headings:${row.item.id}`} className="structure-headings">
                  {headings.map((heading, at) => (
                    <li key={at} data-depth={heading.depth}>
                      <button type="button" onClick={() => onHeading?.(heading.text)}>
                        <span className="structure-heading-number">{heading.number}</span>
                        <span className="structure-heading-text">{heading.text}</span>
                      </button>
                    </li>
                  ))}
                </ol>,
              ];
            })}
          {/* Always there, so nothing moves under the hand when a drag
              starts: a target that appears with the drag pushes the one the
              hand was heading for out from under it. */}
          {rows.length > 0 && <Zone id="end" className="structure-end" />}
          {canWrite && (
            <button
              type="button"
              className="structure-add press"
              title={`New chapter · ${keyName("⌘N")}`}
              onClick={() => onNewChapter(null)}
            >
              <Plus size={14} />
              New chapter
            </button>
          )}

          {passageNotes.length > 0 && (
            <section className="structure-passages" aria-label="Notes">
              <div className="structure-heading">
                <span>Notes</span>
                <small>{passageNotes.length}</small>
              </div>
              {passageNotes.map((note) => (
                <button
                  key={note.threadId}
                  type="button"
                  className="structure-passage press"
                  onClick={() => onOpenPassage?.(note)}
                >
                  <span className="structure-passage-body">{note.body}</span>
                  <span className="structure-passage-where">{note.where}</span>
                </button>
              ))}
            </section>
          )}

          {/* Pages that are not chapters. Nothing makes one any more — a note
              belongs on the words it is about — but a chapter can still be
              taken out of the order, and what was put here before stays. */}
          {(notebook.length > 0 || dragging) && (
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
          )}
        </div>

        <DragOverlay dropAnimation={null}>
          {dragged ? (
            <div className="drag-chip structure-chip">{dragged.title || "Untitled"}</div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* The count is a glance, not a heading: it sits under the work, where
          the eye arrives having finished with the structure. */}
      <div className="structure-total" aria-label={documentName}>
        <span>
          {total.toLocaleString()}
          {goal ? ` / ${goal.toLocaleString()} words` : " words"}
          {stats?.today ? ` · today ${signed(stats.today)}` : ""}
        </span>
        {goal ? (
          <span className="structure-goal" aria-hidden="true">
            <i style={{ transform: `scaleX(${progress})` }} />
          </span>
        ) : null}
      </div>
      {footer}
      {menu && <PointMenu point={menu.point} items={menu.items} close={() => setMenu(null)} />}
    </aside>
  );
}
