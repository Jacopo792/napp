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
  /** Which kind of archive answers to it; both when absent. A document has
   *  no list to walk and a notes archive has no chapters, so each is shown
   *  the keys it has and nothing else. */
  kind?: "notes" | "document";
}

const NOTES = "notes" as const;
const DOC = "document" as const;

export const SHORTCUTS: Shortcut[] = [
  { group: "Anywhere", keys: "\u2318K", what: "Search everything" },
  { group: "Anywhere", keys: "\u2318N", what: "New note", kind: NOTES },
  { group: "Anywhere", keys: "\u2318N", what: "New chapter", kind: DOC },
  { group: "Anywhere", keys: "\u2318S", what: "Save now" },
  { group: "Anywhere", keys: "\u2318,", what: "Settings" },
  { group: "Anywhere", keys: "\u2318.", what: "Focus mode" },
  { group: "Anywhere", keys: "\u2318\\", what: "Show or hide the folders", kind: NOTES },
  { group: "Anywhere", keys: "\u2318\\", what: "Show or hide the structure", kind: DOC },
  { group: "Anywhere", keys: "\u2318/", what: "This list" },
  { group: "Anywhere", keys: "Esc", what: "Leave focus mode" },
  { group: "The list", keys: "/", what: "Jump to the search field", kind: NOTES },
  { group: "The list", keys: "N", what: "New note", kind: NOTES },
  { group: "The list", keys: "\u2191 \u2193", what: "Move between notes", kind: NOTES },
  { group: "The list", keys: "J K", what: "Move between notes", kind: NOTES },
  { group: "The list", keys: "\u2325 \u2191 \u2193", what: "Move between days", kind: NOTES },
  {
    group: "The list",
    keys: "\u21b5",
    what: "Open the title of the selected note",
    kind: NOTES,
  },
  {
    group: "The document",
    keys: "\u2325\u2318\u2191 \u2325\u2318\u2193",
    what: "Previous or next chapter",
    kind: DOC,
  },
  {
    group: "The document",
    keys: "\u2325\u2318I",
    what: "Inspector: headings, comments, versions",
    kind: DOC,
  },
  { group: "In a note", keys: "\u2325D", what: "Draw on the page", kind: NOTES },
  { group: "In a note", keys: "\u2318F", what: "Find in this note", kind: NOTES },
  { group: "In a note", keys: "\u2318K", what: "Link the selected words", kind: NOTES },
  { group: "In a note", keys: "/", what: "Formatting and blocks", kind: NOTES },
  { group: "In a note", keys: "[[", what: "Link another note in this archive", kind: NOTES },
  { group: "In a note", keys: "Esc", what: "Leave the text", kind: NOTES },
  {
    group: "In the text",
    keys: "\u2318B \u2318I \u2318U",
    what: "Bold, italic, underline",
    kind: DOC,
  },
  {
    group: "In the text",
    keys: "\u21e7\u2318L E R J",
    what: "Align left, centre, right, justify",
    kind: DOC,
  },
  { group: "In the text", keys: "\u2318\u21b5", what: "Page break", kind: DOC },
  { group: "In the text", keys: "\u2325\u2318F", what: "Footnote", kind: DOC },
  { group: "In the text", keys: "\u2318F", what: "Find and replace", kind: DOC },
  { group: "In the text", keys: "\u2318K", what: "Link the selected words", kind: DOC },
  { group: "In the text", keys: "/", what: "Formatting and blocks", kind: DOC },
  { group: "In the text", keys: "[[", what: "Link a chapter or a note", kind: DOC },
  { group: "In the text", keys: "Esc", what: "Leave the text", kind: DOC },
];

/** The keys an archive of this kind answers to. */
export function shortcutsFor(kind: "notes" | "document"): Shortcut[] {
  return SHORTCUTS.filter((entry) => !entry.kind || entry.kind === kind);
}

/** The groups, in the order they were written. */
export function shortcutGroups(kind: "notes" | "document"): string[] {
  return [...new Set(shortcutsFor(kind).map((entry) => entry.group))];
}

/* Whether the keys go by their Apple names. `Notes.tsx` has always answered
   `metaKey || ctrlKey`, so every shortcut above already works on a machine
   with no ⌘ — what did not was the list *saying* so, which left the sheet and
   Settings naming a key that is not on the keyboard. Windows and Linux, in the
   desktop window and in a tab alike, so this is not a shell question and does
   not belong on `platform.ts`. Read once: the keyboard does not change. */
const APPLE = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);

/** The same keys, named the way this machine names them. */
export function keyName(keys: string): string {
  if (APPLE) return keys;
  return keys.replace(/\u2318\s*/g, "Ctrl+").replace(/\u2325\s*/g, "Alt+");
}
