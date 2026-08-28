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

export const TAG_COLORS = [
  { id: "blue", bg: "#dbeafe", fg: "#1d4ed8", darkBg: "#1e3a5f", darkFg: "#93c5fd" },
  { id: "rose", bg: "#ffe4e6", fg: "#be123c", darkBg: "#4c1d2e", darkFg: "#fda4af" },
  { id: "emerald", bg: "#d1fae5", fg: "#065f46", darkBg: "#064e3b", darkFg: "#6ee7b7" },
  { id: "amber", bg: "#fef3c7", fg: "#92400e", darkBg: "#451a03", darkFg: "#fcd34d" },
  { id: "violet", bg: "#ede9fe", fg: "#5b21b6", darkBg: "#2e1065", darkFg: "#c4b5fd" },
  { id: "sky", bg: "#e0f2fe", fg: "#0369a1", darkBg: "#0c4a6e", darkFg: "#7dd3fc" },
  { id: "orange", bg: "#ffedd5", fg: "#9a3412", darkBg: "#431407", darkFg: "#fdba74" },
  { id: "slate", bg: "#f1f5f9", fg: "#334155", darkBg: "#1e293b", darkFg: "#94a3b8" },
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
