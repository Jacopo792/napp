import type { JSONContent } from "@tiptap/core";

/** A picture chosen for a note, the way an account has a profile picture. */
export type NotePhoto = { kind: "photo"; objectId: string } | null;

export type NoteCover =
  | { kind: "preset"; id: string; position: number }
  | { kind: "upload"; objectId: string; position: number }
  | null;

export interface Note {
  id: string;
  title: string;
  body: string;
  /** Canonical structured document. Existing source rows are converted while loading. */
  content: JSONContent;
  /** Zero is the legacy source format; one is the Tiptap JSON schema introduced in 2026. */
  contentVersion: number;
  /** Original source retained after conversion so migration is reversible. */
  legacyBody: string | null;
  /** Optional picture that stands for the note wherever it is named. */
  photo: NotePhoto;
  /** Curated or private uploaded cover, with a normalized vertical focal point. */
  cover: NoteCover;
  /**
   * The member whose scope this note sits in. It is an organisational label,
   * not a permission: every member of the archive reads and writes every
   * scope. Null means the row predates the member column or its account is
   * gone, and the interface files it under the first scope rather than
   * hiding it.
   */
  ownerId: string | null;
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
  /**
   * Filed out of the way without being thrown away. Unlike the trash this is
   * not a waiting room: an archived note stays editable, and it stays archived
   * until somebody says otherwise.
   *
   * Whether the other members can see it at all is decided in Postgres, from
   * the owner's `profiles.hide_archived`, not here.
   */
  archivedAt?: string;
}

export interface Meta {
  v: 1;
  partnerName?: string;
  folders: Folder[];
  tags: Tag[];
  notes: NoteMeta[];
}

export const EMPTY_META: Meta = { v: 1, folders: [], tags: [], notes: [] };
