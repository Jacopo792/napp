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
