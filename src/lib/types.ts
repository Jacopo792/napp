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

/* Dark-only since 2026-08-28. The eight ids are fixed — Postgres has a CHECK
   constraint naming them — and the chrome is now chroma-zero, so these tags are
   the only hue in the interface. Their foregrounds are calm pastels at
   oklch(0.80 0.09 h): mutually distinct and every one ≥ 5.5:1 on --page. */
export const TAG_COLORS = [
  { id: "blue", darkFg: "#96BEF2" },
  { id: "rose", darkFg: "#F2ABAF" },
  { id: "emerald", darkFg: "#86D3AD" },
  { id: "amber", darkFg: "#D6C084" },
  { id: "violet", darkFg: "#DDABE0" },
  { id: "sky", darkFg: "#8CC9E5" },
  { id: "orange", darkFg: "#EBB593" },
  { id: "slate", darkFg: "#B8BBC2" },
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
