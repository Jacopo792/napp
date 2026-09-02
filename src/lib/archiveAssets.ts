import type { AppSession } from "./session";
import { fail, supabase } from "./supabaseClient";

const OBJECT_BUCKET = "note-images";
const AVATAR_BUCKET = "avatars";

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
  return new Blob([await stored.arrayBuffer()], { type });
}

export const uploadImage = uploadObject;

export function downloadImage(session: AppSession, imageId: string): Promise<Blob> {
  return downloadObject(session, imageId, "image/webp");
}

export interface Profile {
  nickname: string;
  avatarObject: string | null;
  /**
   * Whether this account's archived notes are withheld from the other members.
   *
   * Stored here because the row is the one thing only its own account may
   * write, and read back by `private.archived_note_visible()` — so the answer
   * that reaches another member's client is Postgres's, not this browser's.
   */
  hideArchived: boolean;
}

export async function loadProfile(session: AppSession): Promise<Profile> {
  const result = await supabase
    .from("profiles")
    .select("nickname, avatar_object, hide_archived")
    .eq("user_id", session.userId)
    .maybeSingle();
  fail(result.error);
  const row = result.data as {
    nickname: string | null;
    avatar_object: string | null;
    hide_archived: boolean | null;
  } | null;
  return {
    nickname: row?.nickname ?? "",
    avatarObject: row?.avatar_object ?? null,
    hideArchived: row?.hide_archived ?? false,
  };
}

export async function saveProfile(session: AppSession, profile: Profile): Promise<void> {
  const result = await supabase.from("profiles").upsert(
    {
      user_id: session.userId,
      nickname: profile.nickname,
      avatar_object: profile.avatarObject,
      hide_archived: profile.hideArchived,
    },
    { onConflict: "user_id" },
  );
  fail(result.error);
}

export async function uploadAvatar(session: AppSession, file: Blob): Promise<string> {
  const objectId = crypto.randomUUID();
  const result = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(`${session.userId}/${objectId}`, file, {
      contentType: file.type || "image/webp",
      upsert: false,
    });
  fail(result.error);
  return objectId;
}

export async function downloadAvatar(userId: string, objectId: string): Promise<Blob | null> {
  const result = await supabase.storage.from(AVATAR_BUCKET).download(`${userId}/${objectId}`);
  return result.error ? null : result.data;
}

export async function deleteAvatar(session: AppSession, objectId: string): Promise<void> {
  const result = await supabase.storage
    .from(AVATAR_BUCKET)
    .remove([`${session.userId}/${objectId}`]);
  fail(result.error);
}

/** Everybody who joins this archive joins able to write it. The role column
 *  and `set_archive_member_role` are still in Postgres, and an archive that
 *  ever wants a reader again can reach them — but the choice is not one this
 *  interface asks, because sharing an archive with somebody *is* the decision.
 *  What one member can take back from another is a note, not the archive. */
export async function createArchiveInvite(session: AppSession, email: string): Promise<string> {
  const result = await supabase.rpc("create_archive_invite", {
    archive_id: session.archiveId,
    email,
    role: "editor",
  });
  fail(result.error);
  if (typeof result.data !== "string") throw new Error("The invitation could not be created");
  return result.data;
}

export interface PendingInvite {
  id: string;
  email: string;
  expiresAt: string;
}

export async function loadPendingInvites(session: AppSession): Promise<PendingInvite[]> {
  const result = await supabase
    .from("archive_invites")
    .select("id, email, expires_at")
    .eq("archive_id", session.archiveId)
    .is("claimed_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at");
  fail(result.error);
  return ((result.data ?? []) as { id: string; email: string; expires_at: string }[]).map(
    (row) => ({ id: row.id, email: row.email, expiresAt: row.expires_at }),
  );
}

export async function revokeArchiveInvite(inviteId: string): Promise<void> {
  const result = await supabase.rpc("revoke_archive_invite", { invite_id: inviteId });
  fail(result.error);
}

/** Ends only the caller's membership. The database keeps at least one editor,
 * so this cannot orphan an archive or leave the remaining people read-only. */
export async function leaveArchive(session: AppSession): Promise<void> {
  const result = await supabase.rpc("leave_shared_archive", { archive_id: session.archiveId });
  fail(result.error);
}
