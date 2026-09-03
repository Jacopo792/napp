/* Remarks about a passage — the half that talks to the archive.
 *
 * The passage itself is held by a mark in the note's own Yjs document (see
 * `CommentAnchor` in `features/editor/lib/content.ts`), so what is being
 * commented on moves with the words and converges the way they do. This module
 * only knows the other half: who wrote the remark, when, and what it says.
 *
 * Nothing here decides anything. `note_comments` carries the same row level
 * security the notes do — members read, editors write, only the author may
 * delete — so a filter in this file is a convenience and the database is the
 * boundary. */
import type { AppSession } from "./session";
import { fail, supabase } from "./supabaseClient";
import {
  toComment,
  type ArchiveComment,
  type CommentRow,
  type NoteComment,
} from "./commentThreads";

export { notesWithOpenRemarks, threadsOf, unreadRemarks } from "./commentThreads";
export type { ArchiveComment, NoteComment, CommentThread, RemarksSeen } from "./commentThreads";

export async function loadComments(session: AppSession, noteId: string): Promise<NoteComment[]> {
  const result = await supabase
    .from("note_comments")
    .select("id, thread_id, author_id, body, created_at, resolved_at")
    .eq("archive_id", session.archiveId)
    .eq("note_id", noteId)
    .order("created_at");
  fail(result.error);
  return ((result.data ?? []) as CommentRow[]).map(toComment);
}

/** Open a thread, or reply to one. The author is the caller and the database
 *  refuses any other — `author_id = auth.uid()` is in the insert policy, not
 *  merely in this call. */
export async function addComment(
  session: AppSession,
  noteId: string,
  threadId: string,
  body: string,
): Promise<NoteComment> {
  const trimmed = body.trim();
  if (!trimmed) throw new Error("A comment needs something in it");
  const result = await supabase
    .from("note_comments")
    .insert({
      archive_id: session.archiveId,
      note_id: noteId,
      thread_id: threadId,
      author_id: session.userId,
      body: trimmed,
    })
    .select("id, thread_id, author_id, body, created_at, resolved_at")
    .single();
  fail(result.error);
  return toComment(result.data as CommentRow);
}

/** Dealt with, or not. Anyone who may edit the note may say so: whether a
 *  remark still stands is about the note, not about who raised it. */
export async function resolveThread(
  session: AppSession,
  noteId: string,
  threadId: string,
  resolved: boolean,
): Promise<void> {
  const result = await supabase
    .from("note_comments")
    .update({ resolved_at: resolved ? new Date().toISOString() : null })
    .eq("archive_id", session.archiveId)
    .eq("note_id", noteId)
    .eq("thread_id", threadId);
  fail(result.error);
}

/** Only your own, and the database is what enforces that. */
export async function deleteComment(session: AppSession, commentId: string): Promise<void> {
  const result = await supabase
    .from("note_comments")
    .delete()
    .eq("archive_id", session.archiveId)
    .eq("id", commentId);
  fail(result.error);
}

/** Only the author may change the words. RLS admits editors because the same
 *  UPDATE policy also resolves threads; the database trigger distinguishes an
 *  author's edit from somebody else changing resolution state. */
export async function updateComment(
  session: AppSession,
  commentId: string,
  body: string,
): Promise<NoteComment> {
  const trimmed = body.trim();
  if (!trimmed) throw new Error("A comment needs something in it");
  const result = await supabase
    .from("note_comments")
    .update({ body: trimmed })
    .eq("archive_id", session.archiveId)
    .eq("id", commentId)
    .eq("author_id", session.userId)
    .select("id, thread_id, author_id, body, created_at, resolved_at")
    .single();
  fail(result.error);
  return toComment(result.data as CommentRow);
}

/** Every remark in the archive, so the interface can say that one is waiting
 *  without opening the note it is on. Bounded rather than complete: what this
 *  answers is "is there anything new", and the note's own panel is where a
 *  conversation is actually read. */
export async function loadArchiveComments(session: AppSession): Promise<ArchiveComment[]> {
  const result = await supabase
    .from("note_comments")
    .select("id, note_id, thread_id, author_id, body, created_at, resolved_at")
    .eq("archive_id", session.archiveId)
    .order("created_at", { ascending: false })
    .limit(300);
  fail(result.error);
  return ((result.data ?? []) as (CommentRow & { note_id: string })[]).map((row) => ({
    ...toComment(row),
    noteId: row.note_id,
  }));
}
