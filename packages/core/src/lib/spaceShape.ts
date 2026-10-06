/* The pure half of `spaces.ts`: what an archive's kind and a document's
 * options are, read out of a row. A file of its own because `spaces.ts`
 * reaches the Supabase client, which the preview swaps out — and a stand-in
 * cannot borrow these from the module it stands in for. */

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

/** Where a new archive starts. Not a kind: a thesis and a book are the same
 *  structure with different switches on, and a third genre is a third row
 *  here, never a migration. */
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
    id: "thesis",
    name: "Thesis",
    kind: "document",
    features: {
      manuscript: "shared",
      numbering: true,
      footnotes: true,
      citations: true,
      review: true,
      wordGoal: 40_000,
    },
  },
  {
    id: "book",
    name: "Book",
    kind: "document",
    features: {
      manuscript: "shared",
      numbering: false,
      footnotes: true,
      citations: false,
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
