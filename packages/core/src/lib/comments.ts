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
  type Reaction,
  type CommentRow,
  type NoteComment,
} from "./commentThreads";

export { lastOpenRemarks, notesWithOpenRemarks, threadsOf, unreadRemarks } from "./commentThreads";
export type {
  ArchiveComment,
  NoteComment,
  CommentThread,
  Reaction,
  RemarksSeen,
} from "./commentThreads";

const COLUMNS = "id, thread_id, author_id, body, created_at, resolved_at, mentions, assignee_id";

export async function loadComments(session: AppSession, noteId: string): Promise<NoteComment[]> {
  const result = await supabase
    .from("note_comments")
    .select(COLUMNS)
    .eq("archive_id", session.archiveId)
    .eq("note_id", noteId)
    .order("created_at");
  fail(result.error);
  return ((result.data ?? []) as CommentRow[]).map(toComment);
}

/** Which threads on a note have had anything said in them. A passage whose
 *  thread is not here was anchored and then abandoned before its first remark. */
export async function loadThreadIds(session: AppSession, noteId: string): Promise<Set<string>> {
  const result = await supabase
    .from("note_comments")
    .select("thread_id")
    .eq("archive_id", session.archiveId)
    .eq("note_id", noteId);
  fail(result.error);
  return new Set(((result.data ?? []) as { thread_id: string }[]).map((row) => row.thread_id));
}

/** Open a thread, or reply to one. The author is the caller and the database
 *  refuses any other — `author_id = auth.uid()` is in the insert policy, not
 *  merely in this call. */
export async function addComment(
  session: AppSession,
  noteId: string,
  threadId: string,
  body: string,
  mentions: string[] = [],
  assigneeId: string | null = null,
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
      mentions,
      // A reply carries the thread's assignee, so every row agrees on it.
      assignee_id: assigneeId,
    })
    .select(COLUMNS)
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

/** Hand a thread to a member, or (null) to nobody. Like resolving, anyone
 *  who may edit the note may do it, and every row of the thread is written. */
export async function assignThread(
  session: AppSession,
  noteId: string,
  threadId: string,
  assigneeId: string | null,
): Promise<void> {
  const result = await supabase
    .from("note_comments")
    .update({ assignee_id: assigneeId })
    .eq("archive_id", session.archiveId)
    .eq("note_id", noteId)
    .eq("thread_id", threadId);
  fail(result.error);
}

export async function loadReactions(session: AppSession, noteId: string): Promise<Reaction[]> {
  const result = await supabase
    .from("note_comment_reactions")
    .select("comment_id, user_id, emoji")
    .eq("archive_id", session.archiveId)
    .eq("note_id", noteId)
    .order("created_at");
  fail(result.error);
  return ((result.data ?? []) as { comment_id: string; user_id: string; emoji: string }[]).map(
    (row) => ({ commentId: row.comment_id, userId: row.user_id, emoji: row.emoji }),
  );
}

/** Your own reaction, given or taken back. Nobody else's can be: the policy
 *  holds both directions to the caller's own name. */
export async function setReaction(
  session: AppSession,
  noteId: string,
  commentId: string,
  emoji: string,
  on: boolean,
): Promise<void> {
  const result = on
    ? await supabase.from("note_comment_reactions").insert({
        comment_id: commentId,
        archive_id: session.archiveId,
        note_id: noteId,
        user_id: session.userId,
        emoji,
      })
    : await supabase
        .from("note_comment_reactions")
        .delete()
        .eq("comment_id", commentId)
        .eq("user_id", session.userId)
        .eq("emoji", emoji);
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
  mentions: string[],
): Promise<NoteComment> {
  const trimmed = body.trim();
  if (!trimmed) throw new Error("A comment needs something in it");
  const result = await supabase
    .from("note_comments")
    .update({ body: trimmed, mentions })
    .eq("archive_id", session.archiveId)
    .eq("id", commentId)
    .eq("author_id", session.userId)
    .select(COLUMNS)
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
    .select(`note_id, ${COLUMNS}`)
    .eq("archive_id", session.archiveId)
    .order("created_at", { ascending: false })
    .limit(300);
  fail(result.error);
  return ((result.data ?? []) as (CommentRow & { note_id: string })[]).map((row) => ({
    ...toComment(row),
    noteId: row.note_id,
  }));
}
