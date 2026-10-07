import type { Folder } from "./types.ts";

/* A folder's place is its index in the archive's folder list — that index is
   what `persistMetaDiff` writes as `position`, and siblings are drawn in it.
   So moving a folder is moving it in the array, and taking the parent of the
   folder it was dropped against: a folder dragged beside another one is put
   among that one's siblings. */

/** A folder's drag id, apart from a note's, which is the bare note id. */
export const FOLDER_DRAG = "folder:";

/** The tree read top to bottom, the order a hand sees it in. */
function readingOrder(folders: Folder[]): string[] {
  const known = new Set(folders.map((folder) => folder.id));
  const children = new Map<string | null, Folder[]>();
  for (const folder of folders) {
    const parent = folder.parentId && known.has(folder.parentId) ? folder.parentId : null;
    children.set(parent, [...(children.get(parent) ?? []), folder]);
  }
  const order: string[] = [];
  const seen = new Set<string>();
  const walk = (parent: string | null) => {
    for (const folder of children.get(parent) ?? []) {
      if (seen.has(folder.id)) continue;
      seen.add(folder.id);
      order.push(folder.id);
      walk(folder.id);
    }
  };
  walk(null);
  return order;
}

/** Moving down lands after the row under the hand, moving up lands before it —
 *  the rule the book's structure already follows. */
export function folderDropSide(folders: Folder[], dragged: string, target: string) {
  const order = readingOrder(folders);
  return order.indexOf(dragged) < order.indexOf(target) ? "after" : "before";
}

function inside(folders: Folder[], id: string, ancestor: string): boolean {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  for (let at = byId.get(id), hops = 0; at && hops <= folders.length; hops++) {
    if (at.id === ancestor) return true;
    at = at.parentId ? byId.get(at.parentId) : undefined;
  }
  return false;
}

/** The list with `dragged` beside `target`, or null where the drop means
 *  nothing — onto itself, or into its own branch. */
export function moveFolder(folders: Folder[], dragged: string, target: string): Folder[] | null {
  if (dragged === target) return null;
  const moving = folders.find((folder) => folder.id === dragged);
  const anchor = folders.find((folder) => folder.id === target);
  if (!moving || !anchor || inside(folders, target, dragged)) return null;
  const side = folderDropSide(folders, dragged, target);
  const rest = folders.filter((folder) => folder.id !== dragged);
  const at = rest.findIndex((folder) => folder.id === target) + (side === "after" ? 1 : 0);
  rest.splice(at, 0, { ...moving, parentId: anchor.parentId ?? null });
  return rest;
}
