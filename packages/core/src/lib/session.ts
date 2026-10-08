/* From `supabaseClient` and `noteStore` rather than from `supabase.ts`, and
   deliberately: `supabase.ts` imports the Tiptap schema through `content.ts`,
   so importing it here put all of ProseMirror in the chunk the sign-in page
   loads before you can type a password. This module is the login screen's
   entire back end and must stay editor-free. */
import { supabase } from "./supabaseClient";
import { platform } from "@/platform";
import { clearNoteStore, resetArchiveCache } from "./noteStore";
import { restoreArchiveSession, SESSION_KEY, type AppSession } from "./sessionRestore";
export type { AppSession } from "./sessionRestore";

/* The encrypted format is gone. Every note, folder, tag and archive setting is
   a plaintext column and every stored object carries its real content type, so
   there is no longer a key to unwrap, nothing to decrypt on read, and — the
   part that mattered — no raw archive key sitting in browser storage for a
   format nothing writes any more. `scripts/` keeps the tools that performed the
   conversion, and `scripts/lib/crypto.ts` exists for them alone. */

type StoredSession = AppSession;

export type RegistrationResult =
  | { session: null; confirmationRequired: true }
  | (AuthenticationResult & { confirmationRequired: false });

export interface ArchiveOption {
  archiveId: string;
  name: string;
  joinedAt: string;
}

export interface AuthenticationResult {
  session: AppSession | null;
  account: { userId: string; email: string };
  archives: ArchiveOption[];
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

function storeSession(userId: string, email: string, archiveId: string): AppSession {
  const stored: StoredSession = { userId, email, archiveId };
  localStorage.setItem(SESSION_KEY, JSON.stringify(stored));
  resetArchiveCache();
  return stored;
}

async function loadArchiveOptions(userId: string): Promise<ArchiveOption[]> {
  const memberships = await supabase
    .from("archive_members")
    .select("archive_id, created_at")
    .eq("user_id", userId)
    .order("created_at");
  if (memberships.error) throw new Error(memberships.error.message);

  const rows = (memberships.data ?? []) as { archive_id: string; created_at: string }[];
  const archiveIds = rows.map((row) => row.archive_id);
  if (archiveIds.length === 0) return [];

  const archives = await supabase.from("archives").select("id, name").in("id", archiveIds);
  if (archives.error) throw new Error(archives.error.message);
  const names = new Map(
    ((archives.data ?? []) as { id: string; name: string }[]).map((archive) => [
      archive.id,
      archive.name,
    ]),
  );
  return rows.map((row) => ({
    archiveId: row.archive_id,
    name: names.get(row.archive_id) ?? "Notes",
    joinedAt: row.created_at,
  }));
}

async function openAccount(
  userId: string,
  email: string,
  inviteToken?: string,
): Promise<AuthenticationResult> {
  const bootstrap = await supabase.rpc("ensure_personal_archive");
  if (bootstrap.error || !bootstrap.data) {
    throw new Error(bootstrap.error?.message ?? "Could not create an archive for this account");
  }

  if (inviteToken) {
    const claim = await supabase.rpc("claim_archive_invite", { token: inviteToken });
    if (claim.error) throw new Error(claim.error.message);
  }

  await ensureProfile(userId, email);
  const archives = await loadArchiveOptions(userId);
  if (archives.length === 0) throw new Error("Could not open this account");

  return {
    session: archives.length === 1 ? storeSession(userId, email, archives[0].archiveId) : null,
    account: { userId, email },
    archives,
  };
}

export async function authenticate(
  email: string,
  password: string,
  inviteToken?: string,
): Promise<AuthenticationResult> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new Error("Email or password is incorrect");
  try {
    return await openAccount(data.user.id, data.user.email ?? email, inviteToken);
  } catch (reason) {
    localStorage.removeItem(SESSION_KEY);
    resetArchiveCache();
    await supabase.auth.signOut({ scope: "local" });
    if (reason instanceof Error && reason.message.toLowerCase().includes("invitation"))
      throw reason;
    throw new Error("Could not open this account");
  }
}

