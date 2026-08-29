/* Preview-only stand-in for src/lib/supabase.ts. An in-memory archive built from
   the fixture, with enough latency that "Saving" and "Saved" are actually
   observable. Never bundled by vite.config.ts — only vite.preview.config.ts
   redirects to it, so the shipped app always talks to real Postgres.

   Because this file replaces the whole persistence layer, the real crypto module
   is simply never reached: nothing here encrypts, and the fixture is plaintext. */
import type { NoteEntry } from "@/lib/entries";
import type { AppSession } from "@/lib/session";
import { EMPTY_META, type Meta, type Note, type NoteMeta } from "@/lib/types";
import { FIXTURE_META, FIXTURE_NOTES, PREVIEW_U1, PREVIEW_U2 } from "./fixture";

export interface ArchiveMember {
  userId: string;
  nickname: string;
  isSelf: boolean;
}

export interface ArchiveSnapshot {
  entries: NoteEntry[];
  members: ArchiveMember[];
  metas: Record<string, Meta>;
}

const MEMBERS: ArchiveMember[] = [
  { userId: PREVIEW_U1, nickname: "Preview", isSelf: true },
  { userId: PREVIEW_U2, nickname: "Partner", isSelf: false },
];

/** sync.mock.ts replaces the realtime layer, so this only has to exist. */
export const supabase = {
  auth: {
    async getUser() {
      return { data: { user: null }, error: null };
    },
    async signOut() {
      return { error: null };
    },
  },
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const notes = new Map<string, NoteEntry>(
  FIXTURE_NOTES.map((note) => [note.id, { note: { ...note }, version: 1 }]),
);
const metas: Record<string, Meta> = {
  [PREVIEW_U1]: structuredClone(FIXTURE_META),
  [PREVIEW_U2]: { ...structuredClone(EMPTY_META), partnerName: FIXTURE_META.partnerName },
};
const images = new Map<string, Blob>();

export async function loadArchive(_session: AppSession): Promise<ArchiveSnapshot> {
  await sleep(240);
  return {
    entries: [...notes.values()]
      .map((entry) => ({ note: { ...entry.note }, version: entry.version }))
      .sort((a, b) => b.note.updatedAt.localeCompare(a.note.updatedAt)),
    members: MEMBERS,
    metas: structuredClone(metas),
  };
}

export async function createNote(
  _session: AppSession,
  note: Note,
  _metadata: NoteMeta,
): Promise<NoteEntry> {
  await sleep(260);
  const entry: NoteEntry = { note: { ...note }, version: 1 };
  notes.set(note.id, entry);
  return { note: { ...note }, version: 1 };
}

export async function saveNote(
  _session: AppSession,
  note: Note,
  expectedVersion: number,
): Promise<number> {
  await sleep(420);
  const current = notes.get(note.id);
  if (!current) throw new Error("The note no longer exists");
  if (current.version !== expectedVersion) return current.version;
  const version = current.version + 1;
  notes.set(note.id, { note: { ...note }, version });
  return version;
}

export async function deleteNote(_session: AppSession, noteId: string): Promise<void> {
  await sleep(200);
  notes.delete(noteId);
}

export async function persistMetaDiff(
  _session: AppSession,
  owner: string,
  _before: Meta,
  after: Meta,
): Promise<void> {
  await sleep(220);
  metas[owner] = structuredClone(after);
}

/* Storage, in memory. The preview never encrypts, so an object is stored as the
   blob it arrived as and handed straight back. */
const objects = new Map<string, Blob>();

export async function uploadObject(
  _session: AppSession,
  objectId: string,
  blob: Blob,
): Promise<void> {
  await sleep(160);
  objects.set(objectId, blob);
}

export async function downloadObject(
  _session: AppSession,
  objectId: string,
  type: string,
): Promise<Blob> {
  await sleep(120);
  const stored = objects.get(objectId);
  if (!stored) throw new Error("That attachment is not in this preview archive");
  return new Blob([await stored.arrayBuffer()], { type });
}

export const uploadImage = uploadObject;

export function downloadImage(session: AppSession, imageId: string): Promise<Blob> {
  return downloadObject(session, imageId, "image/webp");
}

export function resetArchiveCache(): void {
  /* The preview archive is a module singleton; there is nothing to invalidate. */
}
