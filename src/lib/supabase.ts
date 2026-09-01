import type { NoteEntry } from "./entries";
import type { AppSession } from "./session";
import type { Folder, Meta, Note, NoteMeta, Tag } from "./types";
import { fail, supabase } from "./supabaseClient";
import { coverFromStorage, notePhotoFromStorage, withPageProperties } from "./pageProperties";
import { readCachedNotes, writeCachedNotes, type CachedNote as StoredNote } from "./noteStore";
import {
  noteDocument,
  richTextToPlainText,
  RICH_TEXT_VERSION,
} from "@/features/editor/lib/content";

export { supabase } from "./supabaseClient";
export {
  createArchiveInvite,
  deleteAvatar,
  downloadAvatar,
  downloadImage,
  downloadObject,
  loadPendingInvites,
  loadProfile,
  leaveArchive,
  revokeArchiveInvite,
  saveProfile,
  setArchiveMemberRole,
  uploadAvatar,
  uploadImage,
  uploadObject,
  type PendingInvite,
  type Profile,
} from "./archiveAssets";

/** What the cheap first pass selects: everything except the payload. */
interface NoteRow {
  id: string;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
  trashed_at: string | null;
  archived_at: string | null;
  pinned: boolean;
  folder_id: string | null;
  version: number;
  content_version: number;
  /* A picture is metadata, not payload. Both travel with every row rather
     than with the payload the version gates, because neither one moves the
     version — see `pageProperties` below. */
  page_icon: unknown;
  cover: unknown;
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

type CachedNote = StoredNote;

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
  /** The object id of their picture, if they have set one. */
  avatarObject: string | null;
  /** When they joined the archive, which is the only date a member has. */
  joinedAt: string;
  role: "editor" | "viewer";
  isSelf: boolean;
}

