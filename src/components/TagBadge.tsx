import { X } from "lucide-react";
import { TAG_COLORS, type Tag } from "@/lib/types";

interface Props {
  tag: Tag;
  onRemove?: () => void;
}

/** Compact, readable tag treatment for metadata around the writing surface. */
export function TagBadge({ tag, onRemove }: Props) {
  const p = TAG_COLORS.find((c) => c.id === tag.color) ?? TAG_COLORS[0];
  const swatch = p.darkFg;

  return (
    <span className="group inline-flex items-center gap-1.5 rounded-full border border-rule-soft bg-paper px-2 py-1">
      <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: swatch }} />
      <span className="text-[11px] font-medium text-ink-2">{tag.name}</span>
      {onRemove && (
        <button
          onClick={onRemove}
          title={`Remove ${tag.name}`}
          className="icon-button text-ink-4 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:text-danger"
        >
          <X size={10} strokeWidth={2.5} />
        </button>
      )}
    </span>
  );
}
