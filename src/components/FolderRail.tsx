import { useMemo, useRef, useState } from "react";
import { ChevronRight, Folder, Inbox, Layers3, Plus, Tag, Trash2, X } from "lucide-react";
import { useDroppable } from "@dnd-kit/core";
import { TAG_COLORS, type Meta, type Folder as FolderType, type Tag as TagType } from "@/lib/types";
import { useIsDark } from "@/lib/theme";
import type { NoteEntry } from "@/lib/entries";

export const ALL = "__all";
export const UNFILED = "__unfiled";

interface Props {
  mobile?: boolean;
  entries: NoteEntry[];
  meta: Meta;
  selectedFolderId: string;
  filterTagIds: string[];
  onSelectFolder: (id: string) => void;
  onFilterTagsChange: (ids: string[]) => void;
  onMetaChange: (meta: Meta) => void;
}

/* Quiet navigation for folders and tags. Rounded selection surfaces make the
   hierarchy scannable without competing with the editor. */

function FolderRow({
  id,
  droppableId,
  label,
  count,
  selected,
  onSelect,
  onRename,
  onDelete,
  mobile = false,
  icon = "folder",
}: {
  id: string;
  droppableId: string | null;
  label: string;
  count: number;
  selected: boolean;
  onSelect: () => void;
  onRename?: (name: string) => void;
  onDelete?: () => void;
  mobile?: boolean;
  icon?: "all" | "inbox" | "folder";
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
    <div
      ref={setNodeRef}
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
      className={`group flex cursor-pointer items-center gap-3 transition-colors select-none ${
        mobile ? "mobile-folder-row min-h-14 px-4" : "mx-2 h-9 rounded-lg px-3"
      } ${
        selected ? "bg-accent-wash" : mobile ? "hover:bg-page" : "hover:bg-paper"
      } ${isOver ? "ring-1 ring-accent ring-inset" : ""}`}
    >
      {mobile && (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-wash text-accent">
          {icon === "all" ? (
            <Layers3 size={18} strokeWidth={1.9} />
          ) : icon === "inbox" ? (
            <Inbox size={18} strokeWidth={1.9} />
          ) : (
            <Folder size={18} strokeWidth={1.9} />
          )}
        </span>
      )}
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
          className="min-w-0 flex-1 rounded-md border border-accent bg-page px-2 py-1 text-[13px] outline-none"
        />
      ) : (
        <span
          className={`min-w-0 flex-1 truncate ${mobile ? "text-[16px]" : "text-[13px]"} ${selected ? "text-accent" : "text-ink-2"}`}
          style={{ fontVariationSettings: selected ? '"wght" 550' : '"wght" 450' }}
        >
          {label}
        </span>
      )}

      {onDelete && !editing && (
        <button
          title={`Delete “${label}”`}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="icon-button shrink-0 p-1 text-ink-4 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100 hover:text-danger"
        >
          <Trash2 size={12} strokeWidth={1.75} />
        </button>
      )}

      {!editing && (
        <span className={`readout shrink-0 ${selected ? "text-accent" : "text-ink-4"}`}>
          {count || "—"}
        </span>
      )}
      {mobile && <ChevronRight size={16} strokeWidth={2} className="shrink-0 text-ink-4" />}
    </div>
  );
}

