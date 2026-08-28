export interface Note {
  id: string;
  title: string;
  body: string;
  owner: "u1" | "u2";
  createdAt: string;
  updatedAt: string;
}

export interface Folder {
  id: string;
  name: string;
}

/* Dark-only since 2026-08-28: the light `bg`/`fg` pairs this list used to carry
   were never read again, so they are gone. The eight ids are fixed — Postgres
   has a CHECK constraint naming them — but the values are tuned to the warm,
   herbal palette rather than to the primary hues they started as. */
export const TAG_COLORS = [
  { id: "blue", darkBg: "#1b3040", darkFg: "#8fbcd4" },
  { id: "rose", darkBg: "#41202a", darkFg: "#e2a0a8" },
  { id: "emerald", darkBg: "#1c3a2b", darkFg: "#96caa3" },
  { id: "amber", darkBg: "#3d2c12", darkFg: "#d9b878" },
  { id: "violet", darkBg: "#2f2540", darkFg: "#bda8d4" },
  { id: "sky", darkBg: "#1d3739", darkFg: "#8ec7c4" },
  { id: "orange", darkBg: "#402713", darkFg: "#dfa97e" },
  { id: "slate", darkBg: "#2b2724", darkFg: "#a9a29a" },
] as const;

export type TagColorId = (typeof TAG_COLORS)[number]["id"];

export interface Tag {
  id: string;
  name: string;
  color: TagColorId;
}

export interface NoteMeta {
  id: string;
  folderId: string | null;
  tagIds: string[];
  /** Optional for backward compatibility with metadata written before pinning existed. */
  pinned?: boolean;
  /** Soft-deleted notes remain encrypted in Postgres until removed from Trash. */
  trashedAt?: string;
}

export interface Meta {
  v: 1;
  partnerName?: string;
  folders: Folder[];
  tags: Tag[];
  notes: NoteMeta[];
}

export const EMPTY_META: Meta = { v: 1, folders: [], tags: [], notes: [] };
