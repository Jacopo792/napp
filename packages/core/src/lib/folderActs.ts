import type { Meta } from "./types.ts";

export function renameFolder(prev: Meta, id: string, name: string): Meta {
  const trimmed = name.trim();
  if (!trimmed) return prev;
  return {
    ...prev,
    folders: prev.folders.map((folder) =>
      folder.id === id ? { ...folder, name: trimmed } : folder,
    ),
  };
}

/** A folder and every folder under it. */
function branchOf(prev: Meta, id: string): Set<string> {
  const branch = new Set([id]);
  for (let added = true; added; ) {
    added = false;
    for (const folder of prev.folders) {
      if (folder.parentId && branch.has(folder.parentId) && !branch.has(folder.id)) {
        branch.add(folder.id);
        added = true;
      }
    }
  }
  return branch;
}

/** The whole branch goes; its notes become unfiled. Nothing deletes prose. */
export function removeFolder(prev: Meta, id: string): Meta {
  const doomed = branchOf(prev, id);
  return {
    ...prev,
    folders: prev.folders.filter((folder) => !doomed.has(folder.id)),
    notes: prev.notes.map((note) =>
      note.folderId && doomed.has(note.folderId) ? { ...note, folderId: null } : note,
    ),
  };
}

/** Every note in the branch filed away to the Archive; the folders stay, and a
 *  trashed note stays in the Trash. */
export function shelveFolder(prev: Meta, id: string, at = new Date().toISOString()): Meta {
  const branch = branchOf(prev, id);
  return {
    ...prev,
    notes: prev.notes.map((note) =>
      note.folderId && branch.has(note.folderId) && !note.trashedAt && !note.archivedAt
        ? { ...note, archivedAt: at }
        : note,
    ),
  };
}
