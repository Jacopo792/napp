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

/** What can be found: a palette command on the web, a result on the phone. */
export interface Findable {
  /** The heading this sits under. Results are grouped, never sorted flat. */
  group: string;
  name: string;
  hint?: string;
  /** Words that should find this and are not in its name. */
  keywords?: string;
  /** Set by a search that has already decided how well this answers the
   *  query — a heading, a line of text. It is ranked as given. */
  rank?: number;
  /** When it last changed, in milliseconds: the last tiebreak. */
  at?: number;
  /** Found by a query, never listed at rest. */
  searchOnly?: boolean;
}

/* One scale for everything that can be found, so a chapter, a heading and a
   line of text can be put in one order: the start of a name, the start of a
   word in it, anywhere in it, a heading (3, given by the search), the words
   behind a name, its second line, and last the running text (6). */
export function scoreFor(item: Findable, query: string): number {
  if (item.rank !== undefined) return item.rank;
  const name = fold(item.name);
  if (name.startsWith(query)) return 0;
  const word = name.split(/\s+/).some((part) => part.startsWith(query));
  if (word) return 1;
  if (name.includes(query)) return 2;
  /* Held in order rather than whole: "riu cli" for "Riunione cliente". In
     two runs that each start a word it ranks under every whole match and
     over a heading. Anything looser is barely the name any more — "oggi" is
     in "questo passaggio" — and goes under the words a command was given to
     be found by, and under its own second line. `fuzzyMatch` counts a run
     starting inside a word as a tenth, so under 1.1 is exactly that. */
  const loose = fuzzyMatch(name, query);
  if (loose !== null && loose < 1.1) return 2 + (loose + 1) / 4;
  if (item.keywords && fold(item.keywords).includes(query)) return 4;
  if (item.hint && fold(item.hint).includes(query)) return 5;
  if (loose !== null) return 5.5;
  return -1;
}

/** At rest (`query` empty), grouped in the order the groups were handed over
 *  — the order of a resting palette is the caller's editorial decision — and
 *  each cut to `resting`. With a (folded) query, by how well each answers it,
 *  then by the kind of thing (the caller's order again), then by how
 *  recently it changed; and the groups follow their best row, so the heading
 *  that starts with the word is above the line of text that merely contains
 *  it. */
export function rankGroups<T extends Findable>(
  items: T[],
  query: string,
  resting = 5,
): { group: string; items: T[] }[] {
  const pool = query ? items : items.filter((item) => !item.searchOnly);
  const order = new Map<string, number>();
  for (const item of pool) if (!order.has(item.group)) order.set(item.group, order.size);
  const ranked = query
    ? pool
        .map((item) => ({ item, rank: scoreFor(item, query) }))
        .filter((entry) => entry.rank >= 0)
        .sort(
          (a, b) =>
            a.rank - b.rank ||
            order.get(a.item.group)! - order.get(b.item.group)! ||
            (b.item.at ?? 0) - (a.item.at ?? 0),
        )
        .map((entry) => entry.item)
    : pool;
  const groups: { group: string; items: T[] }[] = [];
  for (const item of ranked) {
    const bucket = groups.find((entry) => entry.group === item.group);
    if (bucket) bucket.items.push(item);
    else groups.push({ group: item.group, items: [item] });
  }
  return query ? groups : groups.map((g) => ({ ...g, items: g.items.slice(0, resting) }));
}
