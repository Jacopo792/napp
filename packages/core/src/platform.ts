/* What a shell has to answer, and the whole of it.
 *
 * Six members, and every one of them has two real implementations from the day
 * it was written. An interface with one implementation is a guess about the
 * future; these are the six places where a window in a browser and a window on
 * a desktop genuinely cannot do the same thing.
 *
 * And one that is optional, which is a different thing again. `popUpMenu` is
 * not a member with two implementations, it is a member the browser genuinely
 * does not have: a menu the *system* draws, over the window, in the system's
 * own material. A `<div>` reaches only what is behind it in the page, so there
 * is no browser answer to write — and a member that is absent says exactly
 * that, where a member returning a sentinel would have made the caller carry
 * a third case around.
 *
 * What is deliberately NOT here: `import.meta.env`, localStorage, IndexedDB,
 * the clipboard, the pdf.js worker. Both shells are Vite over Chromium, so
 * those resolve identically — what differs is the values in the `.env` files,
 * and a file is already the mechanism for that. Adding a member for something
 * both sides implement the same way is how an interface stops describing a
 * boundary and starts describing a habit. */

/** Whether a folder of files was written, or the one file that stands in for
 *  it where no folder can be. */
export type SavedAs = "file" | "folder";

export interface Platform {
  /** For the rare case where the difference has to be said out loud, rather
   *  than done differently. Prefer a member over a branch on this. */
  readonly kind: "web" | "desktop";

  /** Where an invitation or a confirmation email has to land. Always the
   *  published web origin, on both shells: a link opened on somebody else's
   *  machine has no desktop app behind it. */
  webOrigin(): string;

  /** The invitation this launch was opened with, if any. */
  inviteToken(): string | undefined;

  /** Hand the reader one file to keep. */
  saveFile(name: string, data: Blob | string, type?: string): Promise<void>;

  /** Hand the reader a folder of files to keep. A browser without a directory
   *  picker writes `fallbackName` instead and answers "file". */
  saveFolder(files: { name: string; text: string }[], fallbackName: string): Promise<SavedAs>;

  /** Show the reader a file they are not saving.
   *
   *  It takes a loader rather than a blob because a browser must claim the new
   *  tab synchronously, inside the click, or the pop-up blocker takes it — so
   *  the shell decides when the bytes are fetched relative to that. Resolves
   *  to null when the file is on screen, or to a line explaining why not. */
  openFile(name: string, load: () => Promise<Blob>): Promise<string | null>;

  print(): Promise<void>;

  /** Hand a menu to the window manager, at the pointer, and answer with the
   *  `id` chosen — or null if the reader dismissed it.
   *
   *  Absent in a tab, which is the capability test: `platform().popUpMenu`
   *  falsy means this shell draws its own. No coordinates, because a context
   *  menu opens where the pointer already is and the system knows that better
   *  than we can convert it. */
  popUpMenu?(items: SystemMenuItem[]): Promise<string | null>;
}

/** A menu as the system can draw one: labels, separators, ticks and one level
 *  of submenu, which is the whole of what any menu in this app is. Nothing
 *  here is a React node — this crosses a process boundary, so it is data and
 *  the icons stay behind. */
export type SystemMenuItem =
  | { type: "separator" }
  | {
      type: "item";
      /** What comes back when it is chosen. A disabled item needs none. */
      id?: string;
      label: string;
      enabled?: boolean;
      checked?: boolean;
      submenu?: SystemMenuItem[];
    };

let current: Platform | null = null;

export function setPlatform(shell: Platform): void {
  current = shell;
}

export function platform(): Platform {
  if (!current) throw new Error("setPlatform() has to run before the app mounts");
  return current;
}
