/* What ⌘K finds inside a note, from what is already in memory: the headings
 * a chapter is divided by, and the line of text a word was found in. Pure,
 * so `node --experimental-strip-types` can test it; the palette itself only
 * ranks and draws. Every comparison goes through `fold()`, so "perche" finds
 * "perché" here exactly as it does in the list. */
import { fold } from "./format.ts";

/** How well a name answers a query: the start of it, the start of one of its
 *  words, anywhere in it — or not at all. Lower is better. */
export function nameMatch(name: string, query: string): number {
  const folded = fold(name);
  if (folded.startsWith(query)) return 0;
  if (folded.split(/[\s\-—–.,;:()«»"']+/).some((word) => word.startsWith(query))) return 1;
  if (folded.includes(query)) return 2;
  return -1;
}

export interface Heading {
  text: string;
  level: number;
}

/** The headings of a Tiptap document, in order — walked the way `linksTo()`
 *  walks it, because a heading is a node and there is nothing to index. */
export function headingsOf(document: unknown): Heading[] {
  const found: Heading[] = [];
  const textOf = (node: unknown): string => {
    if (!node || typeof node !== "object") return "";
    const { text, content } = node as { text?: string; content?: unknown[] };
    return (text ?? "") + (Array.isArray(content) ? content.map(textOf).join("") : "");
  };
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const { type, attrs, content } = node as {
      type?: string;
      attrs?: { level?: number };
      content?: unknown[];
    };
    if (type === "heading") {
      const text = textOf(node).trim();
      if (text) found.push({ text, level: attrs?.level ?? 1 });
      return;
    }
    if (Array.isArray(content)) content.forEach(walk);
  };
  walk(document);
  return found;
}

export interface Snippet {
  before: string;
  match: string;
  after: string;
}

/** The words around the first place `query` (already folded) occurs in
 *  `text`, with the match cut out exactly as it is written there — accents
 *  and capitals included, because that is what the editor is then asked to
 *  find. Folding is done a character at a time so the offsets in the folded
 *  string still point into the original one. */
export function snippetOf(text: string, query: string, radius = 48): Snippet | null {
  if (!query) return null;
  const line = text.replace(/\s+/g, " ").trim();
  let folded = "";
  const at: number[] = [];
  for (let index = 0; index < line.length; index += 1) {
    const one = fold(line[index]);
    for (let n = 0; n < one.length; n += 1) at.push(index);
    folded += one;
  }
  const hit = folded.indexOf(query);
  if (hit < 0) return null;
  const start = at[hit];
  const end = at[hit + query.length - 1] + 1;

  let from = Math.max(0, start - radius);
  let to = Math.min(line.length, end + radius);
  // Cut at a space, so the line does not start or stop in the middle of a word.
  if (from > 0) from = line.indexOf(" ", from) + 1 || from;
  if (to < line.length) to = line.lastIndexOf(" ", to) > end ? line.lastIndexOf(" ", to) : to;
  return {
    before: (from > 0 ? "…" : "") + line.slice(from, start),
    match: line.slice(start, end),
    after: line.slice(end, to) + (to < line.length ? "…" : ""),
  };
}
