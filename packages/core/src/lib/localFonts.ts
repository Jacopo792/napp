/* Every typeface this machine has, the way Pages lists them.
 *
 * Chromium answers `queryLocalFonts()` — both shells, since the desktop
 * window is Chromium and Electron grants `local-fonts` — but only from inside
 * a click, so this is asked when the font list is opened and never before.
 * Safari has no such call; there a list of the families macOS and Windows
 * ship is measured against a fallback face, and the ones that change the
 * width of a line are the ones installed.
 *
 * Asked once a session: a font installed while the app is open turns up on
 * the next launch, as it does in Pages. */

const SHIPPED = [
  "American Typewriter",
  "Andale Mono",
  "Arial",
  "Arial Black",
  "Arial Narrow",
  "Arial Rounded MT Bold",
  "Avenir",
  "Avenir Next",
  "Avenir Next Condensed",
  "Baskerville",
  "Big Caslon",
  "Bodoni 72",
  "Bradley Hand",
  "Brush Script MT",
  "Calibri",
  "Cambria",
  "Candara",
  "Chalkboard",
  "Chalkboard SE",
  "Chalkduster",
  "Charter",
  "Cochin",
  "Comic Sans MS",
  "Consolas",
  "Constantia",
  "Copperplate",
  "Corbel",
  "Courier",
  "Courier New",
  "Didot",
  "DIN Alternate",
  "DIN Condensed",
  "Franklin Gothic Medium",
  "Futura",
  "Garamond",
  "Geneva",
  "Georgia",
  "Gill Sans",
  "Helvetica",
  "Helvetica Neue",
  "Herculanum",
  "Hoefler Text",
  "Impact",
  "Iowan Old Style",
  "Lucida Console",
  "Lucida Grande",
  "Luminari",
  "Marker Felt",
  "Menlo",
  "Microsoft Sans Serif",
  "Monaco",
  "New York",
  "Noteworthy",
  "Optima",
  "Palatino",
  "Palatino Linotype",
  "Papyrus",
  "Party LET",
  "Phosphate",
  "Rockwell",
  "Savoye LET",
  "Segoe Print",
  "Segoe Script",
  "Segoe UI",
  "SignPainter",
  "Skia",
  "Snell Roundhand",
  "Superclarendon",
  "Tahoma",
  "Times",
  "Times New Roman",
  "Trattatello",
  "Trebuchet MS",
  "Verdana",
  "Zapfino",
];

interface LocalFont {
  family: string;
}

let asked: Promise<string[]> | null = null;

export function localFontFamilies(): Promise<string[]> {
  asked ??= fromSystem().then((families) => (families.length > 0 ? families : measured()));
  return asked;
}

async function fromSystem(): Promise<string[]> {
  const host = window as { queryLocalFonts?: () => Promise<LocalFont[]> };
  if (!host.queryLocalFonts) return [];
  try {
    /* Called on the window, not detached from it: unbound it throws. */
    const fonts = await host.queryLocalFonts();
    /* The system's own UI faces start with a dot and are not for documents. */
    const families = new Set(
      fonts.map((font) => font.family).filter((name) => !name.startsWith(".")),
    );
    return [...families].sort((a, b) => a.localeCompare(b));
  } catch {
    /* Refused, or not from a click: the measured list is still a list. */
    asked = null;
    return [];
  }
}

function measured(): string[] {
  const context = document.createElement("canvas").getContext("2d");
  if (!context) return SHIPPED;
  const sample = "mmmmmmmmmmlliWW@#0";
  const width = (font: string) => {
    context.font = `32px ${font}`;
    return context.measureText(sample).width;
  };
  const bases = ["monospace", "serif"].map((base) => [base, width(base)] as const);
  return SHIPPED.filter((family) =>
    bases.some(([base, wide]) => width(`"${family}", ${base}`) !== wide),
  );
}

/** A family as the editor stores it: one quoted name, so a name with a
 *  space in it is one name. */
export const familyStack = (family: string) => `"${family.replace(/["\\]/g, "")}"`;

/** The name a stored stack is shown by: its first family, unquoted. */
export const familyName = (stack: string) => stack.split(",")[0].replaceAll('"', "").trim();
