import { indexOf } from "./derived.ts";
import type { NoteEntry } from "./entries.ts";
import type { Meta } from "./types.ts";

/* The scopes that are not folders.

   UNFILED no longer has a row of its own: a note with no folder belongs in All
   notes, which is where anyone looks for it. The value stays because it may be
   sitting in a stored list preference from before, and the list has to know
   what to do when it arrives. */
export const ALL = "__all";
export const UNFILED = "__unfiled";
export const TRASH = "__trash";
/* Filed away rather than thrown away. A note here is still editable and still
   yours; the trash is the waiting room, this is the shelf. */
export const ARCHIVE = "__archive";
/* Not a place a note is *in* — a place a note is named, because somebody said
   something about it and nobody has dealt with it yet. It is a scope and not a
   panel of its own for the same reason Trash is one: the list already knows how
   to draw notes, and a second list would be a second thing to keep in step. */
export const REMARKS = "__remarks";

/** The notes a scope holds, in one owner's metadata: the trash, the shelf, the
 *  remarked, everything else, or one folder of it. The web's list and the
 *  phone's read the same rule. The trash wins over the shelf: a note thrown
 *  away while archived is waiting to be deleted, the more urgent thing to say. */
export function entriesInScope(
  entries: readonly NoteEntry[],
  meta: Meta,
  scope: string,
  remarked: ReadonlySet<string> = new Set(),
): NoteEntry[] {
  const index = indexOf(meta);
  const trashed = (id: string) => Boolean(index.byNote.get(id)?.trashedAt);
  const archived = (id: string) => Boolean(index.byNote.get(id)?.archivedAt) && !trashed(id);
  const folderOf = (id: string) => {
    const folder = index.byNote.get(id)?.folderId ?? null;
    return folder && index.byFolder.has(folder) ? folder : null;
  };
  if (scope === TRASH) return entries.filter((entry) => trashed(entry.note.id));
  /* Not the trash: a note on its way out is nobody's to discuss. */
  if (scope === REMARKS)
    return entries.filter((entry) => remarked.has(entry.note.id) && !trashed(entry.note.id));
  if (scope === ARCHIVE) return entries.filter((entry) => archived(entry.note.id));
  const shelved = entries.filter((entry) => !trashed(entry.note.id) && !archived(entry.note.id));
  if (scope === ALL) return shelved;
  if (scope === UNFILED) return shelved.filter((entry) => folderOf(entry.note.id) === null);
  return shelved.filter((entry) => folderOf(entry.note.id) === scope);
}
