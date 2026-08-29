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
  /**
   * The folder this one sits inside, or null at the top level.
   *
   * Stored directly so both archive members see the same hierarchy.
   */
  parentId?: string | null;
}

/* The ids are fixed by the Postgres CHECK constraint. Tags keep their muted
   semantic colours while the surrounding interface remains neutral. */
export const TAG_COLORS = [
  { id: "blue", darkFg: "#96bef2" },
  { id: "rose", darkFg: "#f2abaf" },
  { id: "emerald", darkFg: "#86d3ad" },
  { id: "amber", darkFg: "#d6c084" },
  { id: "violet", darkFg: "#ddabe0" },
  { id: "sky", darkFg: "#8cc9e5" },
  { id: "orange", darkFg: "#ebb593" },
  { id: "slate", darkFg: "#b8bbc2" },
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
  /** Soft-deleted notes remain recoverable in Postgres until removed from Trash. */
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
