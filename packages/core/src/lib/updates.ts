/* What changed while you were away — Notion's Updates, read out of the
 * versions the collaboration server already writes after every stretch of
 * somebody's writing (`note_versions`, with who wrote it and how much).
 *
 * The line is the same one the remarks use: when this account last opened the
 * note (`remarksSeen`, which is per note and travels with the account). So a
 * note leaves the list the moment you open it, the way a remark stops being
 * news, and nothing new needs storing. A note never opened is measured from
 * `floor` instead, or a first visit would list the archive's whole history.
 *
 * Pure, so `node --experimental-strip-types` can test it. */

export interface RecentVersion {
  noteId: string;
  createdAt: string;
  authorIds: string[];
  wordsAdded: number | null;
  wordsRemoved: number | null;
}

export interface NoteUpdate {
  /** Everybody but you who wrote in it since you last looked. */
  authorIds: string[];
  added: number;
  removed: number;
  last: string;
}

/** How far back a note never opened is read. */
export const UPDATES_WINDOW_DAYS = 7;

export function changedSince(
  versions: RecentVersion[],
  selfId: string,
  seen: Record<string, string>,
  floor: string,
): Map<string, NoteUpdate> {
  const changed = new Map<string, NoteUpdate>();
  for (const version of versions) {
    const others = version.authorIds.filter((id) => id !== selfId);
    if (others.length === 0) continue;
    const line = seen[version.noteId] ?? "";
    if (version.createdAt <= (line > floor ? line : floor)) continue;
    const found = changed.get(version.noteId) ?? { authorIds: [], added: 0, removed: 0, last: "" };
    for (const id of others) if (!found.authorIds.includes(id)) found.authorIds.push(id);
    found.added += version.wordsAdded ?? 0;
    found.removed += version.wordsRemoved ?? 0;
    if (version.createdAt > found.last) found.last = version.createdAt;
    changed.set(version.noteId, found);
  }
  return changed;
}