export async function chooseArchive(
  account: { userId: string; email: string },
  archiveId: string,
): Promise<AppSession> {
  const current = await supabase.auth.getUser();
  if (current.error || current.data.user?.id !== account.userId) {
    throw new Error("Session expired");
  }
  const archives = await loadArchiveOptions(account.userId);
  if (!archives.some((archive) => archive.archiveId === archiveId)) {
    throw new Error("That archive is no longer available");
  }
  return storeSession(account.userId, account.email, archiveId);
}

/** Registration deliberately gives the same completion message for a new or
 * existing address. With confirmations enabled Supabase also returns an
 * indistinguishable response, so the page does not become an account lookup. */
export async function registerAccount(
  email: string,
  password: string,
): Promise<RegistrationResult> {
  const redirect = new URL(platform().webOrigin());
  const inviteToken = platform().inviteToken();
  if (inviteToken) redirect.searchParams.set("invite", inviteToken);
  const emailRedirectTo = redirect.toString();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo },
  });
  if (error) throw new Error(error.message);

  if (data.session && data.user) {
    const result = await openAccount(data.user.id, data.user.email ?? email, inviteToken);
    return { ...result, confirmationRequired: false };
  }

  localStorage.removeItem(SESSION_KEY);
  return { session: null, confirmationRequired: true };
}

export async function restoreSession(): Promise<AppSession | null> {
  return restoreArchiveSession(localStorage, supabase.auth);
}

/* Other accounts on this device, kept so switching is a click instead of a
   password. Their refresh tokens sit in the same localStorage the signed-in
   account's already does, so this widens nothing. Signing out forgets the
   account that signed out; the rest stay. */
const ACCOUNTS_KEY = "napp:accounts";

interface SavedAccount {
  userId: string;
  email: string;
  archiveId: string;
  accessToken: string;
  refreshToken: string;
}

function savedAccounts(): SavedAccount[] {
  try {
    const list = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) ?? "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveAccounts(list: SavedAccount[]): void {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list));
}

function currentAppSession(): AppSession | null {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null");
  } catch {
    return null;
  }
}

/** The signed-in account's tokens, taken now because they rotate. */
async function stashCurrent(): Promise<void> {
  const app = currentAppSession();
  const { data } = await supabase.auth.getSession();
  if (!app || !data.session) return;
  saveAccounts([
    ...savedAccounts().filter((a) => a.userId !== app.userId),
    {
      userId: app.userId,
      email: app.email,
      archiveId: app.archiveId,
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
    },
  ]);
}

export function otherAccounts(userId: string): { userId: string; email: string }[] {
  return savedAccounts()
    .filter((a) => a.userId !== userId)
    .map(({ userId, email }) => ({ userId, email }));
}

/** Leaves this account signed in for later and opens the sign-in page. */
export async function addAccount(): Promise<void> {
  await stashCurrent();
  localStorage.removeItem(SESSION_KEY);
  resetArchiveCache();
  await supabase.auth.signOut({ scope: "local" });
}

/** Swaps to a saved account and reloads, so every channel, provider and cache
 *  of the old one is rebuilt rather than reset. A token the server no longer
 *  honours drops the account and throws. */
export async function switchAccount(userId: string): Promise<void> {
  await stashCurrent();
  const target = savedAccounts().find((a) => a.userId === userId);
  if (!target) throw new Error("That account is no longer saved");
  const { error } = await supabase.auth.setSession({
    access_token: target.accessToken,
    refresh_token: target.refreshToken,
  });
  if (error) {
    saveAccounts(savedAccounts().filter((a) => a.userId !== userId));
    throw new Error(`Sign in to ${target.email} again`);
  }
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ userId, email: target.email, archiveId: target.archiveId }),
  );
  resetArchiveCache();
  window.location.reload();
}

export async function clearSession(): Promise<void> {
  const leaving = currentAppSession();
  if (leaving) saveAccounts(savedAccounts().filter((a) => a.userId !== leaving.userId));
  localStorage.removeItem(SESSION_KEY);
  resetArchiveCache();
  /* The in-memory cache goes with the tab; the one on disk has to be asked.
     Signing out is the moment the archive's words stop being welcome here. */
  await clearNoteStore();
  await supabase.auth.signOut({ scope: "local" });
}
