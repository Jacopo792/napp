import { useSyncExternalStore } from "react";

export const PRESENCE_PALETTES = [
  { id: "amber", name: "Amber", color: "#e8a55b", wash: "#e8a55b26" },
  { id: "sky", name: "Sky", color: "#55b8f7", wash: "#55b8f726" },
  { id: "lilac", name: "Lilac", color: "#ab8cf4", wash: "#ab8cf426" },
  { id: "mint", name: "Mint", color: "#4fc49a", wash: "#4fc49a26" },
] as const;

export type PresencePalette = (typeof PRESENCE_PALETTES)[number]["id"];

export interface WritingPreferences {
  presencePalette: PresencePalette;
}

export const DEFAULT_WRITING_PREFERENCES: WritingPreferences = {
  presencePalette: "amber",
};

const KEY = "napp:writing-preferences:v1";
const listeners = new Set<() => void>();
let current = read();

function read(): WritingPreferences {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_WRITING_PREFERENCES };
    const value = JSON.parse(raw) as Partial<WritingPreferences>;
    return {
      presencePalette: PRESENCE_PALETTES.some((palette) => palette.id === value.presencePalette)
        ? value.presencePalette!
        : DEFAULT_WRITING_PREFERENCES.presencePalette,
    };
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
