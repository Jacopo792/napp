import { useSyncExternalStore } from "react";
import { CHAT_BUBBLES, DEFAULT_REACTIONS, type ChatBubble } from "./chatBubbles.ts";

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
  /** The bubble your chat messages are sent in, seen by everyone. */
  chatBubble: ChatBubble;
  /** The emoji offered first when reacting to a message, in order. */
  quickReactions: string[];
  /** A soft sound when a chat message leaves and when one arrives. */
  chatSounds: boolean;
  /** Stickers and GIFs starred in the chat picker, newest first. */
  chatFavorites: ChatFavorite[];
}

/** A starred sticker or GIF: enough to draw it and send it again. A pack
 *  sticker is named by its row, so one from another archive is just absent. */
export type ChatFavorite =
  | { pack: "napp"; id: string }
  | {
      pack: "giphy";
      type: "gif" | "sticker";
      giphy: string;
      title: string;
      width: number;
      height: number;
    }
  | { pack: "own"; sticker: string };

export const FAVORITES_MAX = 60;

/** The same favourite, whatever else it carries. */
export const favoriteKey = (favorite: ChatFavorite): string =>
  favorite.pack === "napp"
    ? `napp:${favorite.id}`
    : favorite.pack === "giphy"
      ? `giphy:${favorite.giphy}`
      : `own:${favorite.sticker}`;

/** Starred now if it was not, unstarred if it was; newest first. */
export function toggleFavorite(list: ChatFavorite[], favorite: ChatFavorite): ChatFavorite[] {
  const key = favoriteKey(favorite);
  const rest = list.filter((one) => favoriteKey(one) !== key);
  return rest.length < list.length ? rest : [favorite, ...rest].slice(0, FAVORITES_MAX);
}

function favoritesFrom(value: unknown): ChatFavorite[] | null {
  if (!Array.isArray(value)) return null;
  return value
    .filter((item): item is ChatFavorite => {
      if (!item || typeof item !== "object") return false;
      const f = item as Record<string, unknown>;
      if (f.pack === "napp") return typeof f.id === "string";
      if (f.pack === "own") return typeof f.sticker === "string";
      return (
        f.pack === "giphy" &&
        (f.type === "gif" || f.type === "sticker") &&
        typeof f.giphy === "string" &&
        typeof f.title === "string" &&
        typeof f.width === "number" &&
        typeof f.height === "number"
      );
    })
    .slice(0, FAVORITES_MAX);
}

export const DEFAULT_WRITING_PREFERENCES: WritingPreferences = {
  presencePalette: "amber",
  focusScope: "paragraph",
  typewriter: false,
  writingStats: true,
  sheetTone: "paper",
  adaptInk: true,
  chatBubble: "ink",
  quickReactions: [...DEFAULT_REACTIONS],
  chatSounds: true,
  chatFavorites: [],
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
    chatBubble: one(
      CHAT_BUBBLES.map((bubble) => bubble.id),
      value?.chatBubble,
      fallback.chatBubble,
    ),
    quickReactions: reactionsFrom(value?.quickReactions) ?? fallback.quickReactions,
    chatSounds: flag(value?.chatSounds, fallback.chatSounds),
    chatFavorites: favoritesFrom(value?.chatFavorites) ?? fallback.chatFavorites,
  };
}

/** Exactly six short strings, none repeated, or nothing usable. */
function reactionsFrom(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length !== DEFAULT_REACTIONS.length) return null;
  const ok = value.every((one) => typeof one === "string" && one.length > 0 && one.length <= 16);
  return ok && new Set(value).size === value.length ? (value as string[]) : null;
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
