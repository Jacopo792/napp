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

/** A name that does not contain the query whole may still hold it in order:
 *  "riu cli" or "rncl" in "Riunione cliente". The query's words are looked
 *  for one after another, and failing that its letters are. Both already
 *  folded. Lower is better, null is no: the number of separate runs the
 *  match is cut into counts most, then runs that start inside a word, then
 *  how far the match is spread, how late it starts, and how long the name
 *  is — the order Obsidian's quick switcher ranks by, written again here. */
export function fuzzyMatch(name: string, query: string): number | null {
  const words = query.split(/\s+/).filter(Boolean);
  return inOrder(name, words) ?? inOrder(name, [...words.join("")]);
}

function inOrder(name: string, pieces: string[]): number | null {
  if (pieces.length === 0) return null;
  let from = 0;
  let runs = 0;
  let inside = 0;
  let first = -1;
  for (const piece of pieces) {
    const at = name.indexOf(piece, from);
    if (at < 0) return null;
    if (first < 0 || at !== from) {
      runs += 1;
      if (at > 0 && /[\p{L}\p{N}]/u.test(name[at - 1])) inside += 1;
    }
    if (first < 0) first = at;
    from = at + piece.length;
  }
  const spread = from - first - pieces.join("").length;
  return runs - 1 + inside / 10 + spread / 100 + first / 1000 + name.length / 10000;
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
