const MAX_AUTOCORRECTIONS_PER_WORD = 2;
const STORAGE_KEY = "napp:autocorrect-counts";

/* These are the contractions where adding the apostrophe does not change the
   meaning. Ambiguous words such as "its" deliberately stay out: an automatic
   correction should be easy to trust, not an eager grammarian. */
const APOSTROPHE_CORRECTIONS: Record<string, string> = {
  arent: "aren't",
  cant: "can't",
  couldnt: "couldn't",
  didnt: "didn't",
  doesnt: "doesn't",
  dont: "don't",
  hadnt: "hadn't",
  hasnt: "hasn't",
  havent: "haven't",
  isnt: "isn't",
  shouldnt: "shouldn't",
  wasnt: "wasn't",
  werent: "weren't",
  wont: "won't",
  wouldnt: "wouldn't",
  youre: "you're",
};

export function correctionFor(word: string, timesAlreadyCorrected: number): string | null {
  const replacement = APOSTROPHE_CORRECTIONS[word.toLocaleLowerCase("en")];
  if (!replacement || timesAlreadyCorrected >= MAX_AUTOCORRECTIONS_PER_WORD) return null;

  if (word === word.toUpperCase()) return replacement.toUpperCase();
  if (word[0] === word[0]?.toUpperCase())
    return `${replacement[0]?.toUpperCase()}${replacement.slice(1)}`;
  return replacement;
}

function readCounts(): Record<string, number> {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(stored).filter(
        ([, value]) => Number.isInteger(value) && (value as number) >= 0,
      ),
    ) as Record<string, number>;
  } catch {
    return {};
  }
}

function writeCounts(counts: Record<string, number>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(counts));
  } catch {
    /* The correction remains useful when the browser has no local storage. */
  }
}

/** Correct a word at most twice on this device. A third deliberate spelling is
 * left alone: the writer has demonstrated that this is their preferred form. */
export function takeAutocorrection(word: string): string | null {
  const key = word.toLocaleLowerCase("en");
  const counts = readCounts();
  const correction = correctionFor(word, counts[key] ?? 0);
  if (!correction) return null;
  counts[key] = (counts[key] ?? 0) + 1;
  writeCounts(counts);
  return correction;
}
