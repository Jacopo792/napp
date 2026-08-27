import MDEditor from "@uiw/react-md-editor";
import "@uiw/react-md-editor/markdown-editor.css";
import { Check, Plus, PencilLine } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Meta, Tag } from "@/lib/types";
import type { NoteEntry } from "@/lib/entries";
import { TagBadge } from "./TagBadge";
import { useIsDark } from "@/lib/theme";

interface Props {
  entry: NoteEntry | null;
  meta: Meta;
  draft: { title: string; body: string } | null;
  canEdit: boolean;
  viewingAsPartner: boolean;
  titleRef: React.RefObject<HTMLInputElement | null>;
  onChange: (title: string, body: string) => void;
  onTagsChange: (noteId: string, tagIds: string[]) => void;
  onNew: () => void;
}

function countWords(s: string): number {
  const t = s.trim();
  return t ? t.split(/\s+/).length : 0;
}

export function NoteEditor({
  entry,
  meta,
  draft,
  canEdit,
  viewingAsPartner,
  titleRef,
  onChange,
  onTagsChange,
  onNew,
}: Props) {
  const isDark = useIsDark();
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pickerOpen) return;
    function onDown(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [pickerOpen]);

  const assignedIds = useMemo(
    () => (entry ? (meta.notes.find((n) => n.id === entry.note.id)?.tagIds ?? []) : []),
    [meta, entry],
  );
  const assigned = assignedIds
    .map((id) => meta.tags.find((t) => t.id === id))
    .filter(Boolean) as Tag[];
  const available = meta.tags.filter((t) => !assignedIds.includes(t.id));

  if (!entry || !draft) {
    return (
      <div className="flex-1 min-w-0 flex flex-col items-center justify-center bg-background gap-3">
        <PencilLine size={26} className="text-faint" strokeWidth={1.5} />
        <div className="text-center">
          <p className="text-[13px] text-muted">No note selected</p>
          <p className="text-[12px] text-faint mt-0.5">
            Pick one from the list, or start a new one.
          </p>
        </div>
        <button onClick={onNew} className="text-[12px] text-accent hover:opacity-70 cursor-pointer">
          New note · N
        </button>
      </div>
    );
  }

  const words = countWords(draft.body);

  return (
    <div className="flex-1 min-w-0 flex flex-col overflow-hidden bg-background">
      {/* Title + meta */}
      <div className="shrink-0 px-6 pt-5 pb-3">
        {viewingAsPartner && (
          <span
            className="inline-block mb-2 text-[10px] uppercase tracking-wider text-muted
                       border border-border rounded-full px-2 py-0.5"
          >
            {meta.partnerName ?? "Partner"}
            {!canEdit && " · read only"}
          </span>
        )}

        <input
          ref={titleRef}
          value={draft.title}
          onChange={(e) => canEdit && onChange(e.target.value, draft.body)}
          placeholder="Title"
          readOnly={!canEdit}
          aria-label="Note title"
          className="w-full text-[22px] leading-7 font-semibold tracking-[-0.02em]
                     bg-transparent outline-none text-foreground placeholder:text-faint"
        />

        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          <span className="tnum text-[11px] text-faint">
            {words} {words === 1 ? "word" : "words"}
          </span>
          <span className="text-faint">·</span>

          {assigned.map((tag) => (
            <TagBadge
              key={tag.id}
              tag={tag}
              size="xs"
              onRemove={
                canEdit
                  ? () =>
                      onTagsChange(
                        entry.note.id,
                        assignedIds.filter((t) => t !== tag.id),
                      )
                  : undefined
              }
            />
          ))}

          {canEdit && meta.tags.length > 0 && (
            <div className="relative" ref={pickerRef}>
              <button
                onClick={() => setPickerOpen((v) => !v)}
                aria-expanded={pickerOpen}
                className="flex items-center gap-0.5 text-[11px] text-muted hover:text-foreground
                           transition-colors cursor-pointer"
              >
                <Plus size={10} />
                Tag
              </button>
              {pickerOpen && (
                <div
                  className="absolute top-full left-0 mt-1.5 z-20 min-w-36 p-1 animate-scale-in
                             bg-raised border border-border rounded-xl
                             shadow-[0_8px_24px_-6px_rgba(0,0,0,0.28)]"
                >
                  {available.length === 0 ? (
                    <p className="px-2 py-1.5 text-[11px] text-faint">All tags applied</p>
                  ) : (
                    available.map((tag) => (
                      <button
                        key={tag.id}
                        onClick={() => {
                          onTagsChange(entry.note.id, [...assignedIds, tag.id]);
                          setPickerOpen(false);
                        }}
                        className="flex items-center gap-2 w-full px-1.5 py-1 rounded-lg
                                   hover:bg-selected transition-colors cursor-pointer"
                      >
                        <TagBadge tag={tag} size="xs" />
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {!canEdit && (
            <span className="flex items-center gap-1 text-[11px] text-muted">
              <Check size={10} /> Read only
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div
        className="flex-1 min-h-0 overflow-hidden border-t border-border"
        data-color-mode={isDark ? "dark" : "light"}
      >
        <MDEditor
          value={draft.body}
          onChange={(v) => canEdit && onChange(draft.title, v ?? "")}
          height="100%"
          preview="edit"
          visibleDragbar={false}
          textareaProps={{
            readOnly: !canEdit,
            placeholder: "Start writing…",
            spellCheck: true,
          }}
        />
      </div>
    </div>
  );
}
