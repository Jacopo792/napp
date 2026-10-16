/* The menu a chapter or a part opens on a right-click — written once, read by
 * the structure's rows and by the corkboard's cards, so the two never offer
 * different acts on the same chapter. */
import {
  ArrowDownUp,
  FolderPlus,
  Info,
  NotebookText,
  Pencil,
  Plus,
  Trash2,
} from "@/components/icons";
import type { MenuItem } from "@/lib/menuShape";
import type { MenuPoint } from "@/lib/contextMenu";
import { CHAPTER_STATUSES, type StructureTarget } from "@/lib/manuscript";
import type { ChapterInfo } from "@/lib/types";
import type { ChapterItem } from "./StructurePane";

/** What a chapter's or a part's menu can do — the same acts from the
 *  structure's rows and the corkboard's cards. */
export interface StructureActions {
  chapters: ChapterItem[];
  parts: Map<string, string>;
  canWrite: boolean;
  onOpen: (id: string) => void;
  onInfo: (id: string, point: MenuPoint) => void;
  onMove: (id: string, target: StructureTarget) => void;
  onNewPart: (chapterId: string) => void;
  onNewChapter: (folderId: string | null) => void;
  onDeletePart: (id: string) => void;
  onTrash: (id: string) => void;
  onChapter?: (id: string, chapter: ChapterInfo | undefined) => void;
  /** Open the synopsis or goal field for a chapter. */
  write: (id: string, field: "synopsis" | "goal") => void;
  /** Rename a part in place. */
  rename: (folderId: string) => void;
}

export function chapterMenuItems(
  {
    chapters,
    parts,
    canWrite,
    onOpen,
    onInfo,
    onMove,
    onNewPart,
    onChapter,
    onTrash,
    write,
  }: StructureActions,
  item: ChapterItem,
  point: MenuPoint,
  placed: boolean,
): MenuItem[] {
  const at = chapters.findIndex((one) => one.id === item.id);
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
      if (onChapter) {
        const info = item.chapter;
        items.push(
          {
            kind: "item",
            id: "status",
            label: "Status",
            submenu: [
              ...CHAPTER_STATUSES.map((status) => ({
                kind: "item" as const,
                id: `status-${status.id}`,
                label: status.label,
                checked: info?.status === status.id,
                run: () => onChapter(item.id, { ...info, status: status.id }),
              })),
              ...(info?.status
                ? [
                    { kind: "separator" as const },
                    {
                      kind: "item" as const,
                      id: "status-none",
                      label: "No status",
                      run: () => {
                        const { status: _gone, ...rest } = info;
                        onChapter(item.id, Object.keys(rest).length > 0 ? rest : undefined);
                      },
                    },
                  ]
                : []),
            ],
          },
          {
            kind: "item",
            id: "synopsis",
            label: info?.synopsis ? "Edit synopsis" : "Write a synopsis",
            run: () => write(item.id, "synopsis"),
          },
          {
            kind: "item",
            id: "goal",
            label: info?.goal ? "Change word goal" : "Set a word goal",
            run: () => write(item.id, "goal"),
          },
          { kind: "separator" },
        );
      }
      items.push({
        kind: "item",
        id: "unplace",
        label: "Take out of the book",
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
  return items;
}

export function partMenuItems(
  { canWrite, onNewChapter, onDeletePart, rename }: StructureActions,
  folderId: string,
): MenuItem[] {
  if (!canWrite) return [];
  return [
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
      run: () => rename(folderId),
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
  ];
}
