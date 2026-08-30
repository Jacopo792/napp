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
}

export async function loadProfile(session: AppSession): Promise<Profile> {
  const result = await supabase
    .from("profiles")
    .select("nickname, avatar_object")
    .eq("user_id", session.userId)
    .maybeSingle();
  fail(result.error);
  const row = result.data as { nickname: string | null; avatar_object: string | null } | null;
  return { nickname: row?.nickname ?? "", avatarObject: row?.avatar_object ?? null };
}

export async function saveProfile(session: AppSession, profile: Profile): Promise<void> {
  const result = await supabase
    .from("profiles")
    .upsert(
      { user_id: session.userId, nickname: profile.nickname, avatar_object: profile.avatarObject },
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

export async function createArchiveInvite(
  session: AppSession,
  email: string,
  role: "editor" | "viewer",
): Promise<string> {
  const result = await supabase.rpc("create_archive_invite", {
    archive_id: session.archiveId,
    email,
    role,
  });
  fail(result.error);
  if (typeof result.data !== "string") throw new Error("The invitation could not be created");
  return result.data;
}

export interface PendingInvite {
  id: string;
  email: string;
  role: "editor" | "viewer";
  expiresAt: string;
}

export async function loadPendingInvites(session: AppSession): Promise<PendingInvite[]> {
  const result = await supabase
    .from("archive_invites")
    .select("id, email, role, expires_at")
    .eq("archive_id", session.archiveId)
    .is("claimed_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at");
  fail(result.error);
  return (
    (result.data ?? []) as {
      id: string;
      email: string;
      role: "editor" | "viewer";
      expires_at: string;
    }[]
  ).map((row) => ({ id: row.id, email: row.email, role: row.role, expiresAt: row.expires_at }));
}

export async function revokeArchiveInvite(inviteId: string): Promise<void> {
  const result = await supabase.rpc("revoke_archive_invite", { invite_id: inviteId });
  fail(result.error);
}

export async function setArchiveMemberRole(
  session: AppSession,
  userId: string,
  role: "editor" | "viewer",
): Promise<void> {
  const result = await supabase.rpc("set_archive_member_role", {
    archive_id: session.archiveId,
    user_id: userId,
    role,
  });
  fail(result.error);
}
