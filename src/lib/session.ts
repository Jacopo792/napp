import { base64ToBytes, bytesToBase64, importArchiveKey, unwrapArchiveKey } from "./crypto";
import { resetArchiveCache, supabase } from "./supabase";

export interface AppSession {
  userId: string;
  email: string;
  archiveId: string;
  key: CryptoKey;
}

const SESSION_KEY = "napp:archive-session";

interface StoredSession {
  userId: string;
  email: string;
  archiveId: string;
  rawDek: string;
}

export async function authenticate(email: string, password: string): Promise<AppSession> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new Error("Email or password is incorrect");
  try {
    const { data: rows, error: keyError } = await supabase
      .from("vault_keys")
      .select("archive_id, wrapped_dek, kdf_salt, kdf_iterations")
      .eq("user_id", data.user.id)
      .limit(2);
    if (keyError) throw new Error(keyError.message);
    if (!rows || rows.length !== 1) {
      throw new Error("This account is not connected to the archive");
    }

    const row = rows[0];
    const rawDek = await unwrapArchiveKey(
      {
        wrappedDek: row.wrapped_dek,
        kdfSalt: row.kdf_salt,
        kdfIterations: row.kdf_iterations,
      },
      password,
    );
    const stored: StoredSession = {
      userId: data.user.id,
      email: data.user.email ?? email,
      archiveId: row.archive_id,
      rawDek: bytesToBase64(rawDek),
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(stored));
    return { ...stored, key: await importArchiveKey(rawDek) };
  } catch (reason) {
    sessionStorage.removeItem(SESSION_KEY);
    resetArchiveCache();
    await supabase.auth.signOut({ scope: "local" });
    if (reason instanceof Error && reason.message.includes("not connected")) throw reason;
    throw new Error("Email or password could not unlock this archive");
  }
}

export async function restoreSession(): Promise<AppSession | null> {
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const stored = JSON.parse(raw) as StoredSession;
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user || data.user.id !== stored.userId) throw new Error("Session expired");
    return { ...stored, key: await importArchiveKey(base64ToBytes(stored.rawDek)) };
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
