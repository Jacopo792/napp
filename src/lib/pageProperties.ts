import { PAGE_SYMBOLS, type NoteCover, type PageIcon } from "./types.ts";

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
const symbols = new Set<string>(PAGE_SYMBOLS);

export function clampCoverPosition(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : 0.5;
}

export function pageIconFromStorage(value: unknown): PageIcon {
  if (!value || typeof value !== "object") return null;
  const candidate = value as { kind?: unknown; value?: unknown };
  if (candidate.kind === "emoji" && typeof candidate.value === "string") {
    const emoji = candidate.value.trim();
    return emoji && emoji.length <= 16 ? { kind: "emoji", value: emoji } : null;
  }
  if (
    candidate.kind === "symbol" &&
    typeof candidate.value === "string" &&
    symbols.has(candidate.value)
  ) {
    return { kind: "symbol", value: candidate.value as NonNullable<PageIcon>["value"] } as PageIcon;
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
    /^[0-9a-f-]{36}$/i.test(candidate.objectId)
  ) {
    return { kind: "upload", objectId: candidate.objectId, position };
  }
  return null;
}

export function coverBackground(cover: NoteCover): string | null {
  if (cover?.kind !== "preset") return null;
  return COVER_PRESETS.find((preset) => preset.id === cover.id)?.background ?? null;
}
