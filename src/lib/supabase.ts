import { createClient } from "@supabase/supabase-js";
import { decryptBytes, decryptFolder, decryptJson, decryptNote, decryptTag } from "./crypto";
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
  name: string | null;
  parent_id: string | null;
  ciphertext: string | null;
}

interface TagRow {
  id: string;
  owner: Owner;
  name: string | null;
  ciphertext: string | null;
  color: Tag["color"];
}

interface NoteTagRow {
  note_id: string;
  tag_id: string;
}

/* ── The note cache ──────────────────────────────────────────────────────────
   Realtime is only a wake-up signal, so every event must not rebuild the
   entire archive. `version` is the cache key and changes on every write.

   Reusing the cached Note object also preserves its identity across snapshots,
   which is what lets the WeakMap in lib/derived.ts keep the preview and search
   text it already computed for an unchanged note. ─────────────────────────── */

interface CachedNote {
  version: number;
  note: Note;
}

let cacheArchiveId: string | null = null;
const noteCache = new Map<string, CachedNote>();

export function resetArchiveCache(): void {
  cacheArchiveId = null;
  noteCache.clear();
}

function adoptArchiveCache(archiveId: string): void {
  if (cacheArchiveId === archiveId) return;
  resetArchiveCache();
  cacheArchiveId = archiveId;
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
        .select("id, owner, name, parent_id, ciphertext, position")
        .eq("archive_id", archiveId)
        .order("position"),
      supabase
        .from("tags")
        .select("id, owner, name, ciphertext, color")
        .eq("archive_id", archiveId),
      supabase.from("note_tags").select("note_id, tag_id").eq("archive_id", archiveId),
      supabase
        .from("archives")
        .select("settings, settings_ciphertext")
        .eq("id", archiveId)
        .single(),
    ],
  );
  for (const result of [notesResult, foldersResult, tagsResult, noteTagsResult, archiveResult]) {
    fail(result.error);
  }

  const noteRows = (notesResult.data ?? []) as NoteRow[];
  const folderRows = (foldersResult.data ?? []) as FolderRow[];
  const tagRows = (tagsResult.data ?? []) as TagRow[];
  const noteTagRows = (noteTagsResult.data ?? []) as NoteTagRow[];

  // Only rows whose version moved need their payload at all.
  const staleIds = noteRows
    .filter((row) => noteCache.get(row.id)?.version !== row.version)
    .map((row) => row.id);

  const payloads = new Map<
    string,
    { title: string | null; body: string | null; ciphertext: string | null }
  >();
  if (staleIds.length > 0) {
    const changed = await supabase
      .from("notes")
      .select("id, title, body, ciphertext")
      .eq("archive_id", archiveId)
      .in("id", staleIds);
    fail(changed.error);
    for (const row of (changed.data ?? []) as {
      id: string;
      title: string | null;
      body: string | null;
      ciphertext: string | null;
    }[]) {
      payloads.set(row.id, row);
    }
  }

  const legacyWrites: PromiseLike<{ error: { message: string } | null }>[] = [];
  const entries = await Promise.all(
    noteRows.map(async (row) => {
      const cached = noteCache.get(row.id);
      if (cached?.version === row.version) {
        return { note: cached.note, version: row.version } satisfies NoteEntry;
      }
      const payload = payloads.get(row.id);
      // A row that appeared between the two queries: keep whatever is cached
      // rather than inventing a note, and let the next wake-up collect it.
      if (payload === undefined) {
        if (!cached) throw new Error("A note changed while the archive was loading");
        return { note: cached.note, version: cached.version } satisfies NoteEntry;
      }
      let title = payload.title;
      let body = payload.body;
      if ((title === null || body === null) && payload.ciphertext) {
        if (!session.legacyKey) {
          throw new Error(
            "This note still uses the old encrypted format. Sign out and sign in once more to migrate it.",
          );
        }
        const legacy = await decryptNote(payload.ciphertext, session.legacyKey);
        title = legacy.title;
        body = legacy.body;
        legacyWrites.push(
          supabase
            .from("notes")
            .update({ title, body, ciphertext: null })
            .eq("archive_id", archiveId)
            .eq("id", row.id),
        );
      }
      const note: Note = {
        title: title ?? "",
        body: body ?? "",
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
  const plainFolders = await Promise.all(
    folderRows.map(async (row) => {
      let name = row.name;
      let parentId = row.parent_id;
      if (name === null && row.ciphertext) {
        if (!session.legacyKey) throw new Error("A folder still uses the old encrypted format");
        const legacy = await decryptFolder(row.ciphertext, session.legacyKey);
        name = legacy.name;
        parentId = legacy.parentId ?? null;
        legacyWrites.push(
          supabase
            .from("folders")
            .update({ name, parent_id: parentId, ciphertext: null })
            .eq("archive_id", archiveId)
            .eq("id", row.id),
        );
      }
      return {
        owner: row.owner,
        folder: { id: row.id, name: name ?? "", parentId } satisfies Folder,
      };
    }),
  );
  for (const item of plainFolders) foldersByOwner[item.owner].push(item.folder);

  const tagsByOwner: Record<Owner, Tag[]> = { u1: [], u2: [] };
  const plainTags = await Promise.all(
    tagRows.map(async (row) => {
      let name = row.name;
      if (name === null && row.ciphertext) {
        if (!session.legacyKey) throw new Error("A tag still uses the old encrypted format");
        name = (await decryptTag(row.ciphertext, session.legacyKey)).name;
        legacyWrites.push(
          supabase
            .from("tags")
            .update({ name, ciphertext: null })
            .eq("archive_id", archiveId)
            .eq("id", row.id),
        );
      }
      return {
        owner: row.owner,
        tag: { id: row.id, name: name ?? "", color: row.color } satisfies Tag,
      };
    }),
  );
  for (const item of plainTags) tagsByOwner[item.owner].push(item.tag);

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
  const settings = archiveResult.data?.settings as { partnerName?: string } | null;
  partnerName = settings?.partnerName;
  const settingsCiphertext = archiveResult.data?.settings_ciphertext as string | null;
  if (!partnerName && settingsCiphertext) {
    if (!session.legacyKey) throw new Error("Archive settings still use the old encrypted format");
    ({ partnerName } = await decryptJson<{ partnerName?: string }>(
      session.legacyKey,
      settingsCiphertext,
    ));
    legacyWrites.push(
      supabase
        .from("archives")
        .update({ settings: { partnerName }, settings_ciphertext: null })
        .eq("id", archiveId),
    );
  }

  if (legacyWrites.length) await all(legacyWrites);

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
  const { data, error } = await supabase
    .from("notes")
    .insert({
      id: note.id,
      archive_id: session.archiveId,
      owner: note.owner,
      title: note.title,
      body: note.body,
      ciphertext: null,
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
  let version = expectedVersion;
  for (let attempt = 0; attempt < 4; attempt++) {
    const result = await supabase
      .from("notes")
      .update({
        title: note.title,
        body: note.body,
        ciphertext: null,
        updated_at: note.updatedAt,
        version: version + 1,
      })
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
    Promise.resolve(
      changedFolders.map(({ folder, position }) => ({
        id: folder.id,
        archive_id: archiveId,
        owner,
        name: folder.name,
        parent_id: folder.parentId ?? null,
        ciphertext: null,
        position,
      })),
    ),
    Promise.resolve(
      changedTags.map((tag) => ({
        id: tag.id,
        archive_id: archiveId,
        owner,
        name: tag.name,
        ciphertext: null,
        color: tag.color,
      })),
    ),
    owner === "u1" && before.partnerName !== after.partnerName
      ? Promise.resolve({ partnerName: after.partnerName })
      : Promise.resolve(null),
  ]);

  await all([
    ...(folderRows.length ? [supabase.from("folders").upsert(folderRows)] : []),
    ...(tagRows.length ? [supabase.from("tags").upsert(tagRows)] : []),
    ...(settings
      ? [
          supabase
            .from("archives")
            .update({ settings, settings_ciphertext: null })
            .eq("id", archiveId),
        ]
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

/* One private bucket holds every blob a note can carry. Access is enforced by
   archive membership in Storage RLS; bytes keep their real media type. */
const OBJECT_BUCKET = "note-images";

export async function uploadObject(
  session: AppSession,
  objectId: string,
  blob: Blob,
): Promise<void> {
  const result = await supabase.storage
    .from(OBJECT_BUCKET)
    .upload(`${session.archiveId}/${objectId}`, blob, {
      contentType: blob.type || "application/octet-stream",
      upsert: false,
    });
  fail(result.error);
}

export async function downloadObject(
  session: AppSession,
  objectId: string,
  type: string,
): Promise<Blob> {
  const result = await supabase.storage
    .from(OBJECT_BUCKET)
    .download(`${session.archiveId}/${objectId}`);
  fail(result.error);
  const stored = result.data!;
  if (stored.type && stored.type !== "application/octet-stream") return stored;
  if (!session.legacyKey) return new Blob([await stored.arrayBuffer()], { type });

  // An old encrypted object migrates in place the first time it is opened.
  const plaintext = await decryptBytes(
    session.legacyKey,
    new Uint8Array(await stored.arrayBuffer()),
  );
  const migrated = new Blob([plaintext.slice().buffer as ArrayBuffer], { type });
  const rewrite = await supabase.storage
    .from(OBJECT_BUCKET)
    .upload(`${session.archiveId}/${objectId}`, migrated, { contentType: type, upsert: true });
  fail(rewrite.error);
  return migrated;
}

export const uploadImage = uploadObject;

export function downloadImage(session: AppSession, imageId: string): Promise<Blob> {
  return downloadObject(session, imageId, "image/webp");
}
