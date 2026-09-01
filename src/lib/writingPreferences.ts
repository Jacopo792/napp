import { useSyncExternalStore } from "react";

export const PRESENCE_PALETTES = [
  { id: "amber", name: "Amber", color: "#e8a55b", wash: "#e8a55b26" },
  { id: "sky", name: "Sky", color: "#55b8f7", wash: "#55b8f726" },
  { id: "lilac", name: "Lilac", color: "#ab8cf4", wash: "#ab8cf426" },
  { id: "mint", name: "Mint", color: "#4fc49a", wash: "#4fc49a26" },
] as const;

export type PresencePalette = (typeof PRESENCE_PALETTES)[number]["id"];
export type SwipeAction = "archive" | "trash" | "off";

export interface WritingPreferences {
  presencePalette: PresencePalette;
  swipeLeftAction: SwipeAction;
}

export const DEFAULT_WRITING_PREFERENCES: WritingPreferences = {
  presencePalette: "amber",
  swipeLeftAction: "archive",
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
      swipeLeftAction:
        value.swipeLeftAction === "archive" ||
        value.swipeLeftAction === "trash" ||
        value.swipeLeftAction === "off"
          ? value.swipeLeftAction
          : DEFAULT_WRITING_PREFERENCES.swipeLeftAction,
    };
  } catch {
    return { ...DEFAULT_WRITING_PREFERENCES };
  }
}

export function useWritingPreferences(): WritingPreferences {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function setWritingPreferences(next: WritingPreferences): void {
  current = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* Writing controls remain usable when browser storage is unavailable. */
  }
  listeners.forEach((listener) => listener());
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
