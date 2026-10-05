import type { NoteEntry } from "./entries";

/* The two ways the collection can be drawn. Which one you get is decided by the
   window, not by a preference: a list of one-line rows is unreadable on a phone
   and a grid of cards wastes a desktop column that is 300px wide and 900 tall.
   Neither is a taste to be set, so neither is stored here any more. */
export type ListView = "list" | "gallery";
export type SortCriterion = "updated" | "created" | "title";
export type SortDirection = "asc" | "desc";

export interface ListPreferences {
  sortBy: SortCriterion;
  direction: SortDirection;
  groupByDate: boolean;
}

export interface ListPreferencesV1 {
  v: 1;
  /** The member whose scope these preferences belong to. */
  owner: string;
  defaults: ListPreferences;
  folders: Record<string, Partial<ListPreferences>>;
  recentNoteIds: string[];
}

export interface NoteGroup {
  id: string;
  label: string;
  entries: NoteEntry[];
}

export const DEFAULT_LIST_PREFERENCES: ListPreferences = {
  sortBy: "updated",
  direction: "desc",
  groupByDate: true,
};

const STORAGE_PREFIX = "napp:list-preferences:v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readPreferences(value: unknown): Partial<ListPreferences> {
  if (!isRecord(value)) return {};
  const next: Partial<ListPreferences> = {};
  if (value.sortBy === "updated" || value.sortBy === "created" || value.sortBy === "title") {
    next.sortBy = value.sortBy;
  }
  if (value.direction === "asc" || value.direction === "desc") next.direction = value.direction;
  if (typeof value.groupByDate === "boolean") next.groupByDate = value.groupByDate;
  return next;
}

export function createListPreferences(owner: string): ListPreferencesV1 {
  return {
    v: 1,
    owner,
    defaults: { ...DEFAULT_LIST_PREFERENCES },
    folders: {},
    recentNoteIds: [],
  };
}

export function parseListPreferences(raw: string | null, owner: string): ListPreferencesV1 {
  if (!raw) return createListPreferences(owner);
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || value.v !== 1 || value.owner !== owner) {
      return createListPreferences(owner);
    }

    const folders: Record<string, Partial<ListPreferences>> = {};
    if (isRecord(value.folders)) {
      for (const [id, preference] of Object.entries(value.folders)) {
        const valid = readPreferences(preference);
        if (Object.keys(valid).length > 0) folders[id] = valid;
      }
    }

    const recentNoteIds = Array.isArray(value.recentNoteIds)
      ? value.recentNoteIds.filter((id): id is string => typeof id === "string").slice(0, 8)
      : [];

    return {
      v: 1,
      owner,
      defaults: { ...DEFAULT_LIST_PREFERENCES, ...readPreferences(value.defaults) },
      folders,
      recentNoteIds: [...new Set(recentNoteIds)].slice(0, 8),
    };
  } catch {
    return createListPreferences(owner);
  }
}

/* Keyed by archive as well as by member. Sorting, recents and each folder's
   own order are facts about one archive: a thesis archive opened on the same
   account must not arrive sorted by title because the main one is, nor carry
   its recents. The member stays in the key because You / Partner are two
   scopes inside one archive. */
const storageKey = (archiveId: string, owner: string) => `${STORAGE_PREFIX}:${archiveId}:${owner}`;

/**
 * Reads `key`, taking over `legacyKey` the first time — the value written
 * before the key carried the archive. It moves rather than copies, so it is
 * adopted by the first archive opened after the change, which on an account
 * with one archive is the only one there is.
 */
export function readAdopting(key: string, legacyKey: string): string | null {
  const current = localStorage.getItem(key);
  if (current !== null) return current;
  const legacy = localStorage.getItem(legacyKey);
  if (legacy === null) return null;
  localStorage.setItem(key, legacy);
  localStorage.removeItem(legacyKey);
  return legacy;
}

export function loadListPreferences(archiveId: string, owner: string): ListPreferencesV1 {
  try {
    return parseListPreferences(
      readAdopting(storageKey(archiveId, owner), `${STORAGE_PREFIX}:${owner}`),
      owner,
    );
  } catch {
    return createListPreferences(owner);
  }
}

export function saveListPreferences(archiveId: string, preferences: ListPreferencesV1): void {
  try {
    localStorage.setItem(storageKey(archiveId, preferences.owner), JSON.stringify(preferences));
  } catch {
    // Preferences are optional; the archive remains fully usable.
  }
}

export function preferencesForFolder(stored: ListPreferencesV1, folderId: string): ListPreferences {
  return { ...stored.defaults, ...(stored.folders[folderId] ?? {}) };
}

export function rememberRecent(preferences: ListPreferencesV1, noteId: string): ListPreferencesV1 {
  return {
    ...preferences,
    recentNoteIds: [noteId, ...preferences.recentNoteIds.filter((id) => id !== noteId)].slice(0, 8),
  };
}

function compareEntries(a: NoteEntry, b: NoteEntry, preferences: ListPreferences): number {
  let result = 0;
  if (preferences.sortBy === "title") {
    result = (a.note.title || "Untitled").localeCompare(b.note.title || "Untitled", "it", {
      sensitivity: "base",
      numeric: true,
    });
  } else {
    const key = preferences.sortBy === "created" ? "createdAt" : "updatedAt";
    result = a.note[key].localeCompare(b.note[key]);
  }
  return preferences.direction === "asc" ? result : -result;
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function dateBucket(iso: string, now = new Date()): { id: string; label: string } {
  const date = new Date(iso);
  const age = Math.floor((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (age <= 0) return { id: "today", label: "Today" };
  if (age === 1) return { id: "yesterday", label: "Yesterday" };
  if (age <= 7) return { id: "previous-7", label: "Previous 7 Days" };
  if (age <= 30) return { id: "previous-30", label: "Previous 30 Days" };
  if (date.getFullYear() === now.getFullYear()) {
    return {
      id: `month-${date.getMonth()}`,
      label: new Intl.DateTimeFormat("en", { month: "long" }).format(date),
    };
  }
  return { id: `year-${date.getFullYear()}`, label: String(date.getFullYear()) };
}

export function groupEntries(
  entries: NoteEntry[],
  pinnedIds: Set<string>,
  preferences: ListPreferences,
  now = new Date(),
): NoteGroup[] {
  const pinned = entries
    .filter((entry) => pinnedIds.has(entry.note.id))
    .sort((a, b) => compareEntries(a, b, preferences));
  const remaining = entries
    .filter((entry) => !pinnedIds.has(entry.note.id))
    .sort((a, b) => compareEntries(a, b, preferences));
  const groups: NoteGroup[] = pinned.length
    ? [{ id: "pinned", label: "Pinned", entries: pinned }]
    : [];

  if (!preferences.groupByDate) {
    if (remaining.length) groups.push({ id: "notes", label: "Notes", entries: remaining });
    return groups;
  }

  for (const entry of remaining) {
    const stamp = preferences.sortBy === "created" ? entry.note.createdAt : entry.note.updatedAt;
    const bucket = dateBucket(stamp, now);
    const group = groups.find((candidate) => candidate.id === bucket.id);
    if (group) group.entries.push(entry);
    else groups.push({ ...bucket, entries: [entry] });
  }
  return groups;
}
