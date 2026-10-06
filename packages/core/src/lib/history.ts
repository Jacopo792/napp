/* What a note used to say — the half of its history that talks to the archive.
 *
 * The collaboration server writes a version after each stretch of somebody's
 * writing (see `packages/collab-server/src/versions.ts`); a member may name a
 * moment themselves. Row level security on `note_versions` reads them under
 * the same rule as the note, and lets a browser insert only a named version
 * in its own name. Nothing here decides anything.
 *
 * The list is light — who, when, how much — and a version's words are fetched
 * only when somebody opens it: a thesis has hundreds of versions, and each one
 * is the whole chapter. */
import type { JSONContent } from "@tiptap/core";
import type { AppSession } from "./session";
import { fail, supabase } from "./supabaseClient";

export type VersionBody = { title: string; content: JSONContent };

export interface NoteVersion {
  id: string;
  createdAt: string;
  authorIds: string[];
  title: string;
  label: string | null;
  wordsAdded: number | null;
  wordsRemoved: number | null;
}

interface VersionRow {
  id: string;
  created_at: string;
  author_ids: string[];
  title: string;
  label: string | null;
  words_added: number | null;
  words_removed: number | null;
}

const LIST = "id, created_at, author_ids, title, label, words_added, words_removed";

const toVersion = (row: VersionRow): NoteVersion => ({
  id: row.id,
  createdAt: row.created_at,
  authorIds: row.author_ids,
  title: row.title,
  label: row.label,
  wordsAdded: row.words_added,
  wordsRemoved: row.words_removed,
});

/* ponytail: the newest 300 and no paging. A note written for a year at ten
   minutes a stretch passes that; page by `created_at` when one does. */
export async function loadVersions(session: AppSession, noteId: string): Promise<NoteVersion[]> {
  const result = await supabase
    .from("note_versions")
    .select(LIST)
    .eq("archive_id", session.archiveId)
    .eq("note_id", noteId)
    .order("created_at", { ascending: false })
    .limit(300);
  fail(result.error);
  return ((result.data ?? []) as VersionRow[]).map(toVersion);
}

export async function loadVersionContent(versionId: string): Promise<VersionBody> {
  const result = await supabase
    .from("note_versions")
    .select("title, content")
    .eq("id", versionId)
    .single();
  fail(result.error);
  return result.data as VersionBody;
}

/** A moment worth finding again, under the caller's name — the insert policy
 *  refuses any other. */
export async function nameVersion(
  session: AppSession,
  noteId: string,
  label: string,
  current: VersionBody,
): Promise<NoteVersion> {
  const trimmed = label.trim().slice(0, 80);
  if (!trimmed) throw new Error("A version needs a name");
  const result = await supabase
    .from("note_versions")
    .insert({
      archive_id: session.archiveId,
      note_id: noteId,
      author_ids: [session.userId],
      title: current.title,
      content: current.content,
      label: trimmed,
    })
    .select(LIST)
    .single();
  fail(result.error);
  return toVersion(result.data as VersionRow);
}

export interface Contribution {
  id: string;
  noteId: string;
  createdAt: string;
  label: string | null;
  wordsAdded: number | null;
  wordsRemoved: number | null;
}

/** What one person has changed across the archive, newest first: every
 *  version they had a hand in. Light, like the list — no words. Row level
 *  security already leaves out the notes this reader may not see. */
export async function loadContributions(
  session: AppSession,
  userId: string,
): Promise<Contribution[]> {
  const result = await supabase
    .from("note_versions")
    .select("id, note_id, created_at, label, words_added, words_removed")
    .eq("archive_id", session.archiveId)
    .contains("author_ids", [userId])
    .order("created_at", { ascending: false })
    .limit(200);
  fail(result.error);
  return (
    (result.data ?? []) as {
      id: string;
      note_id: string;
      created_at: string;
      label: string | null;
      words_added: number | null;
      words_removed: number | null;
    }[]
  ).map((row) => ({
    id: row.id,
    noteId: row.note_id,
    createdAt: row.created_at,
    label: row.label,
    wordsAdded: row.words_added,
    wordsRemoved: row.words_removed,
  }));
}

export type FolderVersion = NoteVersion & { noteId: string };

/** The latest versions across a set of notes — a folder and what is under it.
 *  ponytail: one `in` list in the URL; a folder of several hundred notes
 *  outgrows it, and then this is an RPC that takes the folder id. */
export async function loadFolderVersions(
  session: AppSession,
  noteIds: string[],
): Promise<FolderVersion[]> {
  if (noteIds.length === 0) return [];
  const result = await supabase
    .from("note_versions")
    .select(`note_id, ${LIST}`)
    .eq("archive_id", session.archiveId)
    .in("note_id", noteIds)
    .order("created_at", { ascending: false })
    .limit(200);
  fail(result.error);
  return ((result.data ?? []) as (VersionRow & { note_id: string })[]).map((row) => ({
    ...toVersion(row),
    noteId: row.note_id,
  }));
}

export type NamedVersion = NoteVersion & { noteId: string };

/** Every moment somebody named, across the archive — what ⌘K finds by its
 *  label. Read under the same policy as the notes, so a hidden archived note
 *  keeps its named versions hidden too. */
export async function loadNamedVersions(session: AppSession): Promise<NamedVersion[]> {
  const result = await supabase
    .from("note_versions")
    .select(`note_id, ${LIST}`)
    .eq("archive_id", session.archiveId)
    .not("label", "is", null)
    .order("created_at", { ascending: false })
    .limit(200);
  fail(result.error);
  return ((result.data ?? []) as (VersionRow & { note_id: string })[]).map((row) => ({
    ...toVersion(row),
    noteId: row.note_id,
  }));
}
