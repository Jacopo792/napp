/* What happens to a note's metadata when it is trashed, shelved, restored or
 * kept by its holder — the half of every per-note act that is not drawing.
 *
 * It lives here rather than inside the web's Notes.tsx because the phone does
 * the same acts with its own hands, and two copies of "archiving sets this
 * stamp" is two answers waiting to disagree. Pure, and imported with the
 * extension, so `node --experimental-strip-types` can test it. */
import type { Meta, NoteMeta } from "./types.ts";

/** One note's metadata changed by `change`, or created for it when the note
 *  had none yet — a note that was never filed or pinned has no row. */
function withNote(prev: Meta, noteId: string, change: Partial<NoteMeta>): Meta {
  const exists = prev.notes.some((note) => note.id === noteId);
  return {
    ...prev,
    notes: exists
      ? prev.notes.map((note) => (note.id === noteId ? { ...note, ...change } : note))
      : [...prev.notes, { id: noteId, folderId: null, ...change }],
  };
}

export const trashNote = (prev: Meta, noteId: string, at = new Date().toISOString()): Meta =>
  withNote(prev, noteId, { trashedAt: at });

export const restoreNote = (prev: Meta, noteId: string): Meta =>
  withNote(prev, noteId, { trashedAt: undefined });

export const shelveNote = (
  prev: Meta,
  noteId: string,
  archived: boolean,
  at = new Date().toISOString(),
): Meta => withNote(prev, noteId, { archivedAt: archived ? at : undefined });

export const pinNote = (prev: Meta, noteId: string): Meta =>
  withNote(prev, noteId, {
    pinned: !prev.notes.find((note) => note.id === noteId)?.pinned,
  });

/** Locking names one account on the row; unlocking clears it. Nobody can do
 *  either on somebody else's lock — `honourLocks` puts that row back. */
export const lockNote = (prev: Meta, noteId: string, selfId: string): Meta =>
  withNote(prev, noteId, {
    lockedBy:
      prev.notes.find((note) => note.id === noteId)?.lockedBy === selfId ? undefined : selfId,
  });

export const fileNote = (prev: Meta, noteId: string, folderId: string | null): Meta =>
  withNote(prev, noteId, { folderId });

/** A note somebody else has locked keeps the metadata it had. Postgres refuses
 *  the write either way; what this saves is a list that shows a move the
 *  archive rejected. */
export function honourLocks(base: Meta, proposed: Meta, selfId: string | null): Meta {
  const held = new Map(
    base.notes
      .filter((note) => note.lockedBy && note.lockedBy !== selfId)
      .map((note) => [note.id, note]),
  );
  if (held.size === 0) return proposed;
  return {
    ...proposed,
    notes: [
      ...proposed.notes.map((note) => held.get(note.id) ?? note),
      ...[...held.values()].filter((note) => !proposed.notes.some((kept) => kept.id === note.id)),
    ],
  };
}
