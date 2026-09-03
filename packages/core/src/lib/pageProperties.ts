import type { Note, NoteCover, NotePhoto } from "./types.ts";

export const COVER_PRESETS = [
  {
    id: "museum",
    name: "Museum",
    background: "linear-gradient(120deg,#83715f,#d6c6a4 52%,#6d5848)",
  },
  { id: "dusk", name: "Dusk", background: "linear-gradient(120deg,#392f46,#766784 48%,#c19984)" },
  {
    id: "forest",
    name: "Forest",
    background: "linear-gradient(120deg,#182d27,#4e6b52 52%,#9c9270)",
  },
  { id: "ocean", name: "Ocean", background: "linear-gradient(120deg,#142d3b,#3d6c7d 52%,#8eb1b2)" },
  { id: "paper", name: "Paper", background: "linear-gradient(120deg,#7d7469,#c8bdae 50%,#8e8172)" },
  { id: "ember", name: "Ember", background: "linear-gradient(120deg,#3c2220,#92554d 48%,#d39a72)" },
] as const;

const presetIds = new Set<string>(COVER_PRESETS.map((preset) => preset.id));
const OBJECT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function clampCoverPosition(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : 0.5;
}

export function notePhotoFromStorage(value: unknown): NotePhoto {
  if (!value || typeof value !== "object") return null;
  const candidate = value as { kind?: unknown; objectId?: unknown };
  if (
    candidate.kind === "photo" &&
    typeof candidate.objectId === "string" &&
    OBJECT_ID.test(candidate.objectId)
  ) {
    return { kind: "photo", objectId: candidate.objectId };
  }
  return null;
}

export function coverFromStorage(value: unknown): NoteCover {
  if (!value || typeof value !== "object") return null;
  const candidate = value as {
    kind?: unknown;
    id?: unknown;
    objectId?: unknown;
    position?: unknown;
  };
  const position = clampCoverPosition(candidate.position);
  if (
    candidate.kind === "preset" &&
    typeof candidate.id === "string" &&
    presetIds.has(candidate.id)
  ) {
    return { kind: "preset", id: candidate.id, position };
  }
  if (
    candidate.kind === "upload" &&
    typeof candidate.objectId === "string" &&
    OBJECT_ID.test(candidate.objectId)
  ) {
    return { kind: "upload", objectId: candidate.objectId, position };
  }
  return null;
}

export function coverBackground(cover: NoteCover): string | null {
  if (cover?.kind !== "preset") return null;
  return COVER_PRESETS.find((preset) => preset.id === cover.id)?.background ?? null;
}

/**
 * The note as it was cached, carrying whatever picture the archive holds now.
 *
 * Setting a cover or a photo writes neither the text nor the row's version, so
 * the payload the version gates is never re-fetched for it — which is how a
 * cover came to vanish a moment after being chosen, taken back by the cached
 * note when the write's own Realtime event returned. Returns the very same
 * object when nothing changed, so a refresh does not re-render every row in
 * the list for a note nobody touched.
 */
export function withPageProperties(note: Note, row: { page_icon: unknown; cover: unknown }): Note {
  const photo = notePhotoFromStorage(row.page_icon);
  const cover = coverFromStorage(row.cover);
  const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  if (same(photo, note.photo) && same(cover, note.cover)) return note;
  return { ...note, photo, cover };
}
