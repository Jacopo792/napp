import { useEffect, useMemo, useRef, useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { Pin, Search, SquarePen, Trash2, X } from "lucide-react";
import { TAG_COLORS, type Meta, type Tag as TagType } from "@/lib/types";
import { useIsDark } from "@/lib/theme";
import { countWords, formatCount, formatStamp, previewOf } from "@/lib/format";
import type { NoteEntry } from "@/lib/entries";

interface Props {
  mobile?: boolean;
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
  onTogglePin: (noteId: string) => void;
}

/* The catalogue. Titles here are never truncated to one line: the real corpus
   names notes things like "MAPPA 5: SK GROUP (il chaebol che ha catturato i
   pezzi giusti)", and a list that cuts that at 30 characters throws away the
   naming scheme its owner built. Three lines, then it stops. */

function Row({
  mobile,
  entry,
  index,
  meta,
  selected,
  onSelect,
  onDelete,
  onTogglePin,
}: {
  mobile: boolean;
  entry: NoteEntry;
  index: number;
  meta: Meta;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
}) {
  const isDark = useIsDark();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: entry.note.id,
    disabled: mobile,
  });
  const rowRef = useRef<HTMLDivElement>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const tags = useMemo(() => {
    const ids = meta.notes.find((n) => n.id === entry.note.id)?.tagIds ?? [];
    return ids.map((id) => meta.tags.find((t) => t.id === id)).filter(Boolean) as TagType[];
  }, [meta, entry.note.id]);

  useEffect(() => {
    if (selected) rowRef.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  useEffect(() => {
    if (!confirmDelete) return;
    const timer = window.setTimeout(() => setConfirmDelete(false), 3000);
    return () => window.clearTimeout(timer);
  }, [confirmDelete]);

  const preview = previewOf(entry.note.body);
  const words = countWords(entry.note.body);
  const pinned = meta.notes.find((note) => note.id === entry.note.id)?.pinned === true;

  return (
    <div
      ref={(el) => {
        setNodeRef(el);
        rowRef.current = el;
      }}
      {...(!mobile ? listeners : {})}
      {...(!mobile ? attributes : {})}
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      style={{ opacity: isDragging ? 0.4 : 1 }}
      className={`group relative mx-2 mb-1 flex cursor-pointer gap-3 rounded-xl border px-3 py-3 transition-colors ${
        mobile ? "touch-pan-y" : "touch-none"
      } ${
        selected
          ? "border-rule bg-page shadow-sm"
          : "border-transparent hover:border-rule-soft hover:bg-page"
      }`}
    >
      {/* The running number is the keyboard target and the position in the
          current sort — information, not ornament. */}
      <span
        aria-hidden
        className={`readout flex h-5 w-5 shrink-0 items-center justify-center rounded-md ${
          selected ? "bg-accent text-on-accent" : "bg-surface text-ink-4"
        }`}
      >
        {index + 1}
      </span>

      <div className="min-w-0 flex-1">
        <p
          className={`text-[13.5px] leading-[1.35] ${
            entry.note.title ? "text-ink" : "text-ink-4 italic"
          }`}
          style={{
            fontVariationSettings: '"wght" 500, "opsz" 16',
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {entry.note.title || "Untitled"}
        </p>

        <p className="readout mt-1.5 truncate text-ink-3">
          {formatStamp(entry.note.updatedAt)}
          <span className="text-ink-4"> · </span>
          {formatCount(words)}w
          {preview && (
            <>
              <span className="text-ink-4"> · </span>
              <span className="text-ink-4">{preview}</span>
            </>
          )}
        </p>

        {tags.length > 0 && (
          <span className="mt-1.5 flex items-center gap-1">
            {tags.slice(0, 5).map((t) => {
              const p = TAG_COLORS.find((c) => c.id === t.color) ?? TAG_COLORS[0];
              return (
                <span
                  key={t.id}
                  title={t.name}
                  aria-label={t.name}
                  className="h-1.5 w-4 rounded-full"
                  style={{ background: isDark ? p.darkFg : p.fg }}
                />
              );
            })}
          </span>
        )}
      </div>

      <button
        aria-label={
          pinned
            ? `Unpin ${entry.note.title || "Untitled"}`
            : `Pin ${entry.note.title || "Untitled"}`
        }
        title={pinned ? "Unpin note" : "Pin note to top"}
        aria-pressed={pinned}
        onClick={(event) => {
          event.stopPropagation();
          onTogglePin();
        }}
        onPointerDown={(event) => event.stopPropagation()}
        className={`icon-button h-7 w-7 shrink-0 transition-all ${
          pinned
            ? "text-accent opacity-100"
            : "text-ink-4 opacity-100 md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100 hover:text-accent"
        }`}
      >
        <Pin size={13} strokeWidth={pinned ? 2.4 : 1.75} fill={pinned ? "currentColor" : "none"} />
      </button>

      <button
        aria-label={
          confirmDelete
            ? `Confirm deletion of ${entry.note.title || "Untitled"}`
            : `Delete ${entry.note.title || "Untitled"}`
        }
        title={
          confirmDelete
            ? "Click again to permanently delete"
            : `Delete "${entry.note.title || "Untitled"}"`
        }
        onClick={(e) => {
          e.stopPropagation();
          if (confirmDelete) onDelete();
          else setConfirmDelete(true);
        }}
        onPointerDown={(e) => e.stopPropagation()}
        className={`icon-button h-7 shrink-0 px-1.5 transition-all ${
          confirmDelete
            ? "bg-danger text-white opacity-100"
            : "text-ink-4 opacity-100 md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100 hover:text-danger"
        }`}
      >
        {confirmDelete ? (
          <span className="label text-[10px]">Delete?</span>
        ) : (
          <Trash2 size={13} strokeWidth={1.75} />
        )}
      </button>
    </div>
  );
}

function Skeletons() {
  return (
    <div aria-hidden>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="mx-2 mb-1 flex gap-3 rounded-xl border border-rule-soft px-3 py-3">
          <div className="skeleton mt-0.5 h-2.5 w-4 shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-3" style={{ width: `${78 - (i % 3) * 16}%` }} />
            <div className="skeleton h-2" style={{ width: `${58 - (i % 4) * 9}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function NoteList({
  mobile = false,
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
  onTogglePin,
}: Props) {
  const hasQuery = query.trim().length > 0;

  return (
    <section
      className={`flex shrink-0 flex-col bg-paper ${
        mobile ? "mobile-note-list h-full w-full border-0" : "soft-pane w-[360px]"
      }`}
    >
      <div className="soft-control mx-3 mt-3 flex h-10 shrink-0 items-center gap-2 px-3 shadow-sm">
        <Search size={13} strokeWidth={2} className="shrink-0 text-ink-4" />
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
          className="readout min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-4"
        />
        {hasQuery && (
          <button
            title="Clear search"
            onClick={() => onQueryChange("")}
            className="icon-button shrink-0 p-1 text-ink-4 transition-colors hover:text-ink"
          >
            <X size={12} strokeWidth={2.5} />
          </button>
        )}
        <button
          onClick={onNew}
          disabled={busy || loading}
          title="New note · N"
          className="label icon-button -mr-1 flex shrink-0 items-center gap-1.5 bg-accent px-2.5 py-2 text-on-accent transition-opacity hover:bg-accent-strong hover:text-on-accent disabled:opacity-30"
        >
          <SquarePen size={14} strokeWidth={1.75} />
          New note
        </button>
      </div>

      <div className="field-row shrink-0 px-4 pt-3 pb-2">
        <span className="label truncate text-ink-3">{hasQuery ? "Results" : folderLabel}</span>
        <span className="readout shrink-0 text-ink-4">{loading ? "—" : entries.length}</span>
      </div>

      <div
        role="listbox"
        aria-label={`Notes in ${folderLabel}`}
        className="flex-1 overflow-y-auto pb-2"
      >
        {loading ? (
          <Skeletons />
        ) : entries.length === 0 ? (
          <div className="mx-3 mt-2 rounded-xl border border-dashed border-rule px-6 py-12 text-center">
            <p className="readout text-ink-2">
              {hasQuery ? `Nothing matches “${query.trim()}”` : `${folderLabel} is empty`}
            </p>
            <button
              onClick={() => (hasQuery ? onQueryChange("") : onNew())}
              className="label mt-3 text-accent transition-opacity hover:opacity-70"
            >
              {hasQuery ? "Clear search" : "Write the first note"}
            </button>
          </div>
        ) : (
          entries.map((e, i) => (
            <Row
              mobile={mobile}
              key={e.note.id}
              entry={e}
              index={i}
              meta={meta}
              selected={selectedId === e.note.id}
              onSelect={() => onSelect(e.note.id)}
              onDelete={() => onDelete(e)}
              onTogglePin={() => onTogglePin(e.note.id)}
            />
          ))
        )}
      </div>
    </section>
  );
}
