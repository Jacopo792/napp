import { base64ToBytes, bytesToBase64, importArchiveKey, unwrapArchiveKey } from "./crypto";
import { resetArchiveCache, supabase } from "./supabase";

export type OwnerLabel = "u1" | "u2";

export interface AppSession {
  userId: string;
  email: string;
  archiveId: string;
  /**
   * The organisational label carried by this membership row, or null for a
   * member who has no personal view of their own. It is interface metadata:
   * RLS authorizes through `archive_members` and nothing else.
   */
  memberOwner: OwnerLabel | null;
  /** The view the app opens on. An unlabelled member starts on u1 and can
      still switch freely, exactly like a labelled one. */
  defaultView: OwnerLabel;
  /** Kept only long enough to open data written by the retired encrypted format. */
  legacyKey?: CryptoKey;
}

const SESSION_KEY = "napp:archive-session";

interface StoredSession {
  userId: string;
  email: string;
  archiveId: string;
  memberOwner: OwnerLabel | null;
  defaultView: OwnerLabel;
  rawDek?: string;
  /** Written by builds that predate the unlabelled-member support. */
  owner?: OwnerLabel;
}

function isOwnerLabel(value: unknown): value is OwnerLabel {
  return value === "u1" || value === "u2";
}

async function readMembership(
  userId: string,
  archiveId: string,
): Promise<{ memberOwner: OwnerLabel | null; defaultView: OwnerLabel }> {
  const { data, error } = await supabase
    .from("archive_members")
    .select("owner")
    .eq("archive_id", archiveId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) throw new Error("This account is not connected to the archive");
  const memberOwner = isOwnerLabel(data.owner) ? data.owner : null;
  return { memberOwner, defaultView: memberOwner ?? "u1" };
}

export async function authenticate(email: string, password: string): Promise<AppSession> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new Error("Email or password is incorrect");
  try {
    const { data: memberships, error: membershipError } = await supabase
      .from("archive_members")
      .select("archive_id, owner")
      .eq("user_id", data.user.id)
      .limit(2);
    if (membershipError) throw new Error(membershipError.message);
    if (!memberships || memberships.length !== 1) {
      throw new Error("This account is not connected to the archive");
    }
    const membership = memberships[0];
    const memberOwner = isOwnerLabel(membership.owner) ? membership.owner : null;

    // Old rows and attachments may still need one last local decrypt. Failure
    // is deliberately non-fatal: account authentication is now the boundary.
    let rawDek: Uint8Array | undefined;
    const legacy = await supabase
      .from("vault_keys")
      .select("wrapped_dek, kdf_salt, kdf_iterations")
      .eq("user_id", data.user.id)
      .eq("archive_id", membership.archive_id)
      .maybeSingle();
    if (legacy.data) {
      try {
        rawDek = await unwrapArchiveKey(
          {
            wrappedDek: legacy.data.wrapped_dek,
            kdfSalt: legacy.data.kdf_salt,
            kdfIterations: legacy.data.kdf_iterations,
          },
          password,
        );
      } catch {
        rawDek = undefined;
      }
    }
    const stored: StoredSession = {
      userId: data.user.id,
      email: data.user.email ?? email,
      archiveId: membership.archive_id,
      memberOwner,
      defaultView: memberOwner ?? "u1",
      rawDek: rawDek ? bytesToBase64(rawDek) : undefined,
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(stored));
    return { ...stored, legacyKey: rawDek ? await importArchiveKey(rawDek) : undefined };
  } catch (reason) {
    sessionStorage.removeItem(SESSION_KEY);
    resetArchiveCache();
    await supabase.auth.signOut({ scope: "local" });
    if (reason instanceof Error && reason.message.includes("not connected")) throw reason;
    throw new Error("Could not open this account");
  }
}

export async function restoreSession(): Promise<AppSession | null> {
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const stored = JSON.parse(raw) as StoredSession;
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user || data.user.id !== stored.userId) throw new Error("Session expired");
    const membership = isOwnerLabel(stored.defaultView)
      ? { memberOwner: stored.memberOwner ?? stored.owner ?? null, defaultView: stored.defaultView }
      : await readMembership(stored.userId, stored.archiveId);
    const refreshed = { ...stored, ...membership };
    delete refreshed.owner;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(refreshed));
    return {
      ...refreshed,
      legacyKey: stored.rawDek ? await importArchiveKey(base64ToBytes(stored.rawDek)) : undefined,
    };
  } catch {
    sessionStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export async function clearSession(): Promise<void> {
  sessionStorage.removeItem(SESSION_KEY);
  resetArchiveCache();
  await supabase.auth.signOut({ scope: "local" });
}
