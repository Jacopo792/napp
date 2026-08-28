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

const url =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ??
  "https://uftkmoboidcshzoudwzj.supabase.co";
const publishableKey =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ??
  "sb_publishable_X3etQwXMht2ZVDnztfBDPQ_LLc_cG4m";

export const supabase = createClient(url, publishableKey, {
  auth: {
    storage: typeof window === "undefined" ? undefined : window.sessionStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

type Owner = "u1" | "u2";

interface NoteRow {
  id: string;
  owner: Owner;
  ciphertext: string;
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

export interface ArchiveSnapshot {
  entries: NoteEntry[];
  metas: Record<Owner, Meta>;
}

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export async function loadArchive(session: AppSession): Promise<ArchiveSnapshot> {
  const archiveId = session.archiveId;
  const [notesResult, foldersResult, tagsResult, noteTagsResult, archiveResult] = await Promise.all(
    [
      supabase.from("notes").select("*").eq("archive_id", archiveId),
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

  const entries = await Promise.all(
    noteRows.map(async (row) => {
      const decrypted = await decryptNote(row.ciphertext, session.key);
      const note: Note = {
        ...decrypted,
        id: row.id,
        owner: row.owner,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
      return { note, version: row.version } satisfies NoteEntry;
    }),
  );

  const foldersByOwner: Record<Owner, Folder[]> = { u1: [], u2: [] };
  const decryptedFolders = await Promise.all(
    folderRows.map(async (row) => {
      const { name } = await decryptFolder(row.ciphertext, session.key);
      return { owner: row.owner, folder: { id: row.id, name } satisfies Folder };
    }),
  );
  for (const item of decryptedFolders) foldersByOwner[item.owner].push(item.folder);

  const tagsByOwner: Record<Owner, Tag[]> = { u1: [], u2: [] };
  const decryptedTags = await Promise.all(
    tagRows.map(async (row) => {
      const { name } = await decryptTag(row.ciphertext, session.key);
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
    if (result.data) return result.data.version;

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
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

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

  if (owner === "u1" && before.partnerName !== after.partnerName) {
    const settings = await encryptJson(session.key, { partnerName: after.partnerName });
    fail(
      (
        await supabase
          .from("archives")
          .update({ settings_ciphertext: settings })
          .eq("id", archiveId)
      ).error,
    );
  }

  for (const { folder, position } of afterFolders.values()) {
    const previous = beforeFolders.get(folder.id);
    if (previous && sameJson(previous, { folder, position })) continue;
    const ciphertext = await encryptFolder(folder, session.key);
    fail(
      (
        await supabase.from("folders").upsert({
          id: folder.id,
          archive_id: archiveId,
          owner,
          ciphertext,
          position,
        })
      ).error,
    );
  }

  for (const tag of afterTags.values()) {
    const previous = beforeTags.get(tag.id);
    if (previous && sameJson(previous, tag)) continue;
    const ciphertext = await encryptTag(tag, session.key);
    fail(
      (
        await supabase.from("tags").upsert({
          id: tag.id,
          archive_id: archiveId,
          owner,
          ciphertext,
          color: tag.color,
        })
      ).error,
    );
  }

  for (const metadata of afterNotes.values()) {
    const previous = beforeNotes.get(metadata.id);
    if (
      !previous ||
      previous.folderId !== metadata.folderId ||
      previous.pinned !== metadata.pinned ||
      previous.trashedAt !== metadata.trashedAt
    ) {
      fail(
        (
          await supabase
            .from("notes")
            .update({
              folder_id: metadata.folderId,
              pinned: metadata.pinned ?? false,
              trashed_at: metadata.trashedAt ?? null,
            })
            .eq("archive_id", archiveId)
            .eq("id", metadata.id)
        ).error,
      );
    }
    if (!previous || !sameJson(previous.tagIds, metadata.tagIds)) {
      fail(
        (
          await supabase
            .from("note_tags")
            .delete()
            .eq("archive_id", archiveId)
            .eq("note_id", metadata.id)
        ).error,
      );
      if (metadata.tagIds.length > 0) {
        fail(
          (
            await supabase.from("note_tags").insert(
              metadata.tagIds.map((tagId) => ({
                note_id: metadata.id,
                tag_id: tagId,
                archive_id: archiveId,
                owner,
              })),
            )
          ).error,
        );
      }
    }
  }

  for (const folderId of beforeFolders.keys()) {
    if (!afterFolders.has(folderId)) {
      fail(
        (await supabase.from("folders").delete().eq("id", folderId).eq("archive_id", archiveId))
          .error,
      );
    }
  }
  for (const tagId of beforeTags.keys()) {
    if (!afterTags.has(tagId)) {
      fail(
        (await supabase.from("tags").delete().eq("id", tagId).eq("archive_id", archiveId)).error,
      );
    }
  }
}

const IMAGE_BUCKET = "note-images";

export async function uploadEncryptedImage(
  session: AppSession,
  imageId: string,
  blob: Blob,
): Promise<void> {
  const encrypted = await encryptBytes(session.key, new Uint8Array(await blob.arrayBuffer()));
  const result = await supabase.storage
    .from(IMAGE_BUCKET)
    .upload(`${session.archiveId}/${imageId}`, encrypted, {
      contentType: "application/octet-stream",
      upsert: false,
    });
  fail(result.error);
}

export async function downloadEncryptedImage(session: AppSession, imageId: string): Promise<Blob> {
  const result = await supabase.storage
    .from(IMAGE_BUCKET)
    .download(`${session.archiveId}/${imageId}`);
  fail(result.error);
  const plaintext = await decryptBytes(
    session.key,
    new Uint8Array(await result.data!.arrayBuffer()),
  );
  return new Blob([plaintext.slice().buffer as ArrayBuffer], { type: "image/webp" });
}
