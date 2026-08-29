import type { JSONContent } from "@tiptap/core";

/* ── Three-way merge over top-level blocks ───────────────────────────────────
   Two people writing in one note used to lose a whole burst of typing: the
   document is the unit of the write, so whoever saved second wrote a document
   built on a base from before the other started, and the first version was
   gone.

   This does not merge prose. It merges the block array of a ProseMirror
   document — paragraphs, headings, images, tables — which is the granularity
   the loss actually happens at. Both people appending at the end, or editing
   different parts, is the whole of the real case, and both are resolved here
   without a marker ever reaching the text.

   The comparison is by identity, not by similarity: a block is the same block
   if its JSON is the same. Two people who edited the *same* block produce a
   genuine conflict, and this returns null rather than guessing — the caller
   keeps the losing version somewhere it can be read.

   Changed regions are found by trimming the common prefix and the common
   suffix rather than by a full LCS. That is exact for edits that sit in one
   place, which is what editing a note is; a diff that scattered single blocks
   across the document would be reported as one wider region, which merges
   conservatively or conflicts, never wrongly. */

/** The window in which one side departs from the base. `start` indexes both
 *  the base and that side, because everything before it is identical. */
interface Region {
  start: number;
  baseEnd: number;
  sideEnd: number;
}

function changedRegion(base: string[], side: string[]): Region {
  let start = 0;
  while (start < base.length && start < side.length && base[start] === side[start]) start++;

  let tail = 0;
  while (
    tail < base.length - start &&
    tail < side.length - start &&
    base[base.length - 1 - tail] === side[side.length - 1 - tail]
  ) {
    tail++;
  }

  return { start, baseEnd: base.length - tail, sideEnd: side.length - tail };
}

/* A paragraph or heading with nothing in it is not content, it is where the
   caret is parked — and a fresh note is exactly one of them. Two people typing
   into the same blank spot are not in conflict: they are both writing, and the
   answer is both texts, not a copy. Anything that holds something — an image, a
   table, a paragraph with words — is real, and two people rewriting the same
   real block is a conflict this cannot resolve. */
function isBlank(node: JSONContent): boolean {
  if (node.type !== "paragraph" && node.type !== "heading") return false;
  const children = node.content;
  if (!children || children.length === 0) return true;
  return children.every((child) => child.type === "text" && !(child.text ?? "").trim());
}

function same(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function keys(blocks: JSONContent[]): string[] {
  return blocks.map((block) => JSON.stringify(block));
}

/**
 * Merges the block arrays of one document edited from `base` in two places.
 * Returns `null` when both sides changed overlapping blocks, which is the only
 * case a caller has to resolve itself.
 */
export function mergeBlocks(
  base: JSONContent[],
  local: JSONContent[],
  remote: JSONContent[],
): JSONContent[] | null {
  const baseKeys = keys(base);
  const localKeys = keys(local);
  const remoteKeys = keys(remote);

  if (same(baseKeys, localKeys)) return remote;
  if (same(baseKeys, remoteKeys)) return local;
  if (same(localKeys, remoteKeys)) return local;

  const localRegion = changedRegion(baseKeys, localKeys);
  const remoteRegion = changedRegion(baseKeys, remoteKeys);

  // Half-open windows over the base. Touching at an edge is not overlapping:
  // two people appending at the end both have an empty base window there.
  const overlaps =
    localRegion.start < remoteRegion.baseEnd && remoteRegion.start < localRegion.baseEnd;

  if (overlaps) {
    /* The one overlap worth resolving: what both sides replaced was blank. Take
       the union of the two windows — everything before it is common to all
       three — and put what each side wrote there, one after the other. Beyond
       a side's own window it agrees with the base again, which is what shifts
       its end index by the length that side changed. */
    const start = Math.min(localRegion.start, remoteRegion.start);
    const baseEnd = Math.max(localRegion.baseEnd, remoteRegion.baseEnd);
    if (!base.slice(start, baseEnd).every(isBlank)) return null;

    return [
      ...base.slice(0, start),
      ...local.slice(start, baseEnd + (localRegion.sideEnd - localRegion.baseEnd)),
      ...remote.slice(start, baseEnd + (remoteRegion.sideEnd - remoteRegion.baseEnd)),
      ...base.slice(baseEnd),
    ];
  }

  const localFirst =
    localRegion.start < remoteRegion.start ||
    (localRegion.start === remoteRegion.start && localRegion.baseEnd <= remoteRegion.baseEnd);

  const first = localFirst ? localRegion : remoteRegion;
  const firstBlocks = localFirst ? local : remote;
  const second = localFirst ? remoteRegion : localRegion;
  const secondBlocks = localFirst ? remote : local;

  return [
    ...base.slice(0, first.start),
    ...firstBlocks.slice(first.start, first.sideEnd),
    ...base.slice(first.baseEnd, second.start),
    ...secondBlocks.slice(second.start, second.sideEnd),
    ...base.slice(second.baseEnd),
  ];
}

const EMPTY_DOC: JSONContent = { type: "doc", content: [{ type: "paragraph" }] };

/** The same merge at document level, keeping the document's own attributes. */
export function mergeDocuments(
  base: JSONContent,
  local: JSONContent,
  remote: JSONContent,
): JSONContent | null {
  const merged = mergeBlocks(base.content ?? [], local.content ?? [], remote.content ?? []);
  if (!merged) return null;
  // A document with no blocks is not a document Tiptap will accept.
  return { ...remote, content: merged.length > 0 ? merged : (EMPTY_DOC.content ?? []) };
}

/**
 * The title is one string, so there is nothing to merge inside it: whoever
 * moved it away from the base is the one who meant to.
 */
export function mergeTitle(base: string, local: string, remote: string): string {
  if (local === base) return remote;
  return local;
}
