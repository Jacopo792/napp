import { base64ToBytes, bytesToBase64, importArchiveKey, unwrapArchiveKey } from "./crypto";
import { resetArchiveCache, supabase } from "./supabase";

export interface AppSession {
  userId: string;
  email: string;
  archiveId: string;
  /** Kept only long enough to open data written by the retired encrypted format. */
  legacyKey?: CryptoKey;
}

const SESSION_KEY = "napp:archive-session";

interface StoredSession {
  userId: string;
  email: string;
  archiveId: string;
  rawDek?: string;
}

/** A member with no profile gets one on first sign-in, named after the local
 *  part of their address. It is a starting point, not a claim: the nickname is
 *  theirs to change, and nobody else may write it. */
function defaultNickname(email: string): string {
  const local = email.split("@")[0] ?? "";
  const cleaned = local.replace(/[._-]+/g, " ").trim();
  if (!cleaned) return "";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

async function ensureProfile(userId: string, email: string): Promise<void> {
  const existing = await supabase
    .from("profiles")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (existing.error || existing.data) return;
  // A missing profile must never block sign-in.
  await supabase.from("profiles").insert({ user_id: userId, nickname: defaultNickname(email) });
}

export async function authenticate(email: string, password: string): Promise<AppSession> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new Error("Email or password is incorrect");
  try {
    const { data: memberships, error: membershipError } = await supabase
      .from("archive_members")
      .select("archive_id")
      .eq("user_id", data.user.id)
      .limit(2);
    if (membershipError) throw new Error(membershipError.message);
    if (!memberships || memberships.length !== 1) {
      throw new Error("This account is not connected to the archive");
    }
    const archiveId = memberships[0].archive_id;
    const address = data.user.email ?? email;

    // Old rows and attachments may still need one last local decrypt. Failure
    // is deliberately non-fatal: account authentication is now the boundary.
    let rawDek: Uint8Array | undefined;
    const legacy = await supabase
      .from("vault_keys")
      .select("wrapped_dek, kdf_salt, kdf_iterations")
      .eq("user_id", data.user.id)
      .eq("archive_id", archiveId)
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
    await ensureProfile(data.user.id, address);

    const stored: StoredSession = {
      userId: data.user.id,
      email: address,
      archiveId,
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
    return {
      ...stored,
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
