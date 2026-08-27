import { useEffect, useMemo, useRef } from "react";
import { useDraggable } from "@dnd-kit/core";
import { Search, SquarePen, Trash2, X } from "lucide-react";
import { TAG_COLORS, type Meta, type Tag as TagType } from "@/lib/types";
import { useIsDark } from "@/lib/theme";
import type { NoteEntry } from "@/lib/entries";

interface Props {
  entries: NoteEntry[];
  meta: Meta;
  selectedId: string | null;
  query: string;
  loading: boolean;
  busy: boolean;
  folderLabel: string;
  searchRef: React.RefObject<HTMLInputElement | null>;
  onQueryChange: (q: string) => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (entry: NoteEntry) => void;
}

/** Markdown syntax stripped down to something readable in a 1-line preview. */
function previewOf(body: string): string {
  return body
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/[*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Apple-Notes-style relative date: time today, weekday this week, else date. */
function formatStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.floor((startOfToday.getTime() - d.getTime()) / 86_400_000);

  if (d >= startOfToday) {
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }
  if (diffDays < 1) return "Yesterday";
  if (diffDays < 6) return d.toLocaleDateString(undefined, { weekday: "long" });
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  }
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function Row({
  entry,
  meta,
  selected,
  onSelect,
  onDelete,
}: {
  entry: NoteEntry;
  meta: Meta;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const isDark = useIsDark();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: entry.note.id });
  const rowRef = useRef<HTMLDivElement>(null);

  const tags = useMemo(() => {
    const ids = meta.notes.find((n) => n.id === entry.note.id)?.tagIds ?? [];
    return ids.map((id) => meta.tags.find((t) => t.id === id)).filter(Boolean) as TagType[];
  }, [meta, entry.note.id]);

  // Keyboard selection can land on a row that is scrolled out of view.
  useEffect(() => {
    if (selected) rowRef.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const preview = previewOf(entry.note.body);

  return (
    <div
      ref={(el) => {
        setNodeRef(el);
        rowRef.current = el;
      }}
      {...listeners}
      {...attributes}
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      style={{ opacity: isDragging ? 0.4 : 1 }}
      className={`group relative flex flex-col gap-0.5 px-3 py-2 cursor-pointer touch-none
        border-l-2 transition-colors duration-150
        ${selected ? "bg-selected border-l-accent" : "border-l-transparent hover:bg-selected/50"}`}
    >
      <div className="flex items-center gap-2">
        <p
          className={`flex-1 min-w-0 truncate text-[13px] leading-5 ${
            entry.note.title ? "font-medium text-foreground" : "font-medium text-faint italic"
          }`}
        >
          {entry.note.title || "New Note"}
        </p>
        <button
          title="Delete note"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className="shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100
                     text-muted hover:text-danger transition-opacity cursor-pointer"
        >
          <Trash2 size={12} />
        </button>
      </div>

      <div className="flex items-center gap-1.5 min-w-0">
        <span className="tnum shrink-0 text-[11px] leading-4 text-muted">
          {formatStamp(entry.note.updatedAt)}
        </span>
        <span className="flex-1 min-w-0 truncate text-[11px] leading-4 text-faint">
          {preview || "No additional text"}
        </span>
        {tags.length > 0 && (
          <span className="flex shrink-0 items-center gap-1">
            {tags.slice(0, 3).map((t) => {
              const p = TAG_COLORS.find((c) => c.id === t.color) ?? TAG_COLORS[0];
              return (
                <span
                  key={t.id}
                  title={t.name}
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: isDark ? p.darkFg : p.fg }}
                />
              );
            })}
          </span>
        )}
      </div>
    </div>
  );
}

function Skeletons() {
  return (
    <div aria-hidden className="pt-1">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex flex-col gap-1.5 px-3 py-2.5 border-l-2 border-l-transparent">
          <div className="skeleton h-3" style={{ width: `${72 - (i % 3) * 14}%` }} />
          <div className="skeleton h-2.5" style={{ width: `${90 - (i % 4) * 12}%` }} />
        </div>
      ))}
    </div>
  );
}

export function NoteList({
  entries,
  meta,
  selectedId,
  query,
  loading,
  busy,
  folderLabel,
  searchRef,
  onQueryChange,
  onSelect,
  onNew,
  onDelete,
}: Props) {
  const hasQuery = query.trim().length > 0;

  return (
    <section className="w-[288px] shrink-0 flex flex-col bg-surface border-r border-border">
      {/* Search + new */}
      <div className="h-11 shrink-0 flex items-center gap-2 px-3 border-b border-border">
        <div className="relative flex-1 min-w-0">
          <Search
            size={12}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-faint pointer-events-none"
          />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                onQueryChange("");
                e.currentTarget.blur();
              }
            }}
            placeholder="Search"
            aria-label="Search notes"
            className="w-full h-7 pl-7 pr-6 rounded-md bg-background border border-border
                       text-[12px] text-foreground placeholder:text-faint
                       outline-none focus:border-accent transition-colors"
          />
          {hasQuery && (
            <button
              title="Clear search"
              onClick={() => onQueryChange("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted hover:text-foreground cursor-pointer"
            >
              <X size={11} />
            </button>
          )}
        </div>
        <button
          onClick={onNew}
          disabled={busy || loading}
          title="New note (N)"
          className="shrink-0 text-accent hover:opacity-70 disabled:opacity-30
                     transition-opacity cursor-pointer disabled:cursor-default"
        >
          <SquarePen size={15} />
        </button>
      </div>

      <div role="listbox" aria-label={`Notes in ${folderLabel}`} className="flex-1 overflow-y-auto">
        {loading ? (
          <Skeletons />
        ) : entries.length === 0 ? (
          <div className="px-6 py-10 text-center">
            {hasQuery ? (
              <>
                <p className="text-[13px] text-muted">No matches for “{query.trim()}”</p>
                <button
                  onClick={() => onQueryChange("")}
                  className="mt-2 text-[12px] text-accent hover:opacity-70 cursor-pointer"
                >
                  Clear search
                </button>
              </>
            ) : (
              <>
                <p className="text-[13px] text-muted">{folderLabel} is empty</p>
                <button
                  onClick={onNew}
                  className="mt-2 text-[12px] text-accent hover:opacity-70 cursor-pointer"
                >
                  Write the first note
                </button>
              </>
            )}
          </div>
        ) : (
          entries.map((e) => (
            <Row
              key={e.note.id}
              entry={e}
              meta={meta}
              selected={selectedId === e.note.id}
              onSelect={() => onSelect(e.note.id)}
              onDelete={() => onDelete(e)}
            />
          ))
        )}
      </div>

      <div className="h-7 shrink-0 flex items-center justify-center border-t border-border">
        <span className="tnum text-[11px] text-faint">
          {loading ? "" : `${entries.length} ${entries.length === 1 ? "note" : "notes"}`}
        </span>
      </div>
    </section>
  );
}
