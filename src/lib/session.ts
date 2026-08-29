import { resetArchiveCache, supabase } from "./supabase";

/* The encrypted format is gone. Every note, folder, tag and archive setting is
   a plaintext column and every stored object carries its real content type, so
   there is no longer a key to unwrap, nothing to decrypt on read, and — the
   part that mattered — no raw archive key sitting in sessionStorage for a
   format nothing writes any more. `scripts/` keeps the tools that performed the
   conversion, and `src/lib/crypto.ts` exists for them alone. */

export interface AppSession {
  userId: string;
  email: string;
  archiveId: string;
}

const SESSION_KEY = "napp:archive-session";

type StoredSession = AppSession;

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

    await ensureProfile(data.user.id, address);

    const stored: StoredSession = { userId: data.user.id, email: address, archiveId };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(stored));
    return stored;
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
    return stored;
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
