import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useDraggable } from "@dnd-kit/core";
import {
  FileText,
  Image as ImageIcon,
  ListChecks,
  Paperclip,
  Pin,
  RotateCcw,
  Search,
  SquarePen,
  Table2,
  Trash2,
  X,
} from "lucide-react";
import type { Meta } from "@/lib/types";
import { formatStamp } from "@/lib/format";
import { derivedOf, indexOf } from "@/lib/derived";
import type { NoteEntry } from "@/lib/entries";
import type { ListView, NoteGroup } from "@/lib/listPreferences";

export interface ActiveFilter {
  id: string;
  label: string;
  onClear: () => void;
}

interface Props {
  mobile?: boolean;
  entries: NoteEntry[];
  groups?: NoteGroup[];
  view?: ListView;
  toolbarActions?: ReactNode;
  /** Row above the collection header — the archive switch, the pane toggle. */
  topBar?: ReactNode;
  /** Row below the list — where Settings and the lock stand. */
  footer?: ReactNode;
  /** Scope and tag narrowing currently in force, each one dismissible. */
  filters?: ActiveFilter[];
  meta: Meta;
  selectedId: string | null;
  query: string;
  loading: boolean;
  busy: boolean;
  folderLabel: string;
  trashMode: boolean;
  searchRef: React.RefObject<HTMLInputElement | null>;
  onQueryChange: (q: string) => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onMoveToTrash: (entry: NoteEntry) => void;
  onRestore: (entry: NoteEntry) => void;
  onDeleteForever: (entry: NoteEntry) => void;
  onTogglePin: (noteId: string) => void;
}

/* ── What a note is, at a glance ─────────────────────────────────────────────
   The rows used to lead with their position in the sort, which is a number
   about the list rather than about the note. A glyph says what you are about to
   open — a checklist, a note with a picture in it, a note carrying a file — the
   way the sidebar's glyphs say what a scope is. Same alphabet in both columns,
   so the two read as one interface. ──────────────────────────────────────── */
const GLYPHS = {
  attachment: { icon: Paperclip, label: "Has an attachment" },
  image: { icon: ImageIcon, label: "Has a picture" },
  checklist: { icon: ListChecks, label: "Checklist" },
  table: { icon: Table2, label: "Has a table" },
  text: { icon: FileText, label: "Note" },
} as const;

function glyphFor(body: string): (typeof GLYPHS)[keyof typeof GLYPHS] {
  if (body.includes("napp-file:")) return GLYPHS.attachment;
  if (body.includes("](napp-image:") || body.includes("![")) return GLYPHS.image;
  if (/^\s*[-*+]\s\[[ xX]\]\s/m.test(body)) return GLYPHS.checklist;
  if (/^\s*\|.*\|\s*$/m.test(body)) return GLYPHS.table;
  return GLYPHS.text;
}

/* The catalogue. Titles here are never truncated to one line: the real corpus
   names notes things like "MAPPA 5: SK GROUP (il chaebol che ha catturato i
   pezzi giusti)", and a list that cuts that at 30 characters throws away the
   naming scheme its owner built. Three lines, then it stops. */

