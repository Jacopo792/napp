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

const LATEST = "https://github.com/Jacopo792/napp/releases/latest";

/** Where the newest installers are. The names carry no version (see
 *  `electron-builder.yml`), so these never go stale. */
export const DOWNLOADS = {
  page: LATEST,
  mac: `${LATEST}/download/Napp-mac-arm64.dmg`,
  macIntel: `${LATEST}/download/Napp-mac-x64.dmg`,
  windows: `${LATEST}/download/Napp-windows-setup.exe`,
};

export const RELEASES: Release[] = [
  {
    version: "0.9.14",
    date: "2026-10-09",
    headline: "Pasting from Pages, Word and TextEdit keeps its look",
    sections: [
      {
        heading: "Writing",
        items: [
          {
            title: "Centred lines and italics survive a paste",
            text: "Text copied from Pages, Word or TextEdit now arrives with its centring, italics and bold, and the empty lines used for spacing are tidied away.",
          },
          {
            title: "Copying from a PDF",
            text: "A PDF opened in Preview hands over plain words only, with no italics or centring. For a document that keeps its look, copy from the original file instead.",
          },
        ],
      },
    ],
  },
  {
    version: "0.9.13",
    date: "2026-10-09",
    headline: "Text pasted from a PDF keeps its paragraphs",
    sections: [
      {
        heading: "Writing",
        items: [
          {
            title: "Paste from a PDF",
            text: "Text copied out of a PDF used to land one line per paragraph. Lines are now joined back into their paragraphs, headings stay on their own, and a page turn no longer glues two lines together.",
          },
          {
            title: "One letter in a book",
            text: "Pasting into a book keeps bold, italics and colour but takes the book's own typeface and size.",
          },
        ],
      },
    ],
  },
  {
    version: "0.9.12",
    date: "2026-10-08",
    headline: "Switch between your accounts",
    sections: [
      {
        heading: "Accounts",
        items: [
          {
            title: "Switch account",
            text: "The button at the foot of the sidebar now lists the other accounts you have signed in on this device. Pick one and you are in, with no password.",
          },
          {
            title: "Add an account",
            text: "Add account keeps you signed in for later and opens the sign-in page. Lock & sign out is in the same menu.",
          },
        ],
      },
    ],
  },
  {
    version: "0.9.11",
    date: "2026-10-07",
    headline: "Notes open faster in the browser",
    sections: [
      {
        heading: "Speed",
        items: [
          {
            title: "Going back to a note is quick",
            text: "The notes you opened last stay ready, so returning to one shows its words straight away instead of waiting for the server.",
          },
          {
            title: "A note starts opening when you point at it",
            text: "Resting the pointer on a note in the list gets it ready before you click. Safari gains the most.",
          },
        ],
      },
    ],
  },
  {
    version: "0.9.10",
    date: "2026-10-07",
    headline: "The window's shape, back as it was",
    sections: [
      {
        heading: "Window",
        items: [
          {
            title: "Flush columns again",
            text: "The sidebar and the list are columns again rather than floating panels, under one band with a line beneath it.",
          },
          {
            title: "Writing tools over the words",
            text: "The writing tools stay centred over the words of the note, even when the scrollbar is showing.",
          },
        ],
      },
    ],
  },
  {
    version: "0.9.9",
    date: "2026-10-07",
    headline: "Panels with a shape, and Settings that always opens",
    sections: [
      {
        heading: "Window",
        items: [
          {
            title: "The sidebar and the list float",
            text: "Both are rounded panels standing off the window, and the note is the darker page beside them.",
          },
          {
            title: "Toolbar buttons on one line",
            text: "Every group of buttons sits on the same line, and the writing tools are centred over the words of the note.",
          },
        ],
      },
      {
        heading: "Fixes",
        items: [
          {
            title: "Settings after an update",
            text: "A tab left open across an update could fail to open Settings. It now reloads itself and opens.",
          },
        ],
      },
    ],
  },
  {
    version: "0.9.8",
    date: "2026-10-07",
    headline: "Pictures you can edit, and folders in your order",
    sections: [
      {
        heading: "Pictures",
        items: [
          {
            title: "Edit a note's photo",
            text: "Click the photo on the page or in Note info to view it, crop it again, change it or remove it. Edit photo is in the note's right-click menu too.",
          },
          {
            title: "Edit the cover",
            text: "A picture cover has Edit: drag it into place, then Done. Remove takes it off.",
          },
          {
            title: "Hold to see it whole",
            text: "Hold a photo, a cover or a picture in a note and it opens full screen.",
          },
          {
            title: "No more file names under pictures",
            text: "A pasted picture or video no longer shows a string of letters and numbers beneath it.",
          },
        ],
      },
      {
        heading: "Sidebar",
        items: [
          {
            title: "Hide only the folders",
            text: "The sidebar button and ⌘\\ hide the folders and leave your notes where they are. Focus mode still hides both.",
          },
          {
            title: "Drag folders into order",
            text: "Drag a folder above or below another to put it where you want it.",
          },
        ],
      },
    ],
  },
  {
    version: "0.9.7",
    date: "2026-10-06",
    headline: "Delete what you made, and clear Notes in one go",
    sections: [
      {
        heading: "Archives",
        items: [
          {
            title: "Delete for everyone",
            text: "Whoever made an archive can delete it even while others are in it, and it goes for everybody. Leave is for the others: it no longer leaves your archive behind for them.",
          },
        ],
      },
      {
        heading: "Books",
        items: [
          {
            title: "Clear Notes",
            text: "Right-click Notes in the sidebar to move every note under it to the Trash.",
          },
        ],
      },
    ],
  },
  {
    version: "0.9.6",
    date: "2026-10-06",
    headline: "Continue as note, and a book each",
    sections: [
      {
        heading: "Books",
        items: [
          {
            title: "Continue as note",
            text: "Choose words in a chapter and press Continue as note, in the bubble or the right-click menu. A note opens under Notes with those words quoted at the top; press the quotation to go back to them, lit for a moment.",
          },
          {
            title: "Comments are comments again",
            text: "Comments keep their own name and live in the side panel, as in a notes archive. Notes in the sidebar are the book's own pages.",
          },
          {
            title: "A book each",
            text: "A new book gives each of you your own chapters, so You and Partner show two different books. One shared manuscript is a switch in Settings → Document.",
          },
          {
            title: "Steadier side panel",
            text: "Switching between Headings, Comments and Versions no longer flashes Loading.",
          },
        ],
      },
    ],
  },
  {
    version: "0.9.5",
    date: "2026-10-06",
    headline: "The writing bar works again, and notes you can find",
    sections: [
      {
        heading: "Fixes",
        items: [
          {
            title: "Every menu in the writing bar opens",
            text: "Colour, highlight, alignment, more effects and Insert opened invisibly since 0.9.3, so the bar seemed to do nothing. They open again.",
          },
          {
            title: "A note in progress waits for you",
            text: "Looking at Headings or Versions while writing a note no longer throws it away; come back to Notes and it is still there, on the same words. Closing the panel cancels it.",
          },
        ],
      },
      {
        heading: "Books",
        items: [
          {
            title: "Notes, by name",
            text: "In a book, comments are called notes everywhere: the button on selected words, the panel, and Add note.",
          },
          {
            title: "Always in the sidebar",
            text: "Notes is always listed under the chapters, and a note you add appears there at once.",
          },
        ],
      },
    ],
  },
  {
    version: "0.9.4",
    date: "2026-10-06",
    headline: "Up-to-date guides and download links",
    sections: [
      {
        heading: "Getting the app",
        items: [
          {
            title: "Direct downloads",
            text: "The project page links straight to the newest Mac (Apple silicon and Intel) and Windows installers, the same ones as the buttons below.",
          },
          {
            title: "Guides brought up to date",
            text: "The guides now describe books, eight seats per archive, and how new archives are shared.",
          },
        ],
      },
    ],
  },
  {
    version: "0.9.3",
    date: "2026-10-06",
    headline: "A chapter bar on one line",
    sections: [
      {
        heading: "Books",
        items: [
          {
            title: "One row of tools",
            text: "The chapter bar no longer wraps onto a second line. In a narrow window the tools used least step aside first — the text's own font, indents, undo and redo — and Insert always stays.",
          },
          {
            title: "Nothing but tools up there",
            text: "The “Edited” time is gone from the bar.",
          },
          {
            title: "New chapter at the top",
            text: "The + beside Chapters makes a new one.",
          },
        ],
      },
    ],
  },
  {
    version: "0.9.2",
    date: "2026-10-06",
    headline: "Notes on the words, a quieter book, and eight seats",
    sections: [
      {
        heading: "Books",
        items: [
          {
            title: "A note on a passage",
            text: "Select some words, right-click, Add note. Every open note is listed under Notes in the sidebar; pressing one takes you back to the words and lights them for a moment.",
          },
          {
            title: "Research is gone",
            text: "Notes now live on the words they are about. Pages made before are still there, under Pages, and open as plain notes rather than as a page of the book.",
          },
          {
            title: "Comments and versions in reach",
            text: "Find, Comments and Versions have their own buttons at the right of the chapter bar, beside when it was last edited.",
          },
          {
            title: "A tidier sidebar",
            text: "The word count sits at the foot, New chapter is a row at the end of the chapters, and You / Partner only appears when somebody else is in the archive.",
          },
        ],
      },
      {
        heading: "Archives",
        items: [
          {
            title: "Eight seats",
            text: "An archive holds up to eight people.",
          },
          {
            title: "New archives are shared already",
            text: "Whoever already shares an archive with you is in a new one from the start, without another invitation.",
          },
          {
            title: "The archive switch stays on",
            text: "Turning it on and then changing archive no longer turns it off again.",
          },
        ],
      },
      {
        heading: "Everywhere",
        items: [
          {
            title: "Search from inside the text",
            text: "⌘K (Ctrl+K on Windows) opens search even while writing. With words selected it still makes a link.",
          },
          {
            title: "Download from here",
            text: "What's New has buttons for the Mac and Windows apps, and the desktop app says in the sidebar when a newer version is out — in a book too.",
          },
        ],
      },
    ],
  },
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
