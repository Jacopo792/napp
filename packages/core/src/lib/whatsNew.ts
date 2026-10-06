/* What changed, release by release, in the words of somebody using Napp
 * rather than somebody building it. The sheet that shows it opens by itself
 * once after an update, and is always one press away in the sidebar and ⌘K.
 *
 * A release is written here as it is made: a new entry at the top, its
 * version matching `apps/*\/package.json`. What has been read is a fact about
 * the person, so it travels with the account (`whatsNewSeen` in
 * `profile_preferences`) and installing the desktop app does not announce a
 * release already read in the browser.
 *
 * Pure, so `node --experimental-strip-types` can test it. */

export interface ReleaseItem {
  title: string;
  text: string;
}

export interface ReleaseSection {
  heading: string;
  items: ReleaseItem[];
}

export interface Release {
  version: string;
  /** ISO day. */
  date: string;
  /** One line that says what this release is about. */
  headline: string;
  sections: ReleaseSection[];
}

export const RELEASES: Release[] = [
  {
    version: "0.9.1",
    date: "2026-10-06",
    headline: "Notes or Book, archives you can delete, and a clearer book",
    sections: [
      {
        heading: "Archives",
        items: [
          {
            title: "Notes or Book",
            text: "New archive asks for a name and whether it is notes or a book. A book starts with every tool switched on.",
          },
          {
            title: "Change the type, both ways",
            text: "Archive info → Type turns notes into a book or back, and nothing is lost either way.",
          },
          {
            title: "Delete an archive",
            text: "Any archive but your first can be deleted, from Settings → Archives or by right-clicking the archive at the top of the sidebar.",
          },
        ],
      },
      {
        heading: "Books",
        items: [
          {
            title: "Straight to the writing",
            text: "A book opens on the chapter you last wrote in.",
          },
          {
            title: "Chapters, parts and notes",
            text: "Right-click a chapter → Group in a part to start a part there. Pages that are not chapters live under Notes.",
          },
          {
            title: "A real Trash",
            text: "Trash lists what you threw away, with Put back and Delete forever.",
          },
          {
            title: "Headings that take you there",
            text: "Pressing a heading under a chapter brings it to the top of the page.",
          },
        ],
      },
      {
        heading: "Fixes",
        items: [
          {
            title: "What's New stays read",
            text: "Once opened, New no longer comes back on the sidebar.",
          },
          {
            title: "Profile pictures",
            text: "A picture fills its circle without a grey edge.",
          },
        ],
      },
    ],
  },
  {
    version: "0.9.0",
    date: "2026-10-06",
    headline: "Write a book, with footnotes, captions and cross-references",
    sections: [
      {
        heading: "Documents",
        items: [
          {
            title: "A new kind of archive",
            text: "New archive now offers Notes or Book. A book is one piece of writing in chapters, and a notes archive works exactly as before.",
          },
          {
            title: "Chapters and parts",
            text: "Chapters take the place of the list: drag them into order, group them in parts from a chapter's right-click menu, and keep loose pages under Notes.",
          },
          {
            title: "A page you can print",
            text: "Each chapter is written on a sheet with the paper, margins, font and spacing of the document's page setup.",
          },
          {
            title: "A writing bar like Word's",
            text: "Styles, font and size, colour and highlight, alignment, spacing, indents, lists, page breaks, and find and replace.",
          },
          {
            title: "A word goal",
            text: "The document's goal sits at the top of the structure, with what you wrote today.",
          },
        ],
      },
      {
        heading: "References",
        items: [
          {
            title: "Footnotes",
            text: "Insert → Footnote, or ⌥⌘F. Write the note right beside its number; the chapter's notes are listed at the foot of its sheet.",
          },
          {
            title: "Numbered captions",
            text: "Insert → Figure caption or Table caption. Numbers like Figure 2.1 update by themselves as you add and move things.",
          },
          {
            title: "Cross-references",
            text: "Insert → Cross-reference… points at a section, figure, table or footnote in any chapter. It always shows the current number, and a click takes you there.",
          },
          {
            title: "Your house style",
            text: "Settings → Document → References: label language, footnotes per chapter or continuous, the separator after a caption's number, and captions above or below tables.",
          },
        ],
      },
      {
        heading: "Finding your way",
        items: [
          {
            title: "Numbered headings and contents",
            text: "Headings can be numbered 2.1, 2.1.1. A chapter's headings are listed under it in the sidebar, and a contents block can go anywhere in the text.",
          },
          {
            title: "Spotlight on ⌘K",
            text: "Finds headings, lines of text, footnotes, people, named versions, settings and other archives. Enter takes you straight to the place.",
          },
          {
            title: "One inspector",
            text: "⌥⌘I opens headings, comments and versions together, beside the page.",
          },
          {
            title: "Focus and typewriter",
            text: "Dim everything but the paragraph or sentence you are writing, and keep the line in the middle of the window.",
          },
        ],
      },
      {
        heading: "Also",
        items: [
          {
            title: "Print and Save as PDF",
            text: "Two separate items in the ⋯ menu, and neither prints a blank page any more.",
          },
          {
            title: "What's New",
            text: "This panel. It opens once after each update and is always in the sidebar.",
          },
        ],
      },
    ],
  },
  {
    version: "0.8.0",
    date: "2026-10-05",
    headline: "A note's history, sheets, and more than one archive",
    sections: [
      {
        heading: "History",
        items: [
          {
            title: "Every version of a note",
            text: "See what a note used to say, who wrote what, and the words added and removed — then restore any version.",
          },
          {
            title: "Named versions",
            text: "Give a moment a name so you can find it again.",
          },
        ],
      },
      {
        heading: "Sheets",
        items: [
          {
            title: "Hold to see more",
            text: "Hold a note, a folder or a face to open its sheet: owner, folder, words, versions, remarks and links, each one a door.",
          },
        ],
      },
      {
        heading: "Archives",
        items: [
          {
            title: "More than one archive",
            text: "Settings → Archives lists every archive you belong to and makes new ones. Turn on the switch to change archive from the top of the sidebar.",
          },
          {
            title: "Each archive keeps its own place",
            text: "Sorting, recents and folded groups are remembered per archive.",
          },
        ],
      },
    ],
  },
  {
    version: "0.7.0",
    date: "2026-10-04",
    headline: "A new sign-in page, quieter toolbars, and where the other member is",
    sections: [
      {
        heading: "Changes",
        items: [
          {
            title: "A new sign-in page",
            text: "A cleaner door, with the form on its own.",
          },
          {
            title: "Quieter toolbars",
            text: "Icons stay ink until you point at them, and larger glyphs read better.",
          },
          {
            title: "Where the other member is",
            text: "A small dot on a note's row shows that somebody else has it open.",
          },
        ],
      },
    ],
  },
  {
    version: "0.6.0",
    date: "2026-10-03",
    headline: "Smoother motion, a Style section, and simpler note rows",
    sections: [
      {
        heading: "Changes",
        items: [
          {
            title: "Smoother motion",
            text: "The sidebar slides and notes cross-fade without the page being laid out again on every frame.",
          },
          {
            title: "Style",
            text: "Settings → Style: icon styles, folder and highlight colours, and translucency.",
          },
          {
            title: "Simpler note rows",
            text: "Title, then date and preview; a photo or drawing appears as a thumbnail.",
          },
        ],
      },
    ],
  },
  {
    version: "0.5.0",
    date: "2026-10-03",
    headline: "A Mac application rather than a page in a window",
    sections: [
      {
        heading: "Changes",
        items: [
          {
            title: "Settings in the shape of System Settings",
            text: "Coloured tiles in the rail and plain rows on the right.",
          },
          {
            title: "Faces on a shelf",
            text: "The people in the archive sit at the top of the sidebar.",
          },
          {
            title: "New palettes",
            text: "Graphite by default, with livelier accents and a neutral selection.",
          },
        ],
      },
    ],
  },
];

