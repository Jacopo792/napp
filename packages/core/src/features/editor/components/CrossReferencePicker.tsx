/* Word's Cross-reference dialog, cut to one list: everything the document
 * can be cited by — its sections, figures, tables and footnotes, in every
 * chapter — each with the number it is drawn with and its words, filtered
 * by what is typed. Word asks first for a kind, then for what to insert
 * ("number", "text", "page"); here the kind is the group the row is in, and
 * what is inserted is the one form a sentence needs. */
import { useEffect, useMemo, useRef, useState } from "react";
import { useReferences } from "@/lib/documentContents";
import {
  REFERENCE_WORDS,
  referenceText,
  type CountedTarget,
  type TargetKind,
} from "@/lib/references";
import { fold } from "@/lib/format";

const GROUPS: { kind: TargetKind; name: string }[] = [
  { kind: "section", name: "Sections" },
  { kind: "figure", name: "Figures" },
  { kind: "table", name: "Tables" },
  { kind: "footnote", name: "Footnotes" },
];

export function CrossReferencePicker({
  from,
  onPick,
  onClose,
}: {
  from: string;
  onPick: (target: CountedTarget, label: string, pendingId?: string) => void;
  onClose: () => void;
}) {
  const { counted, chapters, settings } = useReferences();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const list = useRef<HTMLDivElement>(null);

  /* This chapter first — what is cited most is what is near — then the
     others in order. */
  const rows = useMemo(() => {
    const q = fold(query.trim());
    const all = [
      ...(counted.get(from)?.targets ?? []),
      ...[...counted.entries()]
        .filter(([id]) => id !== from)
        .flatMap(([, chapter]) => chapter.targets),
    ];
    const label = (target: CountedTarget) => referenceText(target, from, settings);
    const matches = all.filter(
      (target) =>
        !q ||
        fold(target.text).includes(q) ||
        fold(label(target)).includes(q) ||
        fold(target.chapterTitle).includes(q),
    );
    return GROUPS.flatMap((group) =>
      matches.filter((target) => target.kind === group.kind).map((target) => ({ target, group })),
    );
  }, [counted, from, query, settings]);

  /* An id another chapter's reference is already waiting to give the same
     target, so a second citation agrees with the first. */
  const pendingId = (target: CountedTarget) =>
    target.id
      ? undefined
      : chapters
          .flatMap((chapter) => chapter.targets.references)
          .find(
            (use) =>
              use.noteId === target.noteId && use.kind === target.kind && use.match === target.text,
          )?.target;

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    list.current
      ?.querySelector<HTMLElement>(`[data-row="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const pick = (index: number) => {
    const row = rows[index];
    if (!row) return;
    onPick(row.target, referenceText(row.target, from, settings), pendingId(row.target));
  };

  const words = REFERENCE_WORDS[settings.language];
  let previous: TargetKind | null = null;

  return (
    <div className="popover ribbon-panel xref-picker" role="dialog" aria-label="Cross-reference">
      <input
        autoFocus
        className="xref-search"
        placeholder="Find a section, figure, table or note"
        aria-label="Find a target"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive((now) => Math.min(rows.length - 1, now + 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((now) => Math.max(0, now - 1));
          } else if (event.key === "Enter") {
            event.preventDefault();
            pick(active);
          } else if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          }
        }}
      />
      <div ref={list} className="xref-list" role="listbox" aria-label="Targets">
        {rows.length === 0 && <p className="xref-empty">Nothing to cite yet</p>}
        {rows.map(({ target, group }, index) => {
          const heading = group.kind !== previous ? group.name : null;
          previous = group.kind;
          const shown =
            target.kind === "section"
              ? target.number
              : `${target.kind === "footnote" ? words.footnote : words[target.kind]} ${target.number}`;
          return (
            <div key={`${target.noteId}:${target.kind}:${target.index}`}>
              {heading && <p className="menu-label">{heading}</p>}
              <button
                type="button"
                role="option"
                data-row={index}
                aria-selected={index === active}
                className={`menu-row xref-row ${index === active ? "is-active" : ""}`}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => pick(index)}
              >
                {shown && <span className="xref-number readout">{shown}</span>}
                <span className="xref-text">{target.text || "—"}</span>
                {target.noteId !== from && (
                  <span className="xref-where text-ink-4">{target.chapterTitle || "Untitled"}</span>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
