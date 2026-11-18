import type { NoteMeta } from "./types";

/** The placement columns that differ between what this device last knew and
 *  what it now wants — every column for a note it did not know. */
export function placementPatch(
  previous: NoteMeta | undefined,
  next: NoteMeta,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const changed = (read: (m: NoteMeta) => unknown) => !previous || read(previous) !== read(next);
  if (changed((m) => m.folderId ?? null)) patch.folder_id = next.folderId ?? null;
  if (changed((m) => m.pinned ?? false)) patch.pinned = next.pinned ?? false;
  if (changed((m) => m.position ?? null)) patch.position = next.position ?? null;
  if (changed((m) => m.trashedAt ?? null)) patch.trashed_at = next.trashedAt ?? null;
  if (changed((m) => m.archivedAt ?? null)) patch.archived_at = next.archivedAt ?? null;
  if (changed((m) => m.lockedBy ?? null)) patch.locked_by = next.lockedBy ?? null;
  if (changed((m) => JSON.stringify(m.chapter ?? null))) patch.chapter = next.chapter ?? null;
  return patch;
}
