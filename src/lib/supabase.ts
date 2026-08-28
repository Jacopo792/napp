import { createClient } from "@supabase/supabase-js";
import {
  decryptBytes,
  decryptFolder,
  decryptJson,
  decryptNote,
  decryptTag,
  encryptBytes,
  encryptFolder,
  encryptJson,
  encryptNote,
  encryptTag,
} from "./crypto";
import type { NoteEntry } from "./entries";
import type { AppSession } from "./session";
import type { Folder, Meta, Note, NoteMeta, Tag } from "./types";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export const supabase = createClient(url, publishableKey, {
  auth: {
    storage: typeof window === "undefined" ? undefined : window.sessionStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

type Owner = "u1" | "u2";

/** What the cheap first pass selects: everything except the payload. */
interface NoteRow {
  id: string;
  owner: Owner;
  created_at: string;
  updated_at: string;
  trashed_at: string | null;
  pinned: boolean;
  folder_id: string | null;
  version: number;
}

interface FolderRow {
  id: string;
  owner: Owner;
  ciphertext: string;
}

interface TagRow {
  id: string;
  owner: Owner;
  ciphertext: string;
  color: Tag["color"];
}

interface NoteTagRow {
  note_id: string;
  tag_id: string;
}

/* ── The decrypted-note cache ────────────────────────────────────────────────
   Realtime is only a wake-up signal, so every event used to re-download and
   re-decrypt the entire archive. With two people writing at once that means one
   person's keystrokes pay for a full decrypt of the other's corpus, several
   times a minute.

   `version` already exists for optimistic concurrency, and it changes on every
   write — so it is exactly the cache key this needs. A cheap metadata query
   says which rows moved; only those have their ciphertext fetched and decrypted.

   Reusing the cached Note object also preserves its identity across snapshots,
   which is what lets the WeakMap in lib/derived.ts keep the preview and search
   text it already computed for an unchanged note. ─────────────────────────── */

interface CachedNote {
  version: number;
  note: Note;
}

let cacheArchiveId: string | null = null;
const noteCache = new Map<string, CachedNote>();
/** Folder and tag names are keyed by their own ciphertext: it changes if and
 *  only if the name did. */
const nameCache = new Map<string, string>();

export function resetArchiveCache(): void {
  cacheArchiveId = null;
  noteCache.clear();
  nameCache.clear();
}

function adoptArchiveCache(archiveId: string): void {
  if (cacheArchiveId === archiveId) return;
  resetArchiveCache();
  cacheArchiveId = archiveId;
}

async function decryptName(
  ciphertext: string,
  decrypt: (value: string, key: CryptoKey) => Promise<{ name: string }>,
  key: CryptoKey,
): Promise<string> {
  const hit = nameCache.get(ciphertext);
  if (hit !== undefined) return hit;
  const { name } = await decrypt(ciphertext, key);
  nameCache.set(ciphertext, name);
  return name;
}

/* A folder carries its place in the tree as well as its name, and both are
   inside the ciphertext. Cached on the ciphertext like the names are, so a
   reload that changed nothing does no extra AES work. */
const folderCache = new Map<string, { name: string; parentId: string | null }>();

async function decryptFolderRow(
  ciphertext: string,
  key: CryptoKey,
): Promise<{ name: string; parentId: string | null }> {
  const hit = folderCache.get(ciphertext);
  if (hit) return hit;
  const { name, parentId } = await decryptFolder(ciphertext, key);
  const value = { name, parentId: parentId ?? null };
  folderCache.set(ciphertext, value);
  return value;
}

export interface ArchiveSnapshot {
  entries: NoteEntry[];
  metas: Record<Owner, Meta>;
}

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export async function loadArchive(session: AppSession): Promise<ArchiveSnapshot> {
  const archiveId = session.archiveId;
  adoptArchiveCache(archiveId);
  const [notesResult, foldersResult, tagsResult, noteTagsResult, archiveResult] = await Promise.all(
    [
      supabase
        .from("notes")
        .select("id, owner, created_at, updated_at, trashed_at, pinned, folder_id, version")
        .eq("archive_id", archiveId),
      supabase
        .from("folders")
        .select("id, owner, ciphertext, position")
        .eq("archive_id", archiveId)
        .order("position"),
      supabase.from("tags").select("id, owner, ciphertext, color").eq("archive_id", archiveId),
      supabase.from("note_tags").select("note_id, tag_id").eq("archive_id", archiveId),
      supabase.from("archives").select("settings_ciphertext").eq("id", archiveId).single(),
    ],
  );
  for (const result of [notesResult, foldersResult, tagsResult, noteTagsResult, archiveResult]) {
    fail(result.error);
  }

  const noteRows = (notesResult.data ?? []) as NoteRow[];
  const folderRows = (foldersResult.data ?? []) as FolderRow[];
  const tagRows = (tagsResult.data ?? []) as TagRow[];
  const noteTagRows = (noteTagsResult.data ?? []) as NoteTagRow[];

  // Only the rows whose version moved need their ciphertext at all.
  const staleIds = noteRows
    .filter((row) => noteCache.get(row.id)?.version !== row.version)
    .map((row) => row.id);

  const ciphertexts = new Map<string, string>();
  if (staleIds.length > 0) {
    const changed = await supabase
      .from("notes")
      .select("id, ciphertext")
      .eq("archive_id", archiveId)
      .in("id", staleIds);
    fail(changed.error);
    for (const row of (changed.data ?? []) as { id: string; ciphertext: string }[]) {
      ciphertexts.set(row.id, row.ciphertext);
    }
  }

  const entries = await Promise.all(
    noteRows.map(async (row) => {
      const cached = noteCache.get(row.id);
      if (cached?.version === row.version) {
        return { note: cached.note, version: row.version } satisfies NoteEntry;
      }
      const ciphertext = ciphertexts.get(row.id);
      // A row that appeared between the two queries: keep whatever is cached
      // rather than inventing a note, and let the next wake-up collect it.
      if (ciphertext === undefined) {
        if (!cached) throw new Error("A note changed while the archive was loading");
        return { note: cached.note, version: cached.version } satisfies NoteEntry;
      }
      const decrypted = await decryptNote(ciphertext, session.key);
      const note: Note = {
        ...decrypted,
        id: row.id,
        owner: row.owner,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
      noteCache.set(row.id, { version: row.version, note });
      return { note, version: row.version } satisfies NoteEntry;
    }),
  );

  // Notes deleted elsewhere should not keep their plaintext alive in this tab.
  const present = new Set(noteRows.map((row) => row.id));
  for (const id of [...noteCache.keys()]) if (!present.has(id)) noteCache.delete(id);

  const foldersByOwner: Record<Owner, Folder[]> = { u1: [], u2: [] };
  const decryptedFolders = await Promise.all(
    folderRows.map(async (row) => {
      const { name, parentId } = await decryptFolderRow(row.ciphertext, session.key);
      return { owner: row.owner, folder: { id: row.id, name, parentId } satisfies Folder };
    }),
  );
  for (const item of decryptedFolders) foldersByOwner[item.owner].push(item.folder);

  const tagsByOwner: Record<Owner, Tag[]> = { u1: [], u2: [] };
  const decryptedTags = await Promise.all(
    tagRows.map(async (row) => {
      const name = await decryptName(row.ciphertext, decryptTag, session.key);
      return {
        owner: row.owner,
        tag: { id: row.id, name, color: row.color } satisfies Tag,
      };
    }),
  );
  for (const item of decryptedTags) tagsByOwner[item.owner].push(item.tag);

  const tagsByNote = new Map<string, string[]>();
  for (const relation of noteTagRows) {
    const current = tagsByNote.get(relation.note_id) ?? [];
    current.push(relation.tag_id);
    tagsByNote.set(relation.note_id, current);
  }
  const notesByOwner: Record<Owner, NoteMeta[]> = { u1: [], u2: [] };
  for (const row of noteRows) {
    notesByOwner[row.owner].push({
      id: row.id,
      folderId: row.folder_id,
      tagIds: tagsByNote.get(row.id) ?? [],
      pinned: row.pinned || undefined,
      trashedAt: row.trashed_at ?? undefined,
    });
  }

  let partnerName: string | undefined;
  const settingsCiphertext = archiveResult.data?.settings_ciphertext;
  if (settingsCiphertext) {
    ({ partnerName } = await decryptJson<{ partnerName?: string }>(
      session.key,
      settingsCiphertext,
    ));
  }

  return {
    entries: entries.sort((a, b) => b.note.updatedAt.localeCompare(a.note.updatedAt)),
    metas: {
      u1: {
        v: 1,
        partnerName,
        folders: foldersByOwner.u1,
        tags: tagsByOwner.u1,
        notes: notesByOwner.u1,
      },
      u2: {
        v: 1,
        folders: foldersByOwner.u2,
        tags: tagsByOwner.u2,
        notes: notesByOwner.u2,
      },
    },
  };
}

export async function createNote(
  session: AppSession,
  note: Note,
  metadata: NoteMeta,
): Promise<NoteEntry> {
  const ciphertext = await encryptNote(note, session.key);
  const { data, error } = await supabase
    .from("notes")
    .insert({
      id: note.id,
      archive_id: session.archiveId,
      owner: note.owner,
      ciphertext,
      created_at: note.createdAt,
      updated_at: note.updatedAt,
      trashed_at: metadata.trashedAt ?? null,
      pinned: metadata.pinned ?? false,
      folder_id: metadata.folderId,
    })
    .select("version")
    .single();
  fail(error);
  noteCache.set(note.id, { version: data!.version, note });
  return { note, version: data!.version };
}

export async function saveNote(
  session: AppSession,
  note: Note,
  expectedVersion: number,
): Promise<number> {
  const ciphertext = await encryptNote(note, session.key);
  let version = expectedVersion;
  for (let attempt = 0; attempt < 4; attempt++) {
    const result = await supabase
      .from("notes")
      .update({ ciphertext, updated_at: note.updatedAt, version: version + 1 })
      .eq("archive_id", session.archiveId)
      .eq("id", note.id)
      .eq("version", version)
      .select("version")
      .maybeSingle();
    fail(result.error);
    if (result.data) {
      noteCache.set(note.id, { version: result.data.version, note });
      return result.data.version;
    }

    const current = await supabase
      .from("notes")
      .select("version")
      .eq("archive_id", session.archiveId)
      .eq("id", note.id)
      .single();
    fail(current.error);
    version = current.data!.version;
  }
  throw new Error("The note changed repeatedly while it was being saved");
}

export async function deleteNote(session: AppSession, noteId: string): Promise<void> {
  const result = await supabase
    .from("notes")
    .delete()
    .eq("archive_id", session.archiveId)
    .eq("id", noteId);
  fail(result.error);
  noteCache.delete(noteId);
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** Runs independent writes together and reports the first failure. */
async function all(work: PromiseLike<{ error: { message: string } | null }>[]): Promise<void> {
  for (const result of await Promise.all(work)) fail(result.error);
}

/* Renaming three folders used to be three sequential round trips, and retagging
   a note two more — every await waiting on the one before it although nothing
   depended on it. The work is now grouped: rows of a kind go up in one batched
   call, independent calls run together, and the only sequencing left is the one
   the foreign keys actually require —

     1. folders and tags exist,      before
     2. notes point at them and old tag links go,   before
     3. new tag links are written,   before
     4. emptied folders and tags are deleted. */
export async function persistMetaDiff(
  session: AppSession,
  owner: Owner,
  before: Meta,
  after: Meta,
): Promise<void> {
  const archiveId = session.archiveId;
  const beforeFolders = new Map(
    before.folders.map((folder, position) => [folder.id, { folder, position }]),
  );
  const afterFolders = new Map(
    after.folders.map((folder, position) => [folder.id, { folder, position }]),
  );
  const beforeTags = new Map(before.tags.map((tag) => [tag.id, tag]));
  const afterTags = new Map(after.tags.map((tag) => [tag.id, tag]));
  const beforeNotes = new Map(before.notes.map((note) => [note.id, note]));
  const afterNotes = new Map(after.notes.map((note) => [note.id, note]));

  // ── 1. Names and structure the rest will reference ──────────────────────
  const changedFolders = [...afterFolders.values()].filter(({ folder, position }) => {
    const previous = beforeFolders.get(folder.id);
    return !previous || !sameJson(previous, { folder, position });
  });
  const changedTags = [...afterTags.values()].filter((tag) => {
    const previous = beforeTags.get(tag.id);
    return !previous || !sameJson(previous, tag);
  });

  const [folderRows, tagRows, settings] = await Promise.all([
    Promise.all(
      changedFolders.map(async ({ folder, position }) => ({
        id: folder.id,
        archive_id: archiveId,
        owner,
        ciphertext: await encryptFolder(folder, session.key),
        position,
      })),
    ),
    Promise.all(
      changedTags.map(async (tag) => ({
        id: tag.id,
        archive_id: archiveId,
        owner,
        ciphertext: await encryptTag(tag, session.key),
        color: tag.color,
      })),
    ),
    owner === "u1" && before.partnerName !== after.partnerName
      ? encryptJson(session.key, { partnerName: after.partnerName })
      : Promise.resolve(null),
  ]);

  await all([
    ...(folderRows.length ? [supabase.from("folders").upsert(folderRows)] : []),
    ...(tagRows.length ? [supabase.from("tags").upsert(tagRows)] : []),
    ...(settings
      ? [supabase.from("archives").update({ settings_ciphertext: settings }).eq("id", archiveId)]
      : []),
  ]);

  // ── 2. Note placement, and the tag links that are being replaced ────────
  const movedNotes = [...afterNotes.values()].filter((metadata) => {
    const previous = beforeNotes.get(metadata.id);
    return (
      !previous ||
      previous.folderId !== metadata.folderId ||
      previous.pinned !== metadata.pinned ||
      previous.trashedAt !== metadata.trashedAt
    );
  });
  const retagged = [...afterNotes.values()].filter((metadata) => {
    const previous = beforeNotes.get(metadata.id);
    return !previous || !sameJson(previous.tagIds, metadata.tagIds);
  });

  await all([
    // Each note carries its own values, so these stay separate statements —
    // but they no longer wait on one another.
    ...movedNotes.map((metadata) =>
      supabase
        .from("notes")
        .update({
          folder_id: metadata.folderId,
          pinned: metadata.pinned ?? false,
          trashed_at: metadata.trashedAt ?? null,
        })
        .eq("archive_id", archiveId)
        .eq("id", metadata.id),
    ),
    ...(retagged.length
      ? [
          supabase
            .from("note_tags")
            .delete()
            .eq("archive_id", archiveId)
            .in(
              "note_id",
              retagged.map((metadata) => metadata.id),
            ),
        ]
      : []),
  ]);

  // ── 3. The new tag links, all of them in one insert ─────────────────────
  const links = retagged.flatMap((metadata) =>
    metadata.tagIds.map((tagId) => ({
      note_id: metadata.id,
      tag_id: tagId,
      archive_id: archiveId,
      owner,
    })),
  );
  if (links.length > 0) await all([supabase.from("note_tags").insert(links)]);

  // ── 4. What nothing points at any more ──────────────────────────────────
  const goneFolders = [...beforeFolders.keys()].filter((id) => !afterFolders.has(id));
  const goneTags = [...beforeTags.keys()].filter((id) => !afterTags.has(id));
  await all([
    ...(goneFolders.length
      ? [supabase.from("folders").delete().eq("archive_id", archiveId).in("id", goneFolders)]
      : []),
    ...(goneTags.length
      ? [supabase.from("tags").delete().eq("archive_id", archiveId).in("id", goneTags)]
      : []),
  ]);
}

/* One private bucket holds every encrypted blob a note can carry. Objects are
   always uploaded as `application/octet-stream` — the bucket's only allowed
   type, and the truth about the bytes, which are ciphertext until the browser
   that holds the archive key decrypts them. What the plaintext actually is
   (a WebP image, a PDF) is known only to the note that references it. */
const OBJECT_BUCKET = "note-images";

export async function uploadEncryptedObject(
  session: AppSession,
  objectId: string,
  blob: Blob,
): Promise<void> {
  const encrypted = await encryptBytes(session.key, new Uint8Array(await blob.arrayBuffer()));
  const result = await supabase.storage
    .from(OBJECT_BUCKET)
    .upload(`${session.archiveId}/${objectId}`, encrypted, {
      contentType: "application/octet-stream",
      upsert: false,
    });
  fail(result.error);
}

export async function downloadEncryptedObject(
  session: AppSession,
  objectId: string,
  type: string,
): Promise<Blob> {
  const result = await supabase.storage
    .from(OBJECT_BUCKET)
    .download(`${session.archiveId}/${objectId}`);
  fail(result.error);
  const plaintext = await decryptBytes(
    session.key,
    new Uint8Array(await result.data!.arrayBuffer()),
  );
  return new Blob([plaintext.slice().buffer as ArrayBuffer], { type });
}

export const uploadEncryptedImage = uploadEncryptedObject;

export function downloadEncryptedImage(session: AppSession, imageId: string): Promise<Blob> {
  return downloadEncryptedObject(session, imageId, "image/webp");
}
