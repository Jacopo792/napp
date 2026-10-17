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

/** The whole branch goes; its notes become unfiled. Nothing deletes prose. */
export function removeFolder(prev: Meta, id: string): Meta {
  const doomed = new Set([id]);
  for (let added = true; added; ) {
    added = false;
    for (const folder of prev.folders) {
      if (folder.parentId && doomed.has(folder.parentId) && !doomed.has(folder.id)) {
        doomed.add(folder.id);
        added = true;
      }
    }
  }
  return {
    ...prev,
    folders: prev.folders.filter((folder) => !doomed.has(folder.id)),
    notes: prev.notes.map((note) =>
      note.folderId && doomed.has(note.folderId) ? { ...note, folderId: null } : note,
    ),
  };
}
