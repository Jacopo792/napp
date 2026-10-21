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

export interface ArchiveSelection {
  /** Phone clients cannot open document archives. Desktop leaves this unset. */
  notesOnly?: boolean;
}

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

export async function loadArchiveOptions(
  userId: string,
  selection: ArchiveSelection = {},
): Promise<ArchiveOption[]> {
  const memberships = await supabase
    .from("archive_members")
    .select("archive_id, created_at")
    .eq("user_id", userId)
    .order("created_at");
  if (memberships.error) throw new Error(memberships.error.message);

  const rows = (memberships.data ?? []) as { archive_id: string; created_at: string }[];
  const archiveIds = rows.map((row) => row.archive_id);
  if (archiveIds.length === 0) return [];

  const archives = await supabase.from("archives").select("id, name, kind").in("id", archiveIds);
  if (archives.error) throw new Error(archives.error.message);
  const available = new Map(
    ((archives.data ?? []) as { id: string; name: string; kind?: string }[])
      .filter((archive) => !selection.notesOnly || archive.kind !== "document")
      .map((archive) => [archive.id, archive.name]),
  );
  return rows.flatMap((row) =>
    available.has(row.archive_id)
      ? [
          {
            archiveId: row.archive_id,
            name: available.get(row.archive_id)!,
            joinedAt: row.created_at,
          },
        ]
      : [],
  );
}

async function openAccount(
  userId: string,
  email: string,
  inviteToken?: string,
  selection: ArchiveSelection = {},
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
  const archives = await loadArchiveOptions(userId, selection);
  if (archives.length === 0 && !selection.notesOnly) throw new Error("Could not open this account");

  if (archives.length !== 1) {
    localStorage.removeItem(SESSION_KEY);
    resetArchiveCache();
  }
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
  selection: ArchiveSelection = {},
): Promise<AuthenticationResult> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new Error("Email or password is incorrect");
  try {
    return await openAccount(data.user.id, data.user.email ?? email, inviteToken, selection);
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
  selection: ArchiveSelection = {},
): Promise<AppSession> {
  const current = await supabase.auth.getUser();
  if (current.error || current.data.user?.id !== account.userId) {
    throw new Error("Session expired");
  }
  const archives = await loadArchiveOptions(account.userId, selection);
  if (!archives.some((archive) => archive.archiveId === archiveId)) {
    throw new Error("That archive is no longer available");
  }
  if (selection.notesOnly) {
    const latest = await supabase.auth.getSession();
    if (latest.data.session?.user.id !== account.userId) throw new Error("Account changed");
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
    return Array.isArray(list)
      ? list.filter(
          (account) =>
            account &&
            ["userId", "email", "archiveId", "accessToken", "refreshToken"].every(
              (key) => typeof account[key] === "string" && account[key],
            ),
        )
      : [];
  } catch {
    return [];
  }
}

function saveAccounts(list: SavedAccount[]): void {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list));
}

/* A saved account's copy of its tokens has to follow every rotation, whoever
   caused it. A refresh is a rotation: the old refresh token is spent, and
   presenting it again after the reuse window is a reuse, which Supabase
   answers by revoking the whole family — the live session included. The copy
   used to be written only when the account was left, so any refresh after
   that (a launch, a `getSession` on the sign-in page, the account coming back
   in `resumeAccount`) left a spent token on the shelf, and the next return to
   that account killed it. Following the client's own announcements keeps the
   shelf on the token the SDK holds. */
supabase.auth.onAuthStateChange((event, next) => {
  if (!next?.user || (event !== "TOKEN_REFRESHED" && event !== "SIGNED_IN")) return;
  const list = savedAccounts();
  const saved = list.find((a) => a.userId === next.user.id);
  if (!saved || saved.refreshToken === next.refresh_token) return;
  saved.accessToken = next.access_token;
  saved.refreshToken = next.refresh_token;
  saveAccounts(list);
});

/** The server has refused this account's token: only its password brings it
 *  back. Carries the address so the sign-in page can be filled in for it. */
export class SignInAgain extends Error {
  constructor(readonly email: string) {
    super(`Sign in to ${email} again`);
    this.name = "SignInAgain";
  }
}

/** Forgets an account saved on this device. Its tokens go with it. */
export function forgetAccount(userId: string): void {
  saveAccounts(savedAccounts().filter((a) => a.userId !== userId));
}

