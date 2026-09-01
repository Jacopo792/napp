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

/* Tags are gone from the interface and their tables are left standing in
   Postgres, holding whatever they held. Nothing here reads them: the client
   stopped selecting `tags` and `note_tags`, so a note's metadata is a folder,
   a pin and two timestamps. Re-adding the feature means re-adding the reads —
   the rows never went anywhere. */
export interface NoteMeta {
  id: string;
  folderId: string | null;
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
  notes: NoteMeta[];
}

export const EMPTY_META: Meta = { v: 1, folders: [], notes: [] };
