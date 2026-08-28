/* The scopes that are not folders.

   UNFILED no longer has a row of its own: a note with no folder belongs in All
   notes, which is where anyone looks for it. The value stays because it may be
   sitting in a stored list preference from before, and the list has to know
   what to do when it arrives. */
export const ALL = "__all";
export const UNFILED = "__unfiled";
export const TRASH = "__trash";

export function isVirtualScope(id: string): boolean {
  return id === ALL || id === UNFILED || id === TRASH;
}
