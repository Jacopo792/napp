/* Every shortcut the window answers to, in the groups they are used in.
 *
 * A list and not a feature, and the only thing it has to be is true — so it
 * lives in one place and is read by everything that shows it: the `?` sheet,
 * and the Shortcuts section of Settings. Two copies of this would be one copy
 * and one lie. */

export interface Shortcut {
  group: string;
  keys: string;
  what: string;
}

export const SHORTCUTS: Shortcut[] = [
  { group: "Anywhere", keys: "\u2318K", what: "Search notes and commands" },
  { group: "Anywhere", keys: "\u2318N", what: "New note" },
  { group: "Anywhere", keys: "\u2318S", what: "Save now" },
  { group: "Anywhere", keys: "\u2318,", what: "Settings" },
  { group: "Anywhere", keys: "\u2318.", what: "Focus mode" },
  { group: "Anywhere", keys: "\u2318\\", what: "Show or hide the folders" },
  { group: "Anywhere", keys: "?", what: "This list" },
  { group: "Anywhere", keys: "Esc", what: "Leave focus mode" },
  { group: "The list", keys: "/", what: "Jump to the search field" },
  { group: "The list", keys: "N", what: "New note" },
  { group: "The list", keys: "\u2191 \u2193", what: "Move between notes" },
  { group: "The list", keys: "J K", what: "Move between notes" },
  { group: "The list", keys: "\u2325 \u2191 \u2193", what: "Move between days" },
  { group: "The list", keys: "\u21b5", what: "Open the title of the selected note" },
  { group: "In a note", keys: "\u2325D", what: "Draw on the page" },
  { group: "In a note", keys: "\u2318F", what: "Find in this note" },
  { group: "In a note", keys: "\u2318K", what: "Link the selected words" },
  { group: "In a note", keys: "/", what: "Formatting and blocks" },
  { group: "In a note", keys: "[[", what: "Link another note in this archive" },
  { group: "In a note", keys: "Esc", what: "Leave the text" },
];

/** The groups, in the order they were written. */
export function shortcutGroups(): string[] {
  return [...new Set(SHORTCUTS.map((entry) => entry.group))];
}
