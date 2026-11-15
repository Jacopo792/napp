/* The widths of the two panes beside a note, and which of them a docked
   column puts away. Pure, so `node --experimental-strip-types` can test it;
   the state and the slides are `useNotesLayout`'s. */

export const SIDEBAR_WIDTH_KEY = "napp:sidebar-width";
export const LIST_WIDTH_KEY = "napp:list-width";
export const SIDEBAR_DEFAULT = 248;
export const LIST_DEFAULT = 380;
/* What the strip above the column has to hold: 88px of traffic-light gutter on
   macOS, the 70px scope switch, and the two buttons at the end of it, with the
   gaps. Narrower than this and the buttons are underneath the faces. */
export const SIDEBAR_MIN = 248;
export const SIDEBAR_MAX = 420;
export const LIST_MIN = 300;
export const LIST_MAX = 620;
/** What the note keeps when the panes are laid out. */
const EDITOR_RESERVE = 380;
/** The docked columns are 320–340px; the note beside one keeps this much. */
const DOCKED_PANEL_WIDTH = 340;
const NOTE_COLUMN_MIN = 420;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function loadPaneWidth(key: string, fallback: number, min: number, max: number): number {
  try {
    const stored = Number(localStorage.getItem(key));
    return Number.isFinite(stored) && stored > 0 ? clamp(stored, min, max) : fallback;
  } catch {
    return fallback;
  }
}

/* Always leave a useful writing surface. The handles already stop before
   either pane can eat the editor; what they cannot stop is the window itself
   getting smaller. A pane keeps the width it was stored with, so shrinking the
   window took the whole difference out of the note — at 900px the writing
   column was 232px and everything in its toolbar was on top of everything
   else, which was the "squashed in miniature" report.

   So the *shown* widths are clamped to the room there is, and the stored ones
   are left alone: widen the window again and the panes come back to where
   they were put. The list gives ground first, because it is a preview column
   and the folders are a fixed vocabulary that either fits or does not. */
export function paneWidths(windowWidth: number, sidebarWidth: number, listWidth: number) {
  const room = Math.max(SIDEBAR_MIN + LIST_MIN, windowWidth - EDITOR_RESERVE - 2);
  const listShown = Math.max(LIST_MIN, Math.min(listWidth, room - SIDEBAR_MIN));
  const sidebarShown = Math.max(SIDEBAR_MIN, Math.min(sidebarWidth, room - listShown));
  return {
    sidebarShown,
    listShown,
    sidebarMax: Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, room - listShown)),
    listMax: Math.max(LIST_MIN, Math.min(LIST_MAX, room - sidebarShown)),
  };
}

/** Which panes a docked column puts away so the note stays readable: the
 *  folders first, then the list. Each pane is its open state and its width. */
export function panesToHide(
  windowWidth: number,
  sidebar: { open: boolean; width: number },
  list: { open: boolean; width: number },
): { sidebar: boolean; list: boolean } {
  const room = (open: boolean, width: number) => (open ? width + 1 : 0);
  const note = (withSidebar: boolean) =>
    windowWidth -
    room(withSidebar, sidebar.width) -
    room(list.open, list.width) -
    DOCKED_PANEL_WIDTH;
  if (note(sidebar.open) >= NOTE_COLUMN_MIN) return { sidebar: false, list: false };
  return { sidebar: sidebar.open, list: note(false) < NOTE_COLUMN_MIN };
}
