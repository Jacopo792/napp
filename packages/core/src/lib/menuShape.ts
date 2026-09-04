import type { ReactNode } from "react";
import type { SystemMenuItem } from "@/platform";

/* ── A menu, described once ──────────────────────────────────────────────────
   A menu in this application is drawn two ways: as a popover in the page, and
   — where the shell has a window manager under it — by the system itself. The
   second cannot be imitated by the first. An `NSMenu` is painted by macOS over
   the window, blurring the desktop behind it; a `<div>` reaches only what is
   behind it in the page, and no amount of `backdrop-filter` will find the
   wallpaper of a screen it is not on.

   So the menu is neither of those things. It is a list, and both renderers
   read it. Writing the items twice — once as JSX and once as a template — is a
   fork that would drift the first time somebody added an item, and drift
   silently, because only one of the two is ever on screen.

   One level of submenu, deliberately. The system draws a submenu as a submenu;
   the page draws it as a section you go into and come back from, because a
   flyout off a 240px popover pinned to the pointer is a thing to chase rather
   than a thing to read.

   The shape lives here and the hook that hands it to the system lives beside
   the components, for the reason `preferenceShape.ts` is its own file: this
   half reaches nothing, so `node --experimental-strip-types` can run a test
   over it. ──────────────────────────────────────────────────────────────── */

export type MenuItem =
  | { kind: "separator" }
  /** A line the menu says rather than offers: "Locked by Anna", "Move to". */
  | { kind: "label"; label: string }
  | {
      kind: "item";
      /** Unique in the whole tree — it is what comes back from the system. */
      id: string;
      label: string;
      /** Drawn in the page and nowhere else: an `NSMenu` item's image would be
       *  a bitmap crossing a process boundary, and the menus this app is
       *  modelled on carry no icons at all. */
      icon?: ReactNode;
      checked?: boolean;
      danger?: boolean;
      /** A key the item names but does not own, e.g. `esc`. Page only. */
      hint?: string;
      run?: () => void;
      submenu?: MenuItem[];
      /** What an empty submenu says instead of being empty. */
      whenEmpty?: string;
    };

/** The same list with everything a process boundary cannot carry taken off. A
 *  label becomes the disabled item it always was; an empty submenu becomes the
 *  one line it would have shown, because a submenu with nothing under it is an
 *  arrow that does nothing. */
export function forSystem(items: MenuItem[]): SystemMenuItem[] {
  return items.map((item) => {
    if (item.kind === "separator") return { type: "separator" };
    if (item.kind === "label") return { type: "item", label: item.label, enabled: false };
    const submenu = item.submenu
      ? item.submenu.length
        ? forSystem(item.submenu)
        : [{ type: "item" as const, label: item.whenEmpty ?? "Nothing here", enabled: false }]
      : undefined;
    return {
      type: "item" as const,
      id: item.id,
      label: item.label,
      checked: item.checked,
      ...(submenu ? { submenu } : {}),
    };
  });
}

/** The item an id names, wherever in the tree it is. */
export function findItem(items: MenuItem[], id: string): MenuItem | undefined {
  for (const item of items) {
    if (item.kind !== "item") continue;
    if (item.id === id) return item;
    const inner = item.submenu && findItem(item.submenu, id);
    if (inner) return inner;
  }
  return undefined;
}
