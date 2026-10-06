/* The order of a document, read out of the metadata every note already has.
 *
 * A chapter is a note with a `position`; the notebook is every note without
 * one. A part is a folder, and it is drawn wherever the run of chapters
 * crosses into it — so the order is one line, the parts are headings over
 * stretches of it, and a chapter can stand before the first part (an
 * introduction) or after the last (a conclusion) without belonging to one.
 *
 * Pure, so `node --experimental-strip-types` can test it. */

export interface Placed {
  id: string;
  folderId: string | null;
  position?: number | null;
}

export type StructureRow<T extends Placed> =
  | { kind: "part"; folderId: string; continued: boolean }
  | { kind: "chapter"; item: T; number: number };

/** Placed first, in order; the rest keep the order they were handed in. */
export function splitManuscript<T extends Placed>(items: T[]): { chapters: T[]; notebook: T[] } {
  const chapters = items
    .filter((item) => typeof item.position === "number")
    .sort((a, b) => (a.position as number) - (b.position as number));
  const notebook = items.filter((item) => typeof item.position !== "number");
  return { chapters, notebook };
}

/** Chapters with a part heading wherever the folder changes. A part met a
 *  second time is `continued`, which the pane shows quietly rather than
 *  pretending the part is in one place. Empty parts come last, so a part just
 *  made is somewhere to drop the first chapter. */
export function structureRows<T extends Placed>(
  chapters: T[],
  partIds: string[],
): StructureRow<T>[] {
  const known = new Set(partIds);
  const seen = new Set<string>();
  const rows: StructureRow<T>[] = [];
  let current: string | null = null;
  chapters.forEach((item, index) => {
    const folder = item.folderId && known.has(item.folderId) ? item.folderId : null;
    if (folder !== current) {
      if (folder) {
        rows.push({ kind: "part", folderId: folder, continued: seen.has(folder) });
        seen.add(folder);
      }
      current = folder;
    }
    rows.push({ kind: "chapter", item, number: index + 1 });
  });
  for (const id of partIds)
    if (!seen.has(id)) rows.push({ kind: "part", folderId: id, continued: false });
  return rows;
}

/** A position between two neighbours, so a move writes one row and never
 *  renumbers the others. Doubles halve about fifty times before two
 *  neighbours meet — ponytail: no renumbering yet, add it if anybody
 *  reorders one gap that often. */
export function positionBetween(before?: number | null, after?: number | null): number {
  const low = typeof before === "number" ? before : null;
  const high = typeof after === "number" ? after : null;
  if (low === null && high === null) return 1;
  if (low === null) return (high as number) - 1;
  if (high === null) return low + 1;
  return (low + high) / 2;
}

/** Where a chapter dropped at `index` of the chapter list (0 = first) goes,
 *  and which part it takes: the part of the chapter it now follows, or of the
 *  one it now precedes when it is first. Dropping on a part heading puts it
 *  at the start of that part instead — see `intoPart`. */
export function moveTo<T extends Placed>(
  chapters: T[],
  movingId: string,
  index: number,
): { position: number; folderId: string | null } {
  const rest = chapters.filter((item) => item.id !== movingId);
  const at = Math.max(0, Math.min(index, rest.length));
  const before = rest[at - 1];
  const after = rest[at];
  return {
    position: positionBetween(before?.position, after?.position),
    folderId: (before ?? after)?.folderId ?? null,
  };
}

/** The start of a part: before its first chapter, or after the last chapter
 *  of the document when the part has none yet. */
export function intoPart<T extends Placed>(
  chapters: T[],
  movingId: string,
  folderId: string,
): { position: number; folderId: string } {
  const rest = chapters.filter((item) => item.id !== movingId);
  const first = rest.findIndex((item) => item.folderId === folderId);
  if (first < 0) return { position: positionBetween(rest.at(-1)?.position, null), folderId };
  return {
    position: positionBetween(rest[first - 1]?.position, rest[first].position),
    folderId,
  };
}
