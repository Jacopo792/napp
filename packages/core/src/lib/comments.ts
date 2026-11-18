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
  type NoteRef,
} from "./commentThreads";

export { notesWithOpenRemarks, threadsOf, unreadRemarks } from "./commentThreads";
export type {
  ArchiveComment,
  NoteComment,
  NoteRef,
  CommentThread,
  Reaction,
  RemarksSeen,
} from "./commentThreads";

const COLUMNS =
  "id, thread_id, author_id, body, created_at, resolved_at, mentions, assignee_id, bubble, reply_to";

/* The archive's general chat is the same conversation with no note under it:
   its own tables (`archive_messages`), read here through the same calls with
   `noteId` null, and shaped into the same rows. Its thread is the archive. */
const GENERAL_COLUMNS = "id, author_id, body, created_at, mentions, bubble, reply_to, refs";

type GeneralRow = Omit<CommentRow, "thread_id" | "resolved_at" | "assignee_id">;

/* The newest messages, read newest-first and put back in order. Read oldest
   first, a conversation past the API's row cap (1,000) kept returning its
   first thousand and the new ones never appeared.
   ponytail: no "load earlier" — older than this is not shown; page by
   created_at when a chat outgrows it. */
const CHAT_WINDOW = 800;

const fromGeneral = (session: AppSession, row: GeneralRow): NoteComment =>
  toComment({ ...row, thread_id: session.archiveId, resolved_at: null, assignee_id: null });

export async function loadComments(
  session: AppSession,
  noteId: string | null,
): Promise<NoteComment[]> {
  if (noteId === null) {
    const general = await supabase
      .from("archive_messages")
      .select(GENERAL_COLUMNS)
      .eq("archive_id", session.archiveId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(CHAT_WINDOW);
    fail(general.error);
    return ((general.data ?? []) as GeneralRow[]).reverse().map((row) => fromGeneral(session, row));
  }
  const result = await supabase
    .from("note_comments")
    .select(COLUMNS)
    .eq("archive_id", session.archiveId)
    .eq("note_id", noteId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(CHAT_WINDOW);
  fail(result.error);
  return ((result.data ?? []) as CommentRow[]).reverse().map(toComment);
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
  noteId: string | null,
  threadId: string,
  body: string,
  mentions: string[] = [],
  assigneeId: string | null = null,
  bubble: string | null = null,
  replyTo: string | null = null,
  /** For the general chat only: the notes the message is about. */
  refs: NoteRef[] = [],
): Promise<NoteComment> {
  const trimmed = body.trim();
  if (!trimmed) throw new Error("A comment needs something in it");
  if (noteId === null) {
    const general = await supabase
      .from("archive_messages")
      .insert({
        archive_id: session.archiveId,
        author_id: session.userId,
        body: trimmed,
        mentions,
        bubble,
        reply_to: replyTo,
        refs,
      })
      .select(GENERAL_COLUMNS)
      .single();
    fail(general.error);
    return fromGeneral(session, general.data as GeneralRow);
  }
  const result = await supabase
    .from("note_comments")
    .insert({
      bubble,
      reply_to: replyTo,
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

export async function loadReactions(
  session: AppSession,
  noteId: string | null,
): Promise<Reaction[]> {
  if (noteId === null) {
    const general = await supabase
      .from("archive_message_reactions")
      .select("message_id, user_id, emoji")
      .eq("archive_id", session.archiveId)
      /* Newest first, so a cap drops the oldest reactions, not today's. */
      .order("created_at", { ascending: false })
      .limit(1000);
    fail(general.error);
    return ((general.data ?? []) as { message_id: string; user_id: string; emoji: string }[])
      .reverse()
      .map((row) => ({ commentId: row.message_id, userId: row.user_id, emoji: row.emoji }));
  }
  const result = await supabase
    .from("note_comment_reactions")
    .select("comment_id, user_id, emoji")
    .eq("archive_id", session.archiveId)
    .eq("note_id", noteId)
    .order("created_at", { ascending: false })
    .limit(1000);
  fail(result.error);
  return ((result.data ?? []) as { comment_id: string; user_id: string; emoji: string }[])
    .reverse()
    .map((row) => ({ commentId: row.comment_id, userId: row.user_id, emoji: row.emoji }));
}

/** Your own reaction, given or taken back. Nobody else's can be: the policy
 *  holds both directions to the caller's own name. */
export async function setReaction(
  session: AppSession,
  noteId: string | null,
  commentId: string,
  emoji: string,
  on: boolean,
): Promise<void> {
  if (noteId === null) {
    const general = on
      ? await supabase.from("archive_message_reactions").insert({
          message_id: commentId,
          archive_id: session.archiveId,
          user_id: session.userId,
          emoji,
        })
      : await supabase
          .from("archive_message_reactions")
          .delete()
          .eq("message_id", commentId)
          .eq("user_id", session.userId)
          .eq("emoji", emoji);
    fail(general.error);
    return;
  }
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
export async function deleteComment(
  session: AppSession,
  commentId: string,
  /** Set for a message in the archive's general chat. */
  general = false,
): Promise<void> {
  const result = await supabase
    .from(general ? "archive_messages" : "note_comments")
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
  general = false,
): Promise<NoteComment> {
  const trimmed = body.trim();
  if (!trimmed) throw new Error("A comment needs something in it");
  if (general) {
    const edited = await supabase
      .from("archive_messages")
      .update({ body: trimmed, mentions })
      .eq("archive_id", session.archiveId)
      .eq("id", commentId)
      .eq("author_id", session.userId)
      .select(GENERAL_COLUMNS)
      .single();
    fail(edited.error);
    return fromGeneral(session, edited.data as GeneralRow);
  }
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

/** The general chat's recent messages, shaped like remarks whose "note" is the
 *  archive — so its unread line is `RemarksSeen[archiveId]` and the same
 *  `unreadRemarks` counts it. Bounded for the same reason as above. */
export async function loadRecentGeneral(session: AppSession): Promise<ArchiveComment[]> {
  const result = await supabase
    .from("archive_messages")
    .select(GENERAL_COLUMNS)
    .eq("archive_id", session.archiveId)
    .order("created_at", { ascending: false })
    .limit(300);
  fail(result.error);
  return ((result.data ?? []) as GeneralRow[]).map((row) => ({
    ...fromGeneral(session, row),
    noteId: session.archiveId,
  }));
}
