import { useMemo, useRef, useState } from "react";
import { ChevronDown, FolderPlus, Hash, Inbox, Notebook, Trash2, X } from "lucide-react";
import { useDroppable } from "@dnd-kit/core";
import type { AppSession } from "@/lib/session";
import { TAG_COLORS, type Meta, type Folder as FolderType, type Tag as TagType } from "@/lib/types";
import { useIsDark } from "@/lib/theme";
import type { NoteEntry } from "@/lib/entries";

export const ALL = "__all";
export const UNFILED = "__unfiled";

interface Props {
  entries: NoteEntry[];
  meta: Meta;
  session: AppSession;
  viewAs: "u1" | "u2";
  selectedFolderId: string;
  filterTagIds: string[];
  onSelectFolder: (id: string) => void;
  onFilterTagsChange: (ids: string[]) => void;
  onMetaChange: (meta: Meta) => void;
  onViewChange: (v: "u1" | "u2") => void;
}

/** One selectable row that notes can also be dropped onto. */
function FolderRow({
  id,
  droppableId,
  label,
  count,
  icon,
  selected,
  onSelect,
  onRename,
  onDelete,
}: {
  id: string;
  droppableId: string | null;
  label: string;
  count: number;
  icon: React.ReactNode;
  selected: boolean;
  onSelect: () => void;
  onRename?: (name: string) => void;
  onDelete?: () => void;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: droppableId ?? `noop:${id}`,
    disabled: !droppableId,
  });
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(label);
  const inputRef = useRef<HTMLInputElement>(null);

  function commit() {
    const trimmed = value.trim();
    if (trimmed && trimmed !== label) onRename?.(trimmed);
    else setValue(label);
    setEditing(false);
  }

  return (
    <div ref={setNodeRef} className="px-2">
      <div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect();
          }
        }}
        onDoubleClick={() => {
          if (!onRename) return;
          setEditing(true);
          setTimeout(() => inputRef.current?.select(), 0);
        }}
        className={`group flex items-center gap-2 h-7 px-2 rounded-md cursor-pointer select-none
          ${selected ? "bg-accent text-on-accent" : "text-foreground hover:bg-selected"}
          ${isOver && !selected ? "ring-1 ring-inset ring-accent bg-accent/10" : ""}
          ${isOver && selected ? "ring-1 ring-inset ring-on-accent/50" : ""}`}
      >
        <span className={`shrink-0 ${selected ? "text-on-accent" : "text-accent"}`}>{icon}</span>

        {editing ? (
          <input
            ref={inputRef}
            value={value}
            autoFocus
            onChange={(e) => setValue(e.target.value)}
            onBlur={commit}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") commit();
              if (e.key === "Escape") {
                setValue(label);
                setEditing(false);
              }
            }}
            className="flex-1 min-w-0 text-[13px] bg-transparent outline-none border-b border-current"
          />
        ) : (
          <span className="flex-1 min-w-0 truncate text-[13px]">{label}</span>
        )}

        {onDelete && !editing && (
          <button
            title={`Delete "${label}"`}
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className={`shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity cursor-pointer
              ${selected ? "text-on-accent hover:opacity-70" : "text-muted hover:text-danger"}`}
          >
            <Trash2 size={12} />
          </button>
        )}

        {!editing && (
          <span
            className={`tnum shrink-0 text-[11px] ${selected ? "text-on-accent/75" : "text-faint"}`}
          >
            {count || ""}
          </span>
        )}
      </div>
    </div>
  );
}

