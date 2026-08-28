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

/* Dark-only since 2026-08-28: the light `bg`/`fg` pairs this list used to
   carry were never read again, so they are gone. */
export const TAG_COLORS = [
  { id: "blue", darkBg: "#1e3a5f", darkFg: "#93c5fd" },
  { id: "rose", darkBg: "#4c1d2e", darkFg: "#fda4af" },
  { id: "emerald", darkBg: "#064e3b", darkFg: "#6ee7b7" },
  { id: "amber", darkBg: "#451a03", darkFg: "#fcd34d" },
  { id: "violet", darkBg: "#2e1065", darkFg: "#c4b5fd" },
  { id: "sky", darkBg: "#0c4a6e", darkFg: "#7dd3fc" },
  { id: "orange", darkBg: "#431407", darkFg: "#fdba74" },
  { id: "slate", darkBg: "#1e293b", darkFg: "#94a3b8" },
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
