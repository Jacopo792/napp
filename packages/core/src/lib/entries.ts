import type { Note } from "./types";

/** A note plus the optimistic-concurrency version stored in Postgres. */
export interface NoteEntry {
  note: Note;
  version: number;
}

/** A snapshot read back from Postgres, laid over what this window holds. A
 *  note with unsaved local changes keeps its local entry, including one the
 *  snapshot does not have yet; newest first. `changed` is every note whose
 *  version differs from the one held here. Pure, so it can be tested. */
export function mergeRemoteEntries(
  local: NoteEntry[],
  remote: NoteEntry[],
  dirty: (id: string) => boolean,
): { entries: NoteEntry[]; changed: Set<string> } {
  const localById = new Map(local.map((entry) => [entry.note.id, entry]));
  const remoteIds = new Set(remote.map((entry) => entry.note.id));
  const changed = new Set<string>();
  for (const entry of remote)
    if (localById.get(entry.note.id)?.version !== entry.version) changed.add(entry.note.id);

  const entries = remote
    .map((entry) => (dirty(entry.note.id) ? (localById.get(entry.note.id) ?? entry) : entry))
    .concat(local.filter((entry) => dirty(entry.note.id) && !remoteIds.has(entry.note.id)))
    .sort((a, b) => b.note.updatedAt.localeCompare(a.note.updatedAt));
  return { entries, changed };
}
