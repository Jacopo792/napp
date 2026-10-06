/* A cross-reference in the text: "sezione 2.1", "Figura 3.2", "nota 4",
 * worked out every time it is drawn from the counted document, so it follows
 * its target through every renumbering without a write. A click goes to the
 * target, in this chapter or another. A target that is gone says so, in the
 * place of the number, as Word's "Error! Reference source not found" does
 * — said as what it is. */
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { openPlace, useReferences } from "@/lib/documentContents";
import { REFERENCE_WORDS, referenceText, resolveReference, targetKind } from "@/lib/references";

export function CrossReferenceView({ node, extension, selected }: NodeViewProps) {
  const { counted, settings, chapters } = useReferences();
  const from = (extension.options as { noteId: () => string }).noteId();
  const attrs = node.attrs as Record<string, string | null>;
  const target = attrs.target
    ? resolveReference(counted, {
        target: attrs.target,
        noteId: attrs.noteId ?? from,
        kind: targetKind(attrs.kind),
        match: attrs.match ?? "",
      })
    : null;
  /* Outside a document there is nothing to count against: the words it was
     made with are the best there is. */
  const words = target
    ? referenceText(target, from, settings)
    : chapters.length
      ? REFERENCE_WORDS[settings.language].missing
      : (attrs.label ?? "");
  return (
    <NodeViewWrapper
      as="span"
      className={`cross-reference ${target ? "" : "is-missing"} ${selected ? "is-selected" : ""}`}
      contentEditable={false}
      title={target ? target.text : undefined}
      onClick={() => {
        if (target)
          openPlace({
            noteId: target.noteId,
            target: { kind: target.kind, id: target.id, index: target.index },
          });
      }}
    >
      {words}
    </NodeViewWrapper>
  );
}
