import { useEffect, useMemo, useRef } from "react";
import { SlidersHorizontal } from "lucide-react";
import { TAG_COLORS, type Meta } from "@/lib/types";
import type { NoteEntry } from "@/lib/entries";
import { ALL, TRASH, UNFILED } from "./FolderRail";

interface Props {
  entries: NoteEntry[];
  meta: Meta;
  selectedFolderId: string;
  filterTagIds: string[];
  onSelectFolder: (id: string) => void;
  onFilterTagsChange: (ids: string[]) => void;
  onManage: () => void;
}

/* On a phone the folder tree is not a destination — it is the scope of the list
   you are already looking at. One scrolling strip replaces the drill-down
   screen, so a note is one tap away instead of three. Folders are single
   choice and read as a segmented control; tags are additive filters and carry
   their own colour, which is what keeps the two legible in one row. */
export function MobileScopes({
  entries,
  meta,
  selectedFolderId,
  filterTagIds,
  onSelectFolder,
  onFilterTagsChange,
  onManage,
}: Props) {
  const strip = useRef<HTMLDivElement>(null);

  const counts = useMemo(() => {
    const byFolder = new Map<string, number>();
    let unfiled = 0;
    let trash = 0;
    for (const entry of entries) {
      const noteMeta = meta.notes.find((n) => n.id === entry.note.id);
      if (noteMeta?.trashedAt) {
        trash += 1;
        continue;
      }
      const folderId = noteMeta?.folderId ?? null;
      if (folderId && meta.folders.some((f) => f.id === folderId)) {
        byFolder.set(folderId, (byFolder.get(folderId) ?? 0) + 1);
      } else {
        unfiled += 1;
      }
    }
    return { byFolder, unfiled, all: entries.length - trash, trash };
  }, [entries, meta]);

  const folders = [
    { id: ALL, name: "All notes", count: counts.all },
    { id: UNFILED, name: "Unfiled", count: counts.unfiled },
    ...meta.folders.map((folder) => ({
      id: folder.id,
      name: folder.name,
      count: counts.byFolder.get(folder.id) ?? 0,
    })),
    { id: TRASH, name: "Trash", count: counts.trash },
  ];

  // A scope chosen from the sheet can be off-screen in the strip; bring it back
  // so the row always shows what the list below is actually scoped to.
  useEffect(() => {
    strip.current?.querySelector('[data-active="true"]')?.scrollIntoView({
      block: "nearest",
      inline: "center",
      behavior: "smooth",
    });
  }, [selectedFolderId]);

  return (
    <div className="relative shrink-0">
      <div ref={strip} className="scope-strip flex items-center gap-1.5 overflow-x-auto px-4 py-2">
        {folders.map((folder) => {
          const active = selectedFolderId === folder.id;
          return (
            <button
              key={folder.id}
              type="button"
              data-active={active}
              aria-pressed={active}
              onClick={() => onSelectFolder(folder.id)}
              className={`scope-chip ${active ? "is-active" : ""}`}
            >
              {folder.name}
              <span className="scope-count">{folder.count || "—"}</span>
            </button>
          );
        })}

        {meta.tags.length > 0 && <span aria-hidden className="scope-divider" />}

        {meta.tags.map((tag) => {
          const palette = TAG_COLORS.find((color) => color.id === tag.color) ?? TAG_COLORS[0];
          const active = filterTagIds.includes(tag.id);
          return (
            <button
              key={tag.id}
              type="button"
              aria-pressed={active}
              onClick={() =>
                onFilterTagsChange(
                  active ? filterTagIds.filter((id) => id !== tag.id) : [...filterTagIds, tag.id],
                )
              }
              className={`scope-chip ${active ? "is-tag-active" : ""}`}
            >
              <span
                aria-hidden
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: palette.darkFg }}
              />
              {tag.name}
            </button>
          );
        })}

        <span aria-hidden className="w-9 shrink-0" />
      </div>

      {/* Anchored past the strip's fade so folder and tag editing stays one tap
          away without occupying the primary row. */}
      <button
        type="button"
        onClick={onManage}
        aria-label="Edit folders and tags"
        className="scope-manage"
      >
        <SlidersHorizontal size={15} strokeWidth={2} />
      </button>
    </div>
  );
}
