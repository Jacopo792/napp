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
  /* Only the desktop app can be reached from outside its window. */
  {
    group: "Anywhere",
    keys: "\u2325\u2318N",
    what: "New note from any app (desktop)",
    kind: NOTES,
  },
  { group: "Anywhere", keys: "\u2318N", what: "New chapter", kind: DOC },
  { group: "Anywhere", keys: "\u2318S", what: "Save now" },
  { group: "Anywhere", keys: "\u2318,", what: "Settings" },
  { group: "Anywhere", keys: "\u2318.", what: "Focus mode" },
  { group: "Anywhere", keys: "\u2318B", what: "Show or hide the folders", kind: NOTES },
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
  { group: "In a note", keys: "[[", what: "Link another note in this group", kind: NOTES },
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

/* What a keystroke in the window means, decided without the DOM so it can be
   tested. The handler in `Notes.tsx` reads the target and the state, asks
   this, and performs the answer; null leaves the key to whoever else wants it.
   The order is the meaning: the chords come first because they are reached
   for while writing, and only then does a field keep the keys typed into it. */

export interface KeyPress {
  key: string;
  code: string;
  /** ⌘ on a Mac, Ctrl elsewhere. */
  mod: boolean;
  alt: boolean;
  shift: boolean;
}

export interface KeyContext {
  /** The key went to an input, a text area, a select or editable text. */
  typing: boolean;
  /** …and it was editable text, where ⌘B is still Bold. */
  inText: boolean;
  /** Words are chosen in the note's text and may be linked (⌘K). */
  linkable: boolean;
  /** A note is open in the editor (⌘F finds in it rather than the list). */
  noteOpen: boolean;
  /** A note is selected in the list, open or still loading. */
  noteSelected: boolean;
  canEdit: boolean;
  /** A document archive: ⌘N is a chapter and the list keys mean nothing. */
  document: boolean;
  /** ⌘\ shows the structure rather than the folders. */
  structure: boolean;
  focusMode: boolean;
}

export type WindowCommand =
  | "save"
  | "find"
  | "search"
  | "link"
  | "palette"
  | "draw"
  | "previous-chapter"
  | "next-chapter"
  | "new-chapter"
  | "new"
  | "settings"
  | "focus"
  | "structure"
  | "navigation"
  | "shortcuts"
  | "search-field"
  | "down"
  | "up"
  | "next-group"
  | "previous-group"
  | "open-title";

export function windowCommand(press: KeyPress, at: KeyContext): WindowCommand | null {
  const { mod, alt } = press;
  const key = press.key.toLowerCase();
  if (mod && key === "s") return "save";
  if (mod && key === "f") return at.noteOpen ? "find" : "search";
  /* Inside the text ⌘K is still "link these words", but only while words are
     chosen: with the caret merely in a book's text the palette was otherwise
     out of reach. */
  if (mod && key === "k") return at.canEdit && at.linkable ? "link" : "palette";
  /* `code`, not `key`: Option and D together are "∂" on a Mac. */
  if (alt && !mod && press.code === "KeyD" && at.noteSelected && at.canEdit) return "draw";
  /* A document answers ⌘N with a chapter and walks its chapters with ⌥⌘↑ ⌥⌘↓. */
  if (at.document && mod) {
    if (alt && press.key === "ArrowUp") return "previous-chapter";
    if (alt && press.key === "ArrowDown") return "next-chapter";
    if (key === "n") return "new-chapter";
  }
  if (mod && key === "n") return "new";
  if (mod && press.key === ",") return "settings";
  if (mod && press.key === ".") return "focus";
  /* ⌘B too, as in other Mac apps with a sidebar, except in the text (Bold). */
  if ((mod && press.key === "\\") || (mod && !alt && !press.shift && key === "b" && !at.inText))
    return at.structure ? "structure" : "navigation";
  /* A chord, not a bare `?`: the desktop menu takes a printable accelerator
     before the page sees it, so `?` typed into a note opened the sheet. */
  if (mod && press.key === "/") return "shortcuts";
  if (at.typing) return null;

  if (press.key === "Escape" && at.focusMode) return "focus";
  /* The bare keys below walk a note list, and a document has none. */
  if (at.document) return null;
  if (press.key === "n") return "new";
  if (press.key === "/") return "search-field";
  if (press.key === "ArrowDown" || press.key === "j") return alt ? "next-group" : "down";
  if (press.key === "ArrowUp" || press.key === "k") return alt ? "previous-group" : "up";
  if (press.key === "Enter" && at.noteSelected) return "open-title";
  return null;
}