const Row = memo(function Row({
  mobile,
  gallery,
  entry,
  meta,
  selected,
  onSelect,
  trashMode,
  onMoveToTrash,
  onRestore,
  onDeleteForever,
  onTogglePin,
}: {
  mobile: boolean;
  gallery: boolean;
  entry: NoteEntry;
  meta: Meta;
  selected: boolean;
  trashMode: boolean;
  /* Every handler takes the entry it acts on, so the parent can pass one stable
     function per action instead of minting a closure per row per render. */
  onSelect: (entry: NoteEntry) => void;
  onMoveToTrash: (entry: NoteEntry) => void;
  onRestore: (entry: NoteEntry) => void;
  onDeleteForever: (entry: NoteEntry) => void;
  onTogglePin: (entry: NoteEntry) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: entry.note.id,
    disabled: mobile || trashMode,
  });
  const rowRef = useRef<HTMLDivElement>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const noteMeta = indexOf(meta).byNote.get(entry.note.id);

  useEffect(() => {
    if (selected) rowRef.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  useEffect(() => {
    if (!confirmDelete) return;
    const timer = window.setTimeout(() => setConfirmDelete(false), 3000);
    return () => window.clearTimeout(timer);
  }, [confirmDelete]);

  const { preview } = derivedOf(entry.note);
  const pinned = noteMeta?.pinned === true;
  const glyph = glyphFor(entry.note.body);
  const Glyph = glyph.icon;

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
      onClick={() => onSelect(entry)}
      style={{ opacity: isDragging ? 0.4 : 1 }}
      className={`group relative cursor-pointer transition-colors ${gallery ? "note-gallery-item flex flex-col" : "flex gap-3"} ${
        mobile && !gallery
          ? "mobile-note-row min-h-[4.5rem] touch-pan-y px-4 py-3"
          : gallery
            ? "touch-pan-y border border-rule-soft p-4"
            : "mx-2 mb-1 touch-none border-b border-rule-soft px-3 py-3"
      } ${
        selected
          ? mobile
            ? "bg-accent-wash"
            : "bg-accent-wash"
          : mobile
            ? "hover:bg-page"
            : "hover:bg-page"
      }`}
    >
      <span
        title={glyph.label}
        aria-label={glyph.label}
        role="img"
        className={`note-row-glyph ${gallery ? "is-gallery" : ""} ${
          selected ? "is-selected" : ""
        } ${pinned ? "is-pinned" : ""}`}
      >
        <Glyph size={mobile && !gallery ? 15 : 14} strokeWidth={1.8} />
      </span>

      <div className="min-w-0 flex-1">
        <p
          className={`${gallery ? "text-[15px]" : mobile ? "text-[16px]" : "text-[13.5px]"} leading-[1.35] ${
            entry.note.title ? "text-ink" : "text-ink-4 italic"
          }`}
          style={{
            fontWeight: 520,
            display: "-webkit-box",
            WebkitLineClamp: gallery ? 4 : 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {entry.note.title || "Untitled"}
        </p>

        <p className="note-row-summary mt-1 truncate">
          <span>{formatStamp(entry.note.updatedAt)}</span>
          {preview && <span className="note-row-preview">{preview}</span>}
        </p>
      </div>

      <div className="note-row-actions flex shrink-0 items-center gap-0.5">
        {!trashMode && (
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
              onTogglePin(entry);
            }}
            onPointerDown={(event) => event.stopPropagation()}
            className={`icon-button h-7 w-7 shrink-0 transition-all ${
              pinned
                ? "text-accent opacity-100"
                : "text-ink-4 opacity-100 md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100 hover:text-accent"
            }`}
          >
            <Pin
              size={13}
              strokeWidth={pinned ? 2.4 : 1.75}
              fill={pinned ? "currentColor" : "none"}
            />
          </button>
        )}
        {trashMode && (
          <button
            aria-label={`Restore ${entry.note.title || "Untitled"}`}
            title="Restore note"
            onClick={(event) => {
              event.stopPropagation();
              onRestore(entry);
            }}
            onPointerDown={(event) => event.stopPropagation()}
            className="icon-button h-7 w-7 shrink-0 text-accent"
          >
            <RotateCcw size={14} strokeWidth={2} />
          </button>
        )}

        <button
          aria-label={
            confirmDelete
              ? `Confirm permanent deletion of ${entry.note.title || "Untitled"}`
              : trashMode
                ? `Delete ${entry.note.title || "Untitled"} forever`
                : `Move ${entry.note.title || "Untitled"} to Trash`
          }
          title={
            confirmDelete
              ? trashMode
                ? "Click again to permanently delete"
                : "Click again to move to Trash"
              : trashMode
                ? `Delete "${entry.note.title || "Untitled"}" forever`
                : `Move "${entry.note.title || "Untitled"}" to Trash`
          }
          onClick={(e) => {
            e.stopPropagation();
            if (confirmDelete) {
              if (trashMode) onDeleteForever(entry);
              else onMoveToTrash(entry);
            } else setConfirmDelete(true);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className={`icon-button h-7 shrink-0 px-1.5 transition-all ${
            confirmDelete
              ? "bg-danger-fill text-on-danger opacity-100"
              : "text-ink-4 opacity-100 md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100 hover:text-danger"
          }`}
        >
          {confirmDelete ? (
            <span className="label text-[10px]">{trashMode ? "Forever?" : "Trash?"}</span>
          ) : (
            <Trash2 size={13} strokeWidth={1.75} />
          )}
        </button>
      </div>
    </div>
  );
});

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
  groups = [{ id: "notes", label: "Notes", entries }],
  view = "list",
  toolbarActions,
  topBar,
  footer,
  filters = [],
  meta,
  selectedId,
  query,
  loading,
  busy,
  folderLabel,
  trashMode,
  searchRef,
  onQueryChange,
  onSelect,
  onNew,
  onMoveToTrash,
  onRestore,
  onDeleteForever,
  onTogglePin,
}: Props) {
  const hasQuery = query.trim().length > 0;
  /* The page speaks in note ids; the rows hand back the whole entry. One stable
     adapter per action beats one fresh closure per row per render. */
  const selectEntry = useCallback((entry: NoteEntry) => onSelect(entry.note.id), [onSelect]);
  const togglePinEntry = useCallback(
    (entry: NoteEntry) => onTogglePin(entry.note.id),
    [onTogglePin],
  );
  const gallery = view === "gallery";

  const renderedGroups = groups.map((group, groupIndex) => (
    <section key={group.id} className="note-group" aria-labelledby={`note-group-${group.id}`}>
      <div className={`note-group-heading ${groupIndex === 0 ? "is-first" : ""}`}>
        <h3 id={`note-group-${group.id}`}>{group.label}</h3>
        <span>{group.entries.length}</span>
      </div>
      <div className={gallery ? "note-gallery-grid" : ""}>
        {group.entries.map((entry) => (
          <Row
            mobile={mobile}
            gallery={gallery}
            key={entry.note.id}
            entry={entry}
            meta={meta}
            selected={selectedId === entry.note.id}
            trashMode={trashMode}
            onSelect={selectEntry}
            onMoveToTrash={onMoveToTrash}
            onRestore={onRestore}
            onDeleteForever={onDeleteForever}
            onTogglePin={togglePinEntry}
          />
        ))}
      </div>
    </section>
  ));

  /* What is narrowing the list, and how to stop it narrowing. With the folder
     rail gone this is the only standing sign of a scope that is not "everything",
     so it is never hidden behind the menu that set it. */
  const filterStrip = filters.length > 0 && (
    <div className="filter-strip flex shrink-0 flex-wrap items-center gap-1.5 px-4 pt-2">
      {filters.map((filter) => (
        <button
          key={filter.id}
          type="button"
          className="filter-chip press"
          onClick={filter.onClear}
          aria-label={`Stop showing ${filter.label}`}
        >
          <span className="truncate">{filter.label}</span>
          <X size={12} strokeWidth={2.5} className="shrink-0" />
        </button>
      ))}
    </div>
  );

  if (mobile) {
    return (
      <section className="mobile-note-list relative flex h-full w-full flex-col overflow-hidden">
        <header className="collection-toolbar flex shrink-0 items-end px-5 pt-5 pb-3">
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-[2rem] font-semibold leading-none tracking-[-0.035em]">
              {folderLabel}
            </h1>
            <p className="readout mt-1.5 text-ink-4">
              {loading ? "Loading" : `${entries.length} notes`}
            </p>
          </div>
          <span className="flex items-center gap-1">{toolbarActions}</span>
        </header>

        {filterStrip}

        <div className="mobile-search-wrap absolute right-20 bottom-5 left-5 z-20">
          <div className="glass-toolbar flex h-13 items-center gap-2 px-4">
            <Search size={16} strokeWidth={2} className="shrink-0 text-ink-4" />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.stopPropagation();
                  onQueryChange("");
                  event.currentTarget.blur();
                }
              }}
              placeholder="Search notes"
              aria-label="Search notes"
              className="min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-ink-4"
            />
            {hasQuery && (
              <button
                title="Clear search"
                onClick={() => onQueryChange("")}
                className="icon-button h-8 w-8 shrink-0 text-ink-4"
              >
                <X size={14} strokeWidth={2.5} />
              </button>
            )}
          </div>
        </div>

        <div
          key={`${folderLabel}:${query.trim()}`}
          role="listbox"
          aria-label={`Notes in ${folderLabel}`}
          className="list-in min-h-0 flex-1 overflow-y-auto pb-24"
        >
          <div>
            {loading ? (
              <Skeletons />
            ) : entries.length === 0 ? (
              <div className="px-6 py-14 text-center">
                <p className="text-[14px] text-ink-3">
                  {hasQuery ? `Nothing matches “${query.trim()}”` : `${folderLabel} is empty`}
                </p>
                {(hasQuery || !trashMode) && (
                  <button
                    onClick={() => (hasQuery ? onQueryChange("") : onNew())}
                    className="mt-3 text-[14px] font-medium text-accent"
                  >
                    {hasQuery ? "Clear search" : "Write the first note"}
                  </button>
                )}
              </div>
            ) : (
              renderedGroups
            )}
          </div>
        </div>

        {!trashMode && (
          <button
            type="button"
            onClick={onNew}
            disabled={busy || loading}
            aria-label="New note"
            className="mobile-compose glass-toolbar absolute right-5 bottom-5 flex h-13 w-13 items-center justify-center text-accent disabled:opacity-40"
          >
            <SquarePen size={23} strokeWidth={1.9} />
          </button>
        )}
      </section>
    );
  }

  return (
    <section
      className={`collection-column flex h-full w-full shrink-0 flex-col ${gallery ? "is-gallery" : ""}`}
    >
      {topBar}
      <header className="collection-toolbar flex h-13 shrink-0 items-center gap-2 border-b border-rule px-4">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-ink">{folderLabel}</h2>
          <p className="readout mt-0.5 text-ink-4">
            {loading ? "Loading" : `${entries.length} notes`}
          </p>
        </div>
        {/* The compose control belongs beside the thing it adds to, not wedged
            into the search field where it covered the text being typed. */}
        {!trashMode && (
          <button
            onClick={onNew}
            disabled={busy || loading}
            title="New note · N"
            className="new-note-button press shrink-0"
          >
            <SquarePen size={14} strokeWidth={1.9} />
            <span>New note</span>
          </button>
        )}
        <span className="flex shrink-0 items-center gap-1">{toolbarActions}</span>
      </header>

      {filterStrip}

      <div className="glass-search mx-3 mt-3 flex h-10 shrink-0 items-center gap-2 px-3">
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
      </div>

      <div
        key={`${folderLabel}:${query.trim()}`}
        role="listbox"
        aria-label={`Notes in ${folderLabel}`}
        className="list-in flex-1 overflow-y-auto pt-2 pb-2"
      >
        {loading ? (
          <Skeletons />
        ) : entries.length === 0 ? (
          <div className="mx-3 mt-2 rounded-xl border border-dashed border-rule px-6 py-12 text-center">
            <p className="readout text-ink-2">
              {hasQuery ? `Nothing matches “${query.trim()}”` : `${folderLabel} is empty`}
            </p>
            {(hasQuery || !trashMode) && (
              <button
                onClick={() => (hasQuery ? onQueryChange("") : onNew())}
                className="label mt-3 text-accent transition-opacity hover:opacity-70"
              >
                {hasQuery ? "Clear search" : "Write the first note"}
              </button>
            )}
          </div>
        ) : (
          renderedGroups
        )}
      </div>
      {footer}
    </section>
  );
}
