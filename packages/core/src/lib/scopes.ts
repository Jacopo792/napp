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
