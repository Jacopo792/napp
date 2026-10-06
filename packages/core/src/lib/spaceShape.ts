/* The pure half of `spaces.ts`: what an archive's kind and a document's
 * options are, read out of a row. A file of its own because `spaces.ts`
 * reaches the Supabase client, which the preview swaps out — and a stand-in
 * cannot borrow these from the module it stands in for. */
import {
  CAPTION_SEPARATORS,
  REFERENCE_WORDS,
  type CaptionSeparator,
  type FootnoteNumbering,
  type ReferenceLanguage,
} from "./references.ts";

/** What an archive is for. A document is one piece of writing in chapters;
 *  `archives.kind` holds it, so it is the same for every member. It is the
 *  one option that changes the whole screen, which is why it is a column and
 *  every other option is a key. */
export type ArchiveKind = "notes" | "document";

/** How a document is written. Kept in `archives.settings.features`, written
 *  only through `merge_archive_settings`, never over the whole column.
 *  `manuscript` is what You / Partner means here: `own` is a manuscript each,
 *  `shared` is one manuscript and a drawer of notes each. */
export interface DocumentFeatures {
  manuscript: "own" | "shared";
  numbering: boolean;
  footnotes: boolean;
  citations: boolean;
  review: boolean;
  wordGoal?: number;
}

/** Where a new archive starts: notes, or a book with every tool on. A genre
 *  is a row here, never a kind — a thesis is a book with switches turned
 *  off in its settings. */
export const ARCHIVE_PRESETS = [
  {
    id: "notes",
    name: "Notes",
    kind: "notes",
    features: {
      manuscript: "shared",
      numbering: false,
      footnotes: false,
      citations: false,
      review: false,
    },
  },
  {
    id: "book",
    name: "Book",
    kind: "document",
    /* A book each, like the notes archive's You / Partner: in a book that
       was one manuscript for everybody the switch changed nothing above the
       fold, and two people read that as no difference between them. One
       shared manuscript is a switch in Settings → Document. */
    features: {
      manuscript: "own",
      numbering: true,
      footnotes: true,
      citations: true,
      review: true,
      wordGoal: 80_000,
    },
  },
] as const satisfies readonly {
  id: string;
  name: string;
  kind: ArchiveKind;
  features: DocumentFeatures;
}[];

export type ArchivePreset = (typeof ARCHIVE_PRESETS)[number]["id"];

export const DEFAULT_FEATURES: DocumentFeatures = { ...ARCHIVE_PRESETS[0].features };

/** What the row says, read rather than trusted: anything unknown is notes. */
export function archiveKind(value: unknown): ArchiveKind {
  return value === "document" ? "document" : "notes";
}

const SWITCHES = ["numbering", "footnotes", "citations", "review"] as const;

export function documentFeatures(settings: unknown): DocumentFeatures {
  const raw = (settings as { features?: Record<string, unknown> } | null)?.features ?? {};
  const features: DocumentFeatures = {
    ...DEFAULT_FEATURES,
    manuscript: raw.manuscript === "own" ? "own" : "shared",
  };
  for (const key of SWITCHES) if (typeof raw[key] === "boolean") features[key] = raw[key];
  const goal = Number(raw.wordGoal);
  if (Number.isInteger(goal) && goal > 0 && goal <= 10_000_000) features.wordGoal = goal;
  return features;
}

/* ── The page ───────────────────────────────────────────────────────────────
   How the document is set, the same for every member: it is the document's,
   not a reader's preference. Kept in `archives.settings.page`. */

/** The faces a document may be set in. Literata ships with the app; the rest
 *  are the system's, each with a fallback, so a page set on a Mac still reads
 *  as the same kind of letter on a machine without that face. */
