import type { Node as PMNode } from "@tiptap/pm/model";
export function blockId(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value) ? value : null;
}
export function readBlockLink(text: string): { title: string; id: string } | null {
  const match = /^\[\[([^\]\n]+)#\^([A-Za-z0-9_-]{1,128})\]\]$/.exec(text.trim());
  return match && match[1].trim() ? { title: match[1].trim(), id: match[2] } : null;
}
export function paragraphLink(title: string, id: string): string {
  return `[[${(title || "Untitled").replace(/[[\]\n]/g, " ").trim()}#^${id}]]`;
}
export function anchoredBlock(document: PMNode, id: string): { from: number; to: number } | null {
  let found: { from: number; to: number } | null = null;
  document.descendants((node, pos) => {
    if (found) return false;
    if (node.isTextblock && node.attrs.blockId === id)
      found = { from: pos + 1, to: pos + 1 + node.content.size };
    return !found;
  });
  return found;
}