export interface ArchiveSnapshot {
  entries: NoteEntry[];
  members: ArchiveMember[];
  /** How many members this archive may hold. Two, unless the row says otherwise. */
  seatLimit: number;
  /** One scope per member, keyed by member id. */
  metas: Record<string, Meta>;
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
    /* Read beside the queries it exists to save, never before them: on a warm
       tab it is already in memory and this costs nothing, and on a cold one it
       finishes long before the network does. */
    persisted,
  ] = await Promise.all([
    supabase
      .from("notes")
      .select(
        "id, owner_id, created_at, updated_at, trashed_at, archived_at, pinned, folder_id, version, content_version, page_icon, cover",
      )
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
      .select("user_id, created_at, role")
      .eq("archive_id", archiveId)
      .order("created_at"),
    supabase.from("profiles").select("user_id, nickname, avatar_object"),
    supabase.from("archives").select("settings, seat_limit").eq("id", archiveId).single(),
    noteCache.size === 0 ? readCachedNotes(archiveId) : Promise.resolve(null),
  ]);

  /* Only what this tab has not already got. A note edited since the store was
     written has a moved version and is declared stale below regardless. */
  if (persisted)
    for (const [id, entry] of persisted) if (!noteCache.has(id)) noteCache.set(id, entry);
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
  const profileRows = new Map<string, { nickname: string; avatarObject: string | null }>(
    (profilesResult.error
      ? []
      : ((profilesResult.data ?? []) as {
          user_id: string;
          nickname: string | null;
          avatar_object: string | null;
        }[])
    ).map((row) => [
      row.user_id,
      { nickname: row.nickname ?? "", avatarObject: row.avatar_object ?? null },
    ]),
  );
  const members: ArchiveMember[] = (
    (membersResult.data ?? []) as {
      user_id: string;
      created_at: string;
      role: "editor" | "viewer";
    }[]
  ).map((row) => ({
    userId: row.user_id,
    nickname: profileRows.get(row.user_id)?.nickname ?? "",
    avatarObject: profileRows.get(row.user_id)?.avatarObject ?? null,
    joinedAt: row.created_at,
    role: row.role,
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

  const payloads = new Map<
    string,
    {
      title: string | null;
      body: string | null;
      content: unknown;
      legacy_body: string | null;
      page_icon: unknown;
      cover: unknown;
    }
  >();
  if (staleIds.length > 0) {
    const changed = await supabase
      .from("notes")
      .select("id, title, body, content, legacy_body, page_icon, cover")
      .eq("archive_id", archiveId)
      .in("id", staleIds);
    fail(changed.error);
    for (const row of (changed.data ?? []) as {
      id: string;
      title: string | null;
      body: string | null;
      content: unknown;
      legacy_body: string | null;
      page_icon: unknown;
      cover: unknown;
    }[]) {
      payloads.set(row.id, row);
    }
  }

  const entries = await Promise.all(
    noteRows.map(async (row) => {
      const cached = noteCache.get(row.id);
      if (cached?.version === row.version) {
        /* Setting a cover or a photo writes neither the text nor the version,
           so the payload above is never re-fetched for it and the cache would
           hand back the note as it was before the picture — which is what a
           cover did on screen: it appeared, the write's own Realtime event
           came back, and the cached note took it away again. */
        const note = withPageProperties(cached.note, row);
        if (note !== cached.note) noteCache.set(row.id, { version: row.version, note });
        return { note, version: row.version } satisfies NoteEntry;
      }
      const payload = payloads.get(row.id);
      // A row that appeared between the two queries: keep whatever is cached
      // rather than inventing a note, and let the next wake-up collect it.
      if (payload === undefined) {
        if (!cached) throw new Error("A note changed while the archive was loading");
        return { note: cached.note, version: cached.version } satisfies NoteEntry;
      }
      const { title, body, content, legacy_body: legacyBody, page_icon, cover } = payload;
      const storedBody = body ?? "";
      const document = noteDocument(content, row.content_version, legacyBody ?? storedBody);
      const note: Note = {
        title: title ?? "",
        body:
          row.content_version === RICH_TEXT_VERSION ? storedBody : richTextToPlainText(document),
        content: document,
        contentVersion: row.content_version,
        legacyBody: legacyBody ?? (row.content_version === 0 ? storedBody : null),
        photo: notePhotoFromStorage(page_icon),
        cover: coverFromStorage(cover),
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
  const dropped: string[] = [];
  for (const id of [...noteCache.keys()])
    if (!present.has(id)) {
      noteCache.delete(id);
      dropped.push(id);
    }

  /* Deliberately not awaited. The catalogue is built and about to be returned;
     writing it down is for the next visit and must never hold up this one. */
  const rewritten = staleIds.map((id) => noteCache.get(id)).filter((entry) => entry !== undefined);
  if (rewritten.length > 0 || dropped.length > 0)
    void writeCachedNotes(archiveId, rewritten, dropped);

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
      archivedAt: row.archived_at ?? undefined,
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
    seatLimit: (archiveResult.data?.seat_limit as number | null) ?? 2,
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
      content: note.content,
      content_version: note.contentVersion,
      legacy_body: note.legacyBody,
      page_icon: note.photo,
      cover: note.cover,
      created_at: note.createdAt,
      updated_at: note.updatedAt,
      trashed_at: metadata.trashedAt ?? null,
      archived_at: metadata.archivedAt ?? null,
      pinned: metadata.pinned ?? false,
      folder_id: metadata.folderId,
    })
    .select("version")
    .single();
  fail(error);
  noteCache.set(note.id, { version: data!.version, note });
  return { note, version: data!.version };
}

/** Updates page decoration without serialising title or content, so changing a
 * cover can never overwrite somebody else's live document edit. */
export async function updateNoteProperties(
  session: AppSession,
  noteId: string,
  values: Pick<Note, "photo" | "cover">,
): Promise<void> {
  const result = await supabase
    .from("notes")
    .update({ page_icon: values.photo, cover: values.cover })
    .eq("archive_id", session.archiveId)
    .eq("id", noteId);
  fail(result.error);
}

/** Somebody else wrote this note since the caller last read it. Carries the
 *  row that is actually there, so the caller can merge without a second trip. */
export class NoteConflict extends Error {
  /** Null when the note is no longer there at all. */
  constructor(readonly entry: NoteEntry | null) {
    super("This note changed somewhere else");
    this.name = "NoteConflict";
  }
}

/** Reads one note whole, for the merge that follows a conflict. */
export async function loadNote(session: AppSession, noteId: string): Promise<NoteEntry | null> {
  const result = await supabase
    .from("notes")
    .select(
      "id, owner_id, created_at, updated_at, version, content_version, title, body, content, legacy_body, page_icon, cover",
    )
    .eq("archive_id", session.archiveId)
    .eq("id", noteId)
    .maybeSingle();
  fail(result.error);
  if (!result.data) return null;

  const row = result.data as NoteRow & {
    title: string | null;
    body: string | null;
    content: unknown;
    legacy_body: string | null;
    page_icon: unknown;
    cover: unknown;
  };
  const storedBody = row.body ?? "";
  const document = noteDocument(row.content, row.content_version, row.legacy_body ?? storedBody);
  const note: Note = {
    id: row.id,
    title: row.title ?? "",
    body: row.content_version === RICH_TEXT_VERSION ? storedBody : richTextToPlainText(document),
    content: document,
    contentVersion: row.content_version,
    legacyBody: row.legacy_body ?? (row.content_version === 0 ? storedBody : null),
    photo: notePhotoFromStorage(row.page_icon),
    cover: coverFromStorage(row.cover),
    ownerId: row.owner_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  noteCache.set(row.id, { version: row.version, note });
  return { note, version: row.version };
}

/**
 * Writes a note, but only onto the version it was read from.
 *
 * The conditional update is the whole of the concurrency control. It used to
 * be spent rather than used: when it matched nothing — which is exactly the
 * signal that somebody else had written — the old code re-read the current
 * version and rewrote the same payload on top of it, up to four times. Two
 * people in one note therefore overwrote each other silently, and a whole
 * burst of typing disappeared with no error anywhere. A miss is a conflict
 * now, and the caller merges.
 */
export async function saveNote(
  session: AppSession,
  note: Note,
  expectedVersion: number,
): Promise<number> {
  const result = await supabase
    .from("notes")
    .update({
      title: note.title,
      body: note.body,
      content: note.content,
      content_version: note.contentVersion,
      legacy_body: note.legacyBody,
      page_icon: note.photo,
      cover: note.cover,
      updated_at: note.updatedAt,
      version: expectedVersion + 1,
    })
    .eq("archive_id", session.archiveId)
    .eq("id", note.id)
    .eq("version", expectedVersion)
    .select("version")
    .maybeSingle();
  fail(result.error);
  if (result.data) {
    noteCache.set(note.id, { version: result.data.version, note });
    return result.data.version;
  }

  throw new NoteConflict(await loadNote(session, note.id));
}

export async function deleteNote(session: AppSession, noteId: string): Promise<void> {
  return deleteNotes(session, [noteId]);
}

/** Emptying the trash is one statement, not one per note. The filter that
 *  matters is `archive_id`, which was already here — the ids only narrow it. */
export async function deleteNotes(session: AppSession, noteIds: string[]): Promise<void> {
  if (noteIds.length === 0) return;
  const result = await supabase
    .from("notes")
    .delete()
    .eq("archive_id", session.archiveId)
    .in("id", noteIds);
  fail(result.error);
  for (const id of noteIds) noteCache.delete(id);
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
      previous.trashedAt !== metadata.trashedAt ||
      previous.archivedAt !== metadata.archivedAt
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
          archived_at: metadata.archivedAt ?? null,
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