export const CURRENT_RELEASE = RELEASES[0].version;

function parts(version: string): number[] {
  return version.split(".").map((part) => Number.parseInt(part, 10) || 0);
}

/** Negative when `a` is older than `b`. An empty version is older than any. */
/* This device's copy of what has been read, so a remount or a closed window
   that beats the account's debounced write does not bring "New" back. The
   account row is still the authority; the two merge to the later. */
const SEEN_KEY = "napp:whats-new-seen";

export function localWhatsNewSeen(): string {
  try {
    return localStorage.getItem(SEEN_KEY) ?? "";
  } catch {
    return "";
  }
}

export function rememberWhatsNewSeen(version: string): void {
  try {
    localStorage.setItem(SEEN_KEY, version);
  } catch {
    /* Private window: the account row still carries it. */
  }
}

export function compareVersions(a: string, b: string): number {
  if (!a || !b) return a ? 1 : b ? -1 : 0;
  const left = parts(a);
  const right = parts(b);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference) return difference;
  }
  return 0;
}

/** The further of two readings, as remarks are merged: a device that has
 *  read nothing must not un-read what another read. */
export function laterVersion(a: string, b: string): string {
  return compareVersions(a, b) >= 0 ? a : b;
}

/** The releases not read yet, newest first. */
export function unseenReleases(seen: string): Release[] {
  return RELEASES.filter((release) => compareVersions(release.version, seen) > 0);
}

/** "6 October 2026", in the reader's own order for a date. */
export function releaseDate(date: string): string {
  const day = new Date(`${date}T12:00:00`);
  return Number.isNaN(day.getTime())
    ? date
    : day.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}