export const WRITING_FONTS = [
  { id: "literata", name: "Literata", stack: '"Literata Variable", Literata, Georgia, serif' },
  { id: "georgia", name: "Georgia", stack: "Georgia, serif" },
  { id: "times", name: "Times New Roman", stack: '"Times New Roman", Times, serif' },
  {
    id: "palatino",
    name: "Palatino",
    stack: 'Palatino, "Palatino Linotype", "Book Antiqua", serif',
  },
  { id: "baskerville", name: "Baskerville", stack: 'Baskerville, "Baskerville Old Face", serif' },
  {
    id: "garamond",
    name: "Garamond",
    stack: 'Garamond, "EB Garamond", "Adobe Garamond Pro", serif',
  },
  { id: "helvetica", name: "Helvetica", stack: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
  { id: "arial", name: "Arial", stack: "Arial, Helvetica, sans-serif" },
  { id: "avenir", name: "Avenir", stack: 'Avenir, "Avenir Next", "Segoe UI", sans-serif' },
  { id: "courier", name: "Courier", stack: '"Courier New", Courier, monospace' },
] as const;

export type WritingFont = (typeof WRITING_FONTS)[number]["id"];

/** Millimetres, portrait. */
export const PAGE_SIZES = {
  a4: { name: "A4", width: 210, height: 297 },
  letter: { name: "Letter", width: 216, height: 279 },
  a5: { name: "A5", width: 148, height: 210 },
} as const;

/** Millimetres on every side, the three Word offers first. */
export const PAGE_MARGINS = {
  narrow: { name: "Narrow", mm: 12.7 },
  normal: { name: "Normal", mm: 25.4 },
  wide: { name: "Wide", mm: 38.1 },
} as const;

export const LINE_SPACINGS = [1, 1.15, 1.5, 2] as const;

export interface PageSetup {
  size: keyof typeof PAGE_SIZES;
  orientation: "portrait" | "landscape";
  margins: keyof typeof PAGE_MARGINS;
  font: WritingFont;
  /** Points. */
  fontSize: number;
  lineHeight: (typeof LINE_SPACINGS)[number];
  /** The first line of each paragraph set in, as a book sets it. */
  firstLineIndent: boolean;
  /** Word's References tab, cut to the four choices a thesis is set by:
   *  the language the labels are printed in, whether footnotes start again
   *  in each chapter, what stands between a caption's number and its words,
   *  and which side of a table its caption goes. */
  labels: ReferenceLanguage;
  footnoteNumbering: FootnoteNumbering;
  captionSeparator: CaptionSeparator;
  tableCaption: "above" | "below";
}

export const DEFAULT_PAGE: PageSetup = {
  size: "a4",
  orientation: "portrait",
  margins: "normal",
  font: "literata",
  fontSize: 12,
  lineHeight: 1.5,
  firstLineIndent: false,
  labels: "en",
  footnoteNumbering: "chapter",
  captionSeparator: "period",
  tableCaption: "above",
};

export function pageSetup(settings: unknown): PageSetup {
  const raw = (settings as { page?: Record<string, unknown> } | null)?.page ?? {};
  const page = { ...DEFAULT_PAGE };
  if (typeof raw.size === "string" && raw.size in PAGE_SIZES)
    page.size = raw.size as PageSetup["size"];
  if (raw.orientation === "landscape") page.orientation = "landscape";
  if (typeof raw.margins === "string" && raw.margins in PAGE_MARGINS)
    page.margins = raw.margins as PageSetup["margins"];
  if (WRITING_FONTS.some((font) => font.id === raw.font)) page.font = raw.font as WritingFont;
  const size = Number(raw.fontSize);
  if (Number.isInteger(size) && size >= 8 && size <= 24) page.fontSize = size;
  if (LINE_SPACINGS.includes(raw.lineHeight as PageSetup["lineHeight"]))
    page.lineHeight = raw.lineHeight as PageSetup["lineHeight"];
  if (typeof raw.firstLineIndent === "boolean") page.firstLineIndent = raw.firstLineIndent;
  if (raw.labels === "it") page.labels = "it";
  if (raw.footnoteNumbering === "document") page.footnoteNumbering = "document";
  if (typeof raw.captionSeparator === "string" && raw.captionSeparator in CAPTION_SEPARATORS)
    page.captionSeparator = raw.captionSeparator as CaptionSeparator;
  if (raw.tableCaption === "below") page.tableCaption = "below";
  return page;
}

export function fontStack(id: string | null | undefined): string | null {
  return WRITING_FONTS.find((font) => font.id === id)?.stack ?? null;
}

/** The page as CSS: sizes in millimetres and points, which the browser
 *  converts with the same 96 dpi Word assumes. */
export function pageStyle(page: PageSetup): Record<string, string> {
  const size = PAGE_SIZES[page.size];
  const width = page.orientation === "landscape" ? size.height : size.width;
  return {
    "--sheet-width": `${width}mm`,
    "--sheet-margin": `${PAGE_MARGINS[page.margins].mm}mm`,
    "--sheet-font": fontStack(page.font) ?? "",
    "--sheet-size": `${page.fontSize}pt`,
    "--sheet-leading": String(page.lineHeight),
    "--sheet-first-line": page.firstLineIndent ? "1.25cm" : "0",
    /* Strings for `content:`, so they carry their own quotes. */
    "--label-figure": `"${REFERENCE_WORDS[page.labels].figure} "`,
    "--label-table": `"${REFERENCE_WORDS[page.labels].table} "`,
    "--caption-separator": `"${CAPTION_SEPARATORS[page.captionSeparator]}"`,
  };
}
