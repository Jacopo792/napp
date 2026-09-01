import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

/** Read every anchored quotation from the document. The range is important:
 * `textBetween` inserts a separator at paragraph boundaries, whereas joining
 * marked text nodes would render the last word of one paragraph against the
 * first word of the next. */
export function commentQuotes(document: ProseMirrorNode): Map<string, string> {
  const bounds = new Map<string, { from: number; to: number }>();
  document.descendants((node, pos) => {
    if (!node.isText) return true;
    for (const mark of node.marks) {
      if (mark.type.name !== "comment") continue;
      const id = mark.attrs.threadId as string;
      if (!id) continue;
      const found = bounds.get(id);
      const to = pos + node.nodeSize;
      bounds.set(
        id,
        found ? { from: Math.min(found.from, pos), to: Math.max(found.to, to) } : { from: pos, to },
      );
    }
    return true;
  });

  const quotes = new Map<string, string>();
  for (const [id, range] of bounds) {
    quotes.set(id, document.textBetween(range.from, range.to, " ").trim());
  }
  return quotes;
}
