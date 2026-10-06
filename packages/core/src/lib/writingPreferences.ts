import { useSyncExternalStore } from "react";

export const PRESENCE_PALETTES = [
  { id: "amber", name: "Amber", color: "#e8a55b", wash: "#e8a55b26" },
  { id: "sky", name: "Sky", color: "#55b8f7", wash: "#55b8f726" },
  { id: "lilac", name: "Lilac", color: "#ab8cf4", wash: "#ab8cf426" },
  { id: "mint", name: "Mint", color: "#4fc49a", wash: "#4fc49a26" },
] as const;

export type PresencePalette = (typeof PRESENCE_PALETTES)[number]["id"];

/* The four below are a document's: they are offered only in an archive of
   that kind, and an archive of notes never reads them. They are the account's
   all the same, because how somebody likes to write travels with them. */
export const FOCUS_SCOPES = ["off", "paragraph", "sentence"] as const;
export type FocusScope = (typeof FOCUS_SCOPES)[number];
/** The sheet a document is written on: following the theme, as Word's dark
 *  mode does, or always one or the other. */
export const SHEET_TONES = ["theme", "paper", "dark"] as const;
export type SheetTone = (typeof SHEET_TONES)[number];

export interface WritingPreferences {
  presencePalette: PresencePalette;
  /** Focus mode in a document dims everything but this much of the text. */
  focusScope: FocusScope;
  /** The line being written stays in the middle of the window. */
  typewriter: boolean;
  /** Words today and this session, under the document's goal. */
  writingStats: boolean;
  sheetTone: SheetTone;
  /** On a dark sheet, the colours chosen for the text are turned to keep
   *  their hue and lose their darkness — Word's behaviour — or left alone. */
  adaptInk: boolean;
}

export const DEFAULT_WRITING_PREFERENCES: WritingPreferences = {
  presencePalette: "amber",
  focusScope: "paragraph",
  typewriter: false,
  writingStats: true,
  sheetTone: "theme",
  adaptInk: true,
};

/** Whatever was stored, read field by field: a field that is missing or
 *  malformed keeps `fallback`'s value, never the default, so a row written by
 *  an older client does not undo what this device chose. */
export function writingPreferencesFrom(
  value: Partial<WritingPreferences> | undefined,
  fallback: WritingPreferences,
): WritingPreferences {
  const one = <T>(list: readonly T[], candidate: unknown, otherwise: T): T =>
    list.includes(candidate as T) ? (candidate as T) : otherwise;
  const flag = (candidate: unknown, otherwise: boolean) =>
    typeof candidate === "boolean" ? candidate : otherwise;
  return {
    presencePalette: one(
      PRESENCE_PALETTES.map((palette) => palette.id),
      value?.presencePalette,
      fallback.presencePalette,
    ),
    focusScope: one(FOCUS_SCOPES, value?.focusScope, fallback.focusScope),
    typewriter: flag(value?.typewriter, fallback.typewriter),
    writingStats: flag(value?.writingStats, fallback.writingStats),
    sheetTone: one(SHEET_TONES, value?.sheetTone, fallback.sheetTone),
    adaptInk: flag(value?.adaptInk, fallback.adaptInk),
  };
}

const KEY = "napp:writing-preferences:v1";
const listeners = new Set<() => void>();
let current = read();

function read(): WritingPreferences {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_WRITING_PREFERENCES };
    return writingPreferencesFrom(
      JSON.parse(raw) as Partial<WritingPreferences>,
      DEFAULT_WRITING_PREFERENCES,
    );
  } catch {
    return { ...DEFAULT_WRITING_PREFERENCES };
  }
}

/* The chosen colour on the root, so everything that marks a person with it —
   the pill on the note, the mark on a face in the roster — reads it from one
   place instead of each being handed it. */
function applyWritingPreferences(next: WritingPreferences): void {
  const palette = presencePaletteFor(next.presencePalette);
  const root = document.documentElement.style;
  root.setProperty("--presence", palette.color);
  root.setProperty("--presence-soft", palette.wash);
}

export function initWritingPreferences(): void {
  applyWritingPreferences(current);
}

export function useWritingPreferences(): WritingPreferences {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function setWritingPreferences(next: WritingPreferences): void {
  current = next;
  applyWritingPreferences(next);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* Writing controls remain usable when browser storage is unavailable. */
  }
  listeners.forEach((listener) => listener());
}

export function currentWritingPreferences(): WritingPreferences {
  return current;
}

export function subscribeToWritingPreferences(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function presencePaletteFor(id: PresencePalette) {
  return PRESENCE_PALETTES.find((palette) => palette.id === id) ?? PRESENCE_PALETTES[0];
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return current;
}
