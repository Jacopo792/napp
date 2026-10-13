/* The bibliography block: the works the document cites, from the library,
 * in the document's style. It holds no text of its own, like the `[TOC]`
 * block beside it, so it is never out of date and nothing in it is edited. */
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useMemo } from "react";
import { useReferences } from "@/lib/documentContents";
import { bibliography } from "@/lib/citations";

export function BibliographyView({ selected }: NodeViewProps) {
  const { citing } = useReferences();
  const entries = useMemo(() => bibliography(citing), [citing]);
  return (
    <NodeViewWrapper
      className={`bibliography-block ${citing.style === "numeric" ? "is-numeric" : ""} ${selected ? "is-selected" : ""}`}
      contentEditable={false}
      data-bibliography=""
    >
      {entries.length === 0 ? (
        <p className="bibliography-empty">Nothing cited yet</p>
      ) : (
        entries.map((entry) => (
          <div key={entry.key} className="bibliography-entry">
            {entry.number !== undefined && (
              <span className="bibliography-number">[{entry.number}]</span>
            )}
            {entry.runs.map((run, index) =>
              run.italic ? <em key={index}>{run.text}</em> : run.text,
            )}
          </div>
        ))
      )}
    </NodeViewWrapper>
  );
}
