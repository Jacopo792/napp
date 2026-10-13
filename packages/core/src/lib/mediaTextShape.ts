/* A media id lives in the document, so a search hit is joined to its note by
 * walking the JSON already in memory, never by changing the note's body. */
export interface ReadableMedia {
  id: string;
  type: "image" | "pdf";
  label: string;
}
export function readableMedia(document: unknown): ReadableMedia[] {
  const found = new Map<string, ReadableMedia>();
  function visit(value: unknown) {
    if (!value || typeof value !== "object") return;
    const node = value as {
      type?: string;
      attrs?: { objectId?: unknown; label?: unknown; alt?: unknown };
      content?: unknown[];
    };
    const id = node.attrs?.objectId;
    const label = String(node.attrs?.label ?? node.attrs?.alt ?? "Image");
    if (
      typeof id === "string" &&
      id &&
      (node.type === "privateImage" || (node.type === "privateFile" && /\.pdf$/i.test(label)))
    )
      found.set(id, { id, type: node.type === "privateImage" ? "image" : "pdf", label });
    node.content?.forEach(visit);
  }
  visit(document);
  return [...found.values()];
}