export function FolderRail({
  entries,
  meta,
  session,
  viewAs,
  selectedFolderId,
  filterTagIds,
  onSelectFolder,
  onFilterTagsChange,
  onMetaChange,
  onViewChange,
}: Props) {
  const isDark = useIsDark();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [tagsOpen, setTagsOpen] = useState(true);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState<TagType["color"]>("blue");

  const partnerName = meta.partnerName ?? "Lisa";

  const counts = useMemo(() => {
    const byFolder = new Map<string, number>();
    let unfiled = 0;
    for (const e of entries) {
      const fid = meta.notes.find((n) => n.id === e.note.id)?.folderId ?? null;
      if (fid && meta.folders.some((f) => f.id === fid)) {
        byFolder.set(fid, (byFolder.get(fid) ?? 0) + 1);
      } else {
        unfiled += 1;
      }
    }
    return { byFolder, unfiled, all: entries.length };
  }, [entries, meta]);

  function addFolder() {
    const name = newName.trim();
    if (!name) return;
    const folder: FolderType = { id: crypto.randomUUID(), name };
    onMetaChange({ ...meta, folders: [...meta.folders, folder] });
    setNewName("");
    setAdding(false);
    onSelectFolder(folder.id);
  }

  function renameFolder(id: string, name: string) {
    onMetaChange({ ...meta, folders: meta.folders.map((f) => (f.id === id ? { ...f, name } : f)) });
  }

  function deleteFolder(id: string) {
    onMetaChange({
      ...meta,
      folders: meta.folders.filter((f) => f.id !== id),
      notes: meta.notes.map((n) => (n.folderId === id ? { ...n, folderId: null } : n)),
    });
    if (selectedFolderId === id) onSelectFolder(ALL);
  }

  function addTag() {
    const name = newTagName.trim();
    if (!name) return;
    onMetaChange({
      ...meta,
      tags: [...meta.tags, { id: crypto.randomUUID(), name, color: newTagColor }],
    });
    setNewTagName("");
  }

  function deleteTag(id: string) {
    onMetaChange({
      ...meta,
      tags: meta.tags.filter((t) => t.id !== id),
      notes: meta.notes.map((n) => ({ ...n, tagIds: n.tagIds.filter((t) => t !== id) })),
    });
    onFilterTagsChange(filterTagIds.filter((t) => t !== id));
  }

  function toggleTag(id: string) {
    onFilterTagsChange(
      filterTagIds.includes(id) ? filterTagIds.filter((t) => t !== id) : [...filterTagIds, id],
    );
  }

  return (
    <aside className="w-[212px] shrink-0 flex flex-col bg-rail border-r border-border">
      {/* Whose notes */}
      <div className="h-11 shrink-0 flex items-center px-3 border-b border-border">
        {session.role === "u1" ? (
          <div className="relative flex-1 min-w-0">
            <select
              value={viewAs}
              onChange={(e) => onViewChange(e.target.value as "u1" | "u2")}
              aria-label="Whose notes to show"
              className="w-full appearance-none bg-transparent outline-none cursor-pointer
                         text-[13px] font-semibold text-foreground pr-5 truncate"
            >
              <option value="u1">My Notes</option>
              <option value="u2">{partnerName}&apos;s Notes</option>
            </select>
            <ChevronDown
              size={12}
              className="absolute right-0 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
            />
          </div>
        ) : (
          <span className="text-[13px] font-semibold text-foreground">My Notes</span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        <FolderRow
          id={ALL}
          droppableId={null}
          label="All Notes"
          count={counts.all}
          icon={<Notebook size={14} />}
          selected={selectedFolderId === ALL}
          onSelect={() => onSelectFolder(ALL)}
        />
        <FolderRow
          id={UNFILED}
          droppableId={UNFILED}
          label="Unfiled"
          count={counts.unfiled}
          icon={<Inbox size={14} />}
          selected={selectedFolderId === UNFILED}
          onSelect={() => onSelectFolder(UNFILED)}
        />

        {meta.folders.length > 0 && (
          <p className="px-4 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-wider text-faint">
            Folders
          </p>
        )}
        {meta.folders.map((f) => (
          <FolderRow
            key={f.id}
            id={f.id}
            droppableId={f.id}
            label={f.name}
            count={counts.byFolder.get(f.id) ?? 0}
            icon={<Notebook size={14} />}
            selected={selectedFolderId === f.id}
            onSelect={() => onSelectFolder(f.id)}
            onRename={(name) => renameFolder(f.id, name)}
            onDelete={() => deleteFolder(f.id)}
          />
        ))}

        {/* Tags */}
        <div className="mt-4">
          <button
            onClick={() => setTagsOpen((v) => !v)}
            className="flex items-center gap-1 w-full px-4 py-1 text-[10px] font-semibold uppercase
                       tracking-wider text-faint hover:text-muted transition-colors cursor-pointer"
          >
            Tags
            <ChevronDown
              size={11}
              className={`transition-transform duration-150 ${tagsOpen ? "" : "-rotate-90"}`}
            />
          </button>

          {tagsOpen && (
            <div className="px-2 pt-1">
              {meta.tags.map((tag) => {
                const palette = TAG_COLORS.find((c) => c.id === tag.color) ?? TAG_COLORS[0];
                const dot = isDark ? palette.darkFg : palette.fg;
                const on = filterTagIds.includes(tag.id);
                return (
                  <div
                    key={tag.id}
                    className={`group flex items-center gap-2 h-7 px-2 rounded-md cursor-pointer
                      ${on ? "bg-selected" : "hover:bg-selected/60"}`}
                    onClick={() => toggleTag(tag.id)}
                  >
                    <Hash size={12} style={{ color: dot }} className="shrink-0" />
                    <span
                      className={`flex-1 min-w-0 truncate text-[13px] ${on ? "text-foreground font-medium" : "text-muted"}`}
                    >
                      {tag.name}
                    </span>
                    <button
                      title={`Delete tag "${tag.name}"`}
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteTag(tag.id);
                      }}
                      className="shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100
                                 text-muted hover:text-danger transition-opacity cursor-pointer"
                    >
                      <X size={11} />
                    </button>
                  </div>
                );
              })}

              <div className="flex items-center gap-1.5 h-7 px-2">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{
                    background: isDark
                      ? (TAG_COLORS.find((c) => c.id === newTagColor) ?? TAG_COLORS[0]).darkFg
                      : (TAG_COLORS.find((c) => c.id === newTagColor) ?? TAG_COLORS[0]).fg,
                  }}
                />
                <input
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") addTag();
                    if (e.key === "Escape") setNewTagName("");
                  }}
                  placeholder="New tag"
                  className="flex-1 min-w-0 text-[13px] bg-transparent outline-none
                             text-foreground placeholder:text-faint"
                />
              </div>

              {newTagName.trim() && (
                <div className="flex items-center gap-1 px-2 pb-1 animate-slide-up">
                  {TAG_COLORS.map((c) => (
                    <button
                      key={c.id}
                      title={c.id}
                      onClick={() => setNewTagColor(c.id)}
                      className="w-3.5 h-3.5 rounded-full cursor-pointer border-2 transition-transform hover:scale-110"
                      style={{
                        background: isDark ? c.darkFg : c.fg,
                        borderColor: newTagColor === c.id ? "var(--foreground)" : "transparent",
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* New folder */}
      <div className="shrink-0 border-t border-border p-2">
        {adding ? (
          <div className="flex items-center gap-2 h-7 px-2">
            <Notebook size={14} className="text-accent shrink-0" />
            <input
              value={newName}
              autoFocus
              onChange={(e) => setNewName(e.target.value)}
              onBlur={() => {
                if (newName.trim()) addFolder();
                else setAdding(false);
              }}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") addFolder();
                if (e.key === "Escape") {
                  setNewName("");
                  setAdding(false);
                }
              }}
              placeholder="Folder name"
              className="flex-1 min-w-0 text-[13px] bg-transparent outline-none
                         text-foreground placeholder:text-faint"
            />
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-2 w-full h-7 px-2 rounded-md text-[13px]
                       text-muted hover:text-foreground hover:bg-selected transition-colors cursor-pointer"
          >
            <FolderPlus size={14} />
            New Folder
          </button>
        )}
      </div>
    </aside>
  );
}