/** The phone's archives for an account, believed only when they are there.
 *  Row level security answers a request that carries no token for this
 *  account — the SDK's refresh failed, or the session is gone — with no rows
 *  rather than an error, and "no archives" was then shown to somebody who had
 *  twelve notes. An empty list is checked against who the server says is
 *  signed in: the same account reads again (`getUser` has refreshed by now),
 *  nobody is a password to ask for, and a dropped connection is said. */
export async function notesArchives(account: {
  userId: string;
  email: string;
}): Promise<ArchiveOption[]> {
  const archives = await loadArchiveOptions(account.userId, { notesOnly: true });
  if (archives.length) return archives;
  const { data, error } = await supabase.auth.getUser();
  if (data.user?.id === account.userId)
    return loadArchiveOptions(account.userId, { notesOnly: true });
  if (error && !refusedToken(error)) throw new Error("Couldn't reach the server. Try again");
  localStorage.removeItem(SESSION_KEY);
  forgetAccount(account.userId);
  throw new SignInAgain(account.email);
}

function currentAppSession(): AppSession | null {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null");
  } catch {
    return null;
  }
}

/** The signed-in account's tokens, taken now because they rotate. A session
 *  the SDK no longer holds for this account has nothing worth keeping, and
 *  saying so used to stop Add Account and every switch — the one way out of a
 *  dead session was closed by it. */
async function stashCurrent(): Promise<void> {
  const app = currentAppSession();
  if (!app) return;
  const { data } = await supabase.auth.getSession();
  if (!data.session || data.session.user?.id !== app.userId) return;
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

/** Native account addition keeps the refresh token valid. signOut({scope:"local"})
 * revokes it on the server, which would make the saved account unusable. */
export async function pauseAccount(): Promise<void> {
  await supabase.auth.stopAutoRefresh();
  await stashCurrent();
  localStorage.removeItem(SESSION_KEY);
  resetArchiveCache();
  await clearNoteStore();
}

/** Returns a validated saved session without browser navigation. */
export async function resumeAccount(
  userId: string,
  selection: ArchiveSelection = {},
): Promise<AuthenticationResult> {
  /* A refresh that fires between the stash and the swap rotates the token
     just saved, and the next return to this account is then a reuse that
     Supabase answers by revoking it: "sign in again". */
  await supabase.auth.stopAutoRefresh();
  await stashCurrent();
  const target = savedAccounts().find((a) => a.userId === userId);
  if (!target) throw new Error("That account is no longer saved");
  // The SDK may have rotated this account since it was saved (including on restart).
  const current = await supabase.auth.getSession();
  const { data, error } =
    current.data.session?.user?.id === userId
      ? { data: { user: current.data.session.user }, error: null }
      : await supabase.auth.setSession({
          access_token: target.accessToken,
          refresh_token: target.refreshToken,
        });
  if (error || data.user?.id !== userId) {
    if (!error || !refusedToken(error))
      throw new Error(`Couldn't reach ${target.email}. Try again`);
    forgetAccount(userId);
    throw new SignInAgain(target.email);
  }
  // Once auth changes, no old archive may remain associated with it, even if a read fails.
  localStorage.removeItem(SESSION_KEY);
  const archives = selection.notesOnly
    ? await notesArchives({ userId, email: target.email })
    : await loadArchiveOptions(userId, selection);
  const archive = archives.find((item) => item.archiveId === target.archiveId) ?? archives[0];
  resetArchiveCache();
  await clearNoteStore();
  return {
    account: { userId, email: target.email },
    archives,
    session: archive ? storeSession(userId, target.email, archive.archiveId) : null,
  };
}

/** Only the server saying no to the token forgets an account. A dropped
 *  connection is not a verdict on the token, and forgetting the account over
 *  one made the next switch ask for a password it never needed. */
function refusedToken(error: { status?: number }): boolean {
  return typeof error.status === "number" && error.status >= 400 && error.status < 500;
}

export async function switchAccount(userId: string): Promise<void> {
  await stashCurrent();
  const target = savedAccounts().find((a) => a.userId === userId);
  if (!target) throw new Error("That account is no longer saved");
  const { error } = await supabase.auth.setSession({
    access_token: target.accessToken,
    refresh_token: target.refreshToken,
  });
  if (error) {
    if (!refusedToken(error)) throw new Error(`Couldn't reach ${target.email}. Try again`);
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
