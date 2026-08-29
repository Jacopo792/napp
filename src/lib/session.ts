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

export interface RegistrationResult {
  session: AppSession | null;
  confirmationRequired: boolean;
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
    const membershipResult = await supabase
      .from("archive_members")
      .select("archive_id")
      .eq("user_id", data.user.id)
      .limit(2);
    let memberships = membershipResult.data;
    const membershipError = membershipResult.error;
    if (membershipError) throw new Error(membershipError.message);

    if (!memberships || memberships.length === 0) {
      const bootstrap = await supabase.rpc("ensure_personal_archive");
      if (bootstrap.error || !bootstrap.data) {
        throw new Error(bootstrap.error?.message ?? "Could not create an archive for this account");
      }
      memberships = [{ archive_id: bootstrap.data as string }];
    }

    if (memberships.length !== 1) {
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

/** Registration deliberately gives the same completion message for a new or
 * existing address. With confirmations enabled Supabase also returns an
 * indistinguishable response, so the page does not become an account lookup. */
export async function registerAccount(
  email: string,
  password: string,
): Promise<RegistrationResult> {
  const emailRedirectTo = new URL(import.meta.env.BASE_URL, window.location.origin).toString();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo },
  });
  if (error) throw new Error(error.message);

  if (data.session && data.user) {
    const session = await authenticate(email, password);
    return { session, confirmationRequired: false };
  }

  sessionStorage.removeItem(SESSION_KEY);
  return { session: null, confirmationRequired: true };
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
