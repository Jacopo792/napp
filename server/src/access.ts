/* Who may open a note, and who may write it.
 *
 * The decision is made from two rows the *caller's own* Supabase client read:
 * if row level security did not hand them the note, this function never sees
 * it either, so a note hidden by `private.archived_note_visible()` is closed to
 * the collaboration server for exactly the reason it is closed to the browser.
 * The service role never takes part in the decision — it only persists what a
 * decision has already allowed. */

export interface NoteRow {
  id: string;
  archive_id: string;
  trashed_at: string | null;
  /** The one account that may write this note, or null while it is nobody's
   *  alone. Postgres refuses the metadata row to everybody else; this is the
   *  same answer for the document, which the service role writes and row level
   *  security therefore never sees. */
  locked_by: string | null;
}

export type Access =
  | { allowed: false; reason: string }
  | { allowed: true; readOnly: boolean; archiveId: string };

export function decideAccess(note: NoteRow | null, role: string | null, userId: string): Access {
  // Row level security returned nothing: not a member, or an archived note its
  // owner has chosen to keep to themselves. Both are the same answer here, and
  // the answer says nothing about which.
  if (!note) return { allowed: false, reason: "That note is not available" };
  if (!role) return { allowed: false, reason: "You are not a member of this archive" };

  // Trash is the waiting room: a note on its way out is read-only, the way it
  // is everywhere else in this app. A note somebody has locked is read-only to
  // everybody but them — the archive is still shared, and they can still open
  // it and still remark on it; what has been taken back is the writing.
  return {
    allowed: true,
    readOnly:
      role !== "editor" ||
      note.trashed_at !== null ||
      (note.locked_by !== null && note.locked_by !== userId),
    archiveId: note.archive_id,
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A document name is a note id and nothing else. */
export function noteIdOf(documentName: string): string | null {
  return UUID.test(documentName) ? documentName.toLowerCase() : null;
}

/** Only the deployed site and a developer's own machine may connect. A browser
 *  always sends an origin; something that does not is not the app. */
export function originAllowed(origin: string | null | undefined, allowed: string[]): boolean {
  return Boolean(origin) && allowed.includes(origin as string);
}
