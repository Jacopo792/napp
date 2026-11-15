/* Which notes the list shows: the scope first (trash, remarks, the shelf, a
   folder, or everything still in use), then the search, folded like the
   haystack it is looked for in. Order is `groupEntries`'s business.

   Pure, so `node --experimental-strip-types` can test it. */
import { derivedOf, indexOf } from "./derived.ts";
import type { NoteEntry } from "./entries.ts";
import { fold } from "./format.ts";
import { ALL, ARCHIVE, REMARKS, TRASH, UNFILED } from "./scopes.ts";
import type { Meta } from "./types.ts";

export interface Slice {
  meta: Meta;
  scope: string;
  query: string;
  trashedIds: ReadonlySet<string>;
  archivedIds: ReadonlySet<string>;
  remarkedIds: ReadonlySet<string>;
  /** Folded text read out of each note's images and files, by note id. */
  mediaHaystacks: ReadonlyMap<string, string>;
}

export function visibleEntries(owned: NoteEntry[], slice: Slice): NoteEntry[] {
  const { scope, trashedIds, archivedIds, remarkedIds } = slice;
  const index = indexOf(slice.meta);
  const folderOf = (id: string) => {
    const fid = index.byNote.get(id)?.folderId ?? null;
    return fid && index.byFolder.has(fid) ? fid : null;
  };

  let list = owned;
  if (scope === TRASH) {
    list = list.filter((entry) => trashedIds.has(entry.note.id));
  } else if (scope === REMARKS) {
    /* Not the trash: a note on its way out is nobody's to discuss. */
    list = list.filter((entry) => remarkedIds.has(entry.note.id) && !trashedIds.has(entry.note.id));
  } else if (scope === ARCHIVE) {
    list = list.filter((entry) => archivedIds.has(entry.note.id));
  } else {
    list = list.filter(
      (entry) => !trashedIds.has(entry.note.id) && !archivedIds.has(entry.note.id),
    );
    if (scope === UNFILED) list = list.filter((e) => folderOf(e.note.id) === null);
    else if (scope !== ALL) list = list.filter((e) => folderOf(e.note.id) === scope);
  }

  const q = fold(slice.query.trim());
  if (q) {
    list = list.filter(
      (e) =>
        derivedOf(e.note).haystack.includes(q) || slice.mediaHaystacks.get(e.note.id)?.includes(q),
    );
  }
  return list;
}
