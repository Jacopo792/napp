/* A citation in the text, "(Rossi 2020, p. 12)" or "[3, p. 12]", worked out
 * each time it is drawn from the library and the order of citation, so a
 * change of style or a citation added earlier renumbers it without a write.
 * Outside a document that cites there is no library to ask, and it says the
 * words it was made with. */
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useReferences } from "@/lib/documentContents";
import { citationText, runsText, entryRuns } from "@/lib/citations";

export function CitationView({ node, selected }: NodeViewProps) {
  const { citing } = useReferences();
  const key = String(node.attrs.key ?? "");
  const locator = node.attrs.locator as string | null;
  const source = citing.sources.get(key);
  const words = citing.sources.size
    ? citationText(key, locator, citing)
    : String(node.attrs.label ?? key);
  return (
    <NodeViewWrapper
      as="span"
      className={`citation ${citing.sources.size && !source ? "is-missing" : ""} ${selected ? "is-selected" : ""}`}
      contentEditable={false}
      title={source ? runsText(entryRuns(source, citing.style, citing.language)) : key}
    >
      {words}
    </NodeViewWrapper>
  );
}