export function FolderRail({
  mobile = false,
  entries,
  meta,
  selectedFolderId,
  filterTagIds,
  onSelectFolder,
  onFilterTagsChange,
  onMetaChange,
}: Props) {
  const isDark = useIsDark();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState<TagType["color"]>("blue");

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

  if (mobile) {
    return (
      <aside className="mobile-folder-rail flex h-full w-full flex-col overflow-y-auto bg-surface">
        <div className="px-5 pt-4 pb-3">
          <h1 className="font-display text-[2.15rem] leading-none tracking-[-0.04em] text-ink">
            Folders
          </h1>
        </div>

        <div className="mobile-card mx-4 overflow-hidden bg-paper">
          <FolderRow
            mobile
            icon="all"
            id={ALL}
            droppableId={null}
            label="All notes"
            count={counts.all}
            selected={selectedFolderId === ALL}
            onSelect={() => onSelectFolder(ALL)}
          />
          <FolderRow
            mobile
            icon="inbox"
            id={UNFILED}
            droppableId={UNFILED}
            label="Unfiled"
            count={counts.unfiled}
            selected={selectedFolderId === UNFILED}
            onSelect={() => onSelectFolder(UNFILED)}
          />
          {meta.folders.map((folder) => (
            <FolderRow
              mobile
              key={folder.id}
              id={folder.id}
              droppableId={folder.id}
              label={folder.name}
              count={counts.byFolder.get(folder.id) ?? 0}
              selected={selectedFolderId === folder.id}
              onSelect={() => onSelectFolder(folder.id)}
              onRename={(name) => renameFolder(folder.id, name)}
              onDelete={() => deleteFolder(folder.id)}
            />
          ))}

          {adding ? (
            <div className="flex min-h-14 items-center gap-3 px-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-wash text-accent">
                <Plus size={18} strokeWidth={2} />
              </span>
              <input
                value={newName}
                autoFocus
                onChange={(event) => setNewName(event.target.value)}
                onBlur={() => (newName.trim() ? addFolder() : setAdding(false))}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key === "Enter") addFolder();
                  if (event.key === "Escape") {
                    setNewName("");
                    setAdding(false);
                  }
                }}
                placeholder="Folder name"
                className="min-w-0 flex-1 rounded-lg border border-accent bg-page px-3 py-2 text-[16px] outline-none placeholder:text-ink-4"
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="mobile-folder-row flex min-h-14 w-full items-center gap-3 px-4 text-left text-accent"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-wash">
                <Plus size={18} strokeWidth={2} />
              </span>
              <span className="text-[16px] font-medium">New folder</span>
            </button>
          )}
        </div>

        <div className="px-5 pt-7 pb-2">
          <h2 className="font-display text-[1.35rem] font-semibold tracking-[-0.025em] text-ink">
            Tags
          </h2>
        </div>

        <div className="mobile-card mx-4 mb-8 overflow-hidden bg-paper">
          {meta.tags.map((tag) => {
            const palette = TAG_COLORS.find((color) => color.id === tag.color) ?? TAG_COLORS[0];
            const swatch = isDark ? palette.darkFg : palette.fg;
            const active = filterTagIds.includes(tag.id);
            return (
              <div
                key={tag.id}
                role="button"
                tabIndex={0}
                aria-pressed={active}
                onClick={() => toggleTag(tag.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    toggleTag(tag.id);
                  }
                }}
                className={`mobile-folder-row flex min-h-14 items-center gap-3 px-4 ${active ? "bg-accent-wash" : ""}`}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-page">
                  <Tag size={17} strokeWidth={1.9} style={{ color: swatch }} />
                </span>
                <span
                  className={`min-w-0 flex-1 truncate text-[16px] ${active ? "text-accent" : "text-ink-2"}`}
                >
                  {tag.name}
                </span>
                <button
                  title={`Delete tag “${tag.name}”`}
                  onClick={(event) => {
                    event.stopPropagation();
                    deleteTag(tag.id);
                  }}
                  className="icon-button h-8 w-8 shrink-0 text-ink-4 hover:text-danger"
                >
                  <X size={13} strokeWidth={2.2} />
                </button>
              </div>
            );
          })}

          <div className="mobile-folder-row flex min-h-14 items-center gap-3 px-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-wash text-accent">
              <Tag size={17} strokeWidth={1.9} />
            </span>
            <input
              value={newTagName}
              onChange={(event) => setNewTagName(event.target.value)}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Enter") addTag();
                if (event.key === "Escape") setNewTagName("");
              }}
              placeholder="New tag"
              className="min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-ink-4"
            />
          </div>

          {newTagName.trim() && (
            <div className="flex items-center gap-3 border-t border-rule-soft px-5 py-4">
              {TAG_COLORS.map((color) => (
                <button
                  key={color.id}
                  title={color.id}
                  aria-label={`Colour ${color.id}`}
                  aria-pressed={newTagColor === color.id}
                  onClick={() => setNewTagColor(color.id)}
                  className="h-5 w-5 rounded-full"
                  style={{
                    background: isDark ? color.darkFg : color.fg,
                    outline: newTagColor === color.id ? "2px solid var(--ink)" : "none",
                    outlineOffset: "2px",
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </aside>
    );
  }

  return (
    <aside
      className={`flex shrink-0 flex-col bg-paper ${
        mobile ? "mobile-folder-rail h-full w-full border-0" : "soft-pane w-[224px]"
      }`}
    >
      <div className="flex-1 overflow-y-auto">
        <p className="label px-5 pt-5 pb-2 text-ink-4">Folders</p>

        <FolderRow
          id={ALL}
          droppableId={null}
          label="All notes"
          count={counts.all}
          selected={selectedFolderId === ALL}
          onSelect={() => onSelectFolder(ALL)}
        />
        <FolderRow
          id={UNFILED}
          droppableId={UNFILED}
          label="Unfiled"
          count={counts.unfiled}
          selected={selectedFolderId === UNFILED}
          onSelect={() => onSelectFolder(UNFILED)}
        />
        {meta.folders.map((f) => (
          <FolderRow
            key={f.id}
            id={f.id}
            droppableId={f.id}
            label={f.name}
            count={counts.byFolder.get(f.id) ?? 0}
            selected={selectedFolderId === f.id}
            onSelect={() => onSelectFolder(f.id)}
            onRename={(name) => renameFolder(f.id, name)}
            onDelete={() => deleteFolder(f.id)}
          />
        ))}

        {adding ? (
          <div className="mx-2 flex h-9 items-center gap-2 px-3">
            <input
              value={newName}
              autoFocus
              onChange={(e) => setNewName(e.target.value)}
              onBlur={() => (newName.trim() ? addFolder() : setAdding(false))}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") addFolder();
                if (e.key === "Escape") {
                  setNewName("");
                  setAdding(false);
                }
              }}
              placeholder="Folder name"
              className="min-w-0 flex-1 rounded-lg border border-accent bg-page px-2 py-1 text-[13px] outline-none placeholder:text-ink-4"
            />
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="label mx-2 flex h-9 w-[calc(100%_-_1rem)] items-center gap-1.5 rounded-lg px-3 text-ink-4 transition-colors hover:bg-page hover:text-accent"
          >
            <Plus size={11} strokeWidth={2.5} />
            New folder
          </button>
        )}

        <p className="label px-5 pt-6 pb-2 text-ink-4">Tags</p>

        {meta.tags.map((tag) => {
          const palette = TAG_COLORS.find((c) => c.id === tag.color) ?? TAG_COLORS[0];
          const swatch = isDark ? palette.darkFg : palette.fg;
          const on = filterTagIds.includes(tag.id);
          return (
            <div
              key={tag.id}
              role="button"
              tabIndex={0}
              aria-pressed={on}
              onClick={() => toggleTag(tag.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggleTag(tag.id);
                }
              }}
              className={`group mx-2 flex h-9 cursor-pointer items-center gap-2 rounded-lg px-3 transition-colors ${
                on ? "bg-accent-wash" : "hover:bg-page"
              }`}
            >
              <span
                aria-hidden
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: swatch }}
              />
              <span
                className={`min-w-0 flex-1 truncate text-[13px] ${on ? "text-accent" : "text-ink-2"}`}
              >
                {tag.name}
              </span>
              <button
                title={`Delete tag “${tag.name}”`}
                onClick={(e) => {
                  e.stopPropagation();
                  deleteTag(tag.id);
                }}
                className="icon-button shrink-0 p-1 text-ink-4 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100 hover:text-danger"
              >
                <X size={11} strokeWidth={2.5} />
              </button>
            </div>
          );
        })}

        <div className="mx-2 flex h-9 items-center gap-2 rounded-lg px-3 hover:bg-page">
          <span
            aria-hidden
            className="h-2.5 w-2.5 shrink-0 rounded-full"
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
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-ink-4"
          />
        </div>

        {newTagName.trim() && (
          <div className="flex items-center gap-2 px-5 pt-2 pb-3">
            {TAG_COLORS.map((c) => (
              <button
                key={c.id}
                title={c.id}
                aria-label={`Colour ${c.id}`}
                aria-pressed={newTagColor === c.id}
                onClick={() => setNewTagColor(c.id)}
                className="h-4 w-4 rounded-full transition-transform hover:scale-110"
                style={{
                  background: isDark ? c.darkFg : c.fg,
                  outline: newTagColor === c.id ? "1px solid var(--ink)" : "none",
                  outlineOffset: "2px",
                }}
              />
            ))}
          </div>
        )}

        <div className="h-6" />
      </div>
    </aside>
  );
}
