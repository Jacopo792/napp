import { base64ToBytes, bytesToBase64, importArchiveKey, unwrapArchiveKey } from "./crypto";
import { supabase } from "./supabase";

export interface AppSession {
  userId: string;
  email: string;
  archiveId: string;
  key: CryptoKey;
}

export interface PendingUnlock {
  userId: string;
  email: string;
}

const SESSION_KEY = "napp:archive-session";

interface StoredSession {
  userId: string;
  email: string;
  archiveId: string;
  rawDek: string;
}

export async function authenticate(email: string, password: string): Promise<PendingUnlock> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new Error("Email or password is incorrect");
  return { userId: data.user.id, email: data.user.email ?? email };
}

export async function unlockSession(passphrase: string): Promise<AppSession> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("Sign in again to unlock the archive");

  const { data, error } = await supabase
    .from("vault_keys")
    .select("archive_id, wrapped_dek, kdf_salt, kdf_iterations")
    .eq("user_id", userData.user.id)
    .limit(2);
  if (error) throw new Error(error.message);
  if (!data || data.length !== 1) throw new Error("This account is not connected to the archive");

  const row = data[0];
  const rawDek = await unwrapArchiveKey(
    {
      wrappedDek: row.wrapped_dek,
      kdfSalt: row.kdf_salt,
      kdfIterations: row.kdf_iterations,
    },
    passphrase,
  );
  const stored: StoredSession = {
    userId: userData.user.id,
    email: userData.user.email ?? "",
    archiveId: row.archive_id,
    rawDek: bytesToBase64(rawDek),
  };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(stored));
  return { ...stored, key: await importArchiveKey(rawDek) };
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
  await supabase.auth.signOut({ scope: "local" });
}
