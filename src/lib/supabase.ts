import { createClient } from "@supabase/supabase-js";
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

/** What the cheap first pass selects: everything except the payload. */
interface NoteRow {
  id: string;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
  trashed_at: string | null;
  pinned: boolean;
  folder_id: string | null;
  version: number;
}

interface FolderRow {
  id: string;
  owner_id: string | null;
  name: string | null;
  parent_id: string | null;
}

interface TagRow {
  id: string;
  owner_id: string | null;
  name: string | null;
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

/** Who is in this archive, in the order they joined. `nickname` is empty until
 *  the member sets one; the interface, not this module, decides what to call
 *  them then. */
export interface ArchiveMember {
  userId: string;
  nickname: string;
  isSelf: boolean;
}

export interface ArchiveSnapshot {
  entries: NoteEntry[];
  members: ArchiveMember[];
  /** One scope per member, keyed by member id. */
  metas: Record<string, Meta>;
}

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export async function loadArchive(session: AppSession): Promise<ArchiveSnapshot> {
  const archiveId = session.archiveId;
  adoptArchiveCache(archiveId);
  const [
    notesResult,
    foldersResult,
    tagsResult,
    noteTagsResult,
    membersResult,
    profilesResult,
    archiveResult,
  ] = await Promise.all([
    supabase
      .from("notes")
      .select("id, owner_id, created_at, updated_at, trashed_at, pinned, folder_id, version")
      .eq("archive_id", archiveId),
    supabase
      .from("folders")
      .select("id, owner_id, name, parent_id, position")
      .eq("archive_id", archiveId)
      .order("position"),
    supabase.from("tags").select("id, owner_id, name, color").eq("archive_id", archiveId),
    supabase.from("note_tags").select("note_id, tag_id").eq("archive_id", archiveId),
    supabase
      .from("archive_members")
      .select("user_id, created_at")
      .eq("archive_id", archiveId)
      .order("created_at"),
    supabase.from("profiles").select("user_id, nickname"),
    supabase.from("archives").select("settings").eq("id", archiveId).single(),
  ]);
  for (const result of [
    notesResult,
    foldersResult,
    tagsResult,
    noteTagsResult,
    membersResult,
    archiveResult,
  ]) {
    fail(result.error);
  }

  // A profile may not exist yet, and a missing name is never a reason to fail
  // to open the archive.
  const nicknames = new Map<string, string>(
    (profilesResult.error
      ? []
      : ((profilesResult.data ?? []) as { user_id: string; nickname: string }[])
    ).map((row) => [row.user_id, row.nickname ?? ""]),
  );
  const members: ArchiveMember[] = (
    (membersResult.data ?? []) as { user_id: string; created_at: string }[]
  ).map((row) => ({
    userId: row.user_id,
    nickname: nicknames.get(row.user_id) ?? "",
    isSelf: row.user_id === session.userId,
  }));

  /* A row whose member is unknown — written before the member column, or left
     behind by a deleted account — is filed under the first scope. Nothing is
     allowed to become invisible because its owner went away. */
  const fallbackOwner = members[0]?.userId ?? session.userId;
  const scopeOf = (ownerId: string | null): string =>
    ownerId && members.some((member) => member.userId === ownerId) ? ownerId : fallbackOwner;

  const noteRows = (notesResult.data ?? []) as NoteRow[];
  const folderRows = (foldersResult.data ?? []) as FolderRow[];
  const tagRows = (tagsResult.data ?? []) as TagRow[];
  const noteTagRows = (noteTagsResult.data ?? []) as NoteTagRow[];

  // Only rows whose version moved need their payload at all.
  const staleIds = noteRows
    .filter((row) => noteCache.get(row.id)?.version !== row.version)
    .map((row) => row.id);

  const payloads = new Map<string, { title: string | null; body: string | null }>();
  if (staleIds.length > 0) {
    const changed = await supabase
      .from("notes")
      .select("id, title, body")
      .eq("archive_id", archiveId)
      .in("id", staleIds);
    fail(changed.error);
    for (const row of (changed.data ?? []) as {
      id: string;
      title: string | null;
      body: string | null;
    }[]) {
      payloads.set(row.id, row);
    }
  }

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
      const { title, body } = payload;
      const note: Note = {
        title: title ?? "",
        body: body ?? "",
        id: row.id,
        ownerId: scopeOf(row.owner_id),
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

  const foldersByOwner: Record<string, Folder[]> = {};
  const plainFolders = await Promise.all(
    folderRows.map(async (row) => {
      return {
        ownerId: scopeOf(row.owner_id),
        folder: {
          id: row.id,
          name: row.name ?? "",
          parentId: row.parent_id,
        } satisfies Folder,
      };
    }),
  );
  for (const item of plainFolders) (foldersByOwner[item.ownerId] ??= []).push(item.folder);

  const tagsByOwner: Record<string, Tag[]> = {};
  const plainTags = await Promise.all(
    tagRows.map(async (row) => {
      const name = row.name;
      return {
        ownerId: scopeOf(row.owner_id),
        tag: { id: row.id, name: name ?? "", color: row.color } satisfies Tag,
      };
    }),
  );
  for (const item of plainTags) (tagsByOwner[item.ownerId] ??= []).push(item.tag);

  const tagsByNote = new Map<string, string[]>();
  for (const relation of noteTagRows) {
    const current = tagsByNote.get(relation.note_id) ?? [];
    current.push(relation.tag_id);
    tagsByNote.set(relation.note_id, current);
  }
  const notesByOwner: Record<string, NoteMeta[]> = {};
  for (const row of noteRows) {
    (notesByOwner[scopeOf(row.owner_id)] ??= []).push({
      id: row.id,
      folderId: row.folder_id,
      tagIds: tagsByNote.get(row.id) ?? [],
      pinned: row.pinned || undefined,
      trashedAt: row.trashed_at ?? undefined,
    });
  }

  const settings = archiveResult.data?.settings as { partnerName?: string } | null;
  const partnerName = settings?.partnerName;

  /* One scope per member, and a scope for any member id the rows mention that
     the roster does not — so a note can never fall out of every list. */
  const metas: Record<string, Meta> = {};
  const scopes = new Set([
    ...members.map((member) => member.userId),
    ...Object.keys(foldersByOwner),
    ...Object.keys(tagsByOwner),
    ...Object.keys(notesByOwner),
  ]);
  for (const scope of scopes) {
    metas[scope] = {
      v: 1,
      partnerName: scope === fallbackOwner ? partnerName : undefined,
      folders: foldersByOwner[scope] ?? [],
      tags: tagsByOwner[scope] ?? [],
      notes: notesByOwner[scope] ?? [],
    };
  }

  return {
    entries: entries.sort((a, b) => b.note.updatedAt.localeCompare(a.note.updatedAt)),
    members,
    metas,
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
      owner_id: note.ownerId ?? session.userId,
      title: note.title,
      body: note.body,
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
  ownerId: string,
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
        owner_id: ownerId,
        name: folder.name,
        parent_id: folder.parentId ?? null,
        position,
      })),
    ),
    Promise.resolve(
      changedTags.map((tag) => ({
        id: tag.id,
        archive_id: archiveId,
        owner_id: ownerId,
        name: tag.name,
        color: tag.color,
      })),
    ),
    ownerId === session.userId && before.partnerName !== after.partnerName
      ? Promise.resolve({ partnerName: after.partnerName })
      : Promise.resolve(null),
  ]);

  await all([
    ...(folderRows.length ? [supabase.from("folders").upsert(folderRows)] : []),
    ...(tagRows.length ? [supabase.from("tags").upsert(tagRows)] : []),
    ...(settings ? [supabase.from("archives").update({ settings }).eq("id", archiveId)] : []),
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
      owner_id: ownerId,
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
  /* Storage reports the content type it was uploaded with. Everything in the
     bucket now carries a real one; the caller's `type` is the fallback for an
     object stored before that was true. */
  if (stored.type && stored.type !== "application/octet-stream") return stored;
  return new Blob([await stored.arrayBuffer()], { type });
}

export const uploadImage = uploadObject;

export function downloadImage(session: AppSession, imageId: string): Promise<Blob> {
  return downloadObject(session, imageId, "image/webp");
}
