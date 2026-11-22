/* From `supabaseClient` and `noteStore` rather than from `supabase.ts`, and
   deliberately: `supabase.ts` imports the Tiptap schema through `content.ts`,
   so importing it here put all of ProseMirror in the chunk the sign-in page
   loads before you can type a password. This module is the login screen's
   entire back end and must stay editor-free. */
import { createEphemeralClient, supabase } from "./supabaseClient";
import { platform } from "@/platform";
import { clearNoteStore, resetArchiveCache } from "./noteStore";
import { loadPolicyAcceptance } from "./policyAcceptance";
import { POLICY_VERSION } from "./storePolicies";
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
  continueAfterPolicies?: () => Promise<AuthenticationResult>;
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

/** Joins the archive an invitation is for and answers its id. Postgres also
 *  discards the account's own default archive if it is still empty. */
export async function claimInvite(token: string): Promise<string> {
  const claim = await supabase.rpc("claim_archive_invite", { token });
  if (claim.error) throw new Error(claim.error.message);
  return claim.data as string;
}

async function openAccount(
  userId: string,
  email: string,
  inviteToken?: string,
): Promise<AuthenticationResult> {
  if (!(await loadPolicyAcceptance(userId))) {
    return {
      session: null,
      account: { userId, email },
      archives: [],
      continueAfterPolicies: () => openAccount(userId, email, inviteToken),
    };
  }
  const bootstrap = await supabase.rpc("ensure_personal_archive");
  if (bootstrap.error || !bootstrap.data) {
    throw new Error(bootstrap.error?.message ?? "Could not create a group for this account");
  }

  let joined: string | undefined;
  if (inviteToken) joined = await claimInvite(inviteToken);

  await ensureProfile(userId, email);
  const { restoreAccountContent } = await import("./accountContent");
  restoreAccountContent(userId);
  const archives = await loadArchiveOptions(userId);
  if (archives.length === 0) throw new Error("Could not open this account");

  /* The archive just joined opens, however many others the account has. */
  const opening =
    archives.length === 1
      ? archives[0].archiveId
      : joined && archives.find((archive) => archive.archiveId === joined)?.archiveId;
  if (!opening) {
    localStorage.removeItem(SESSION_KEY);
    resetArchiveCache();
  }
  return {
    session: opening ? storeSession(userId, email, opening) : null,
    account: { userId, email },
    archives,
  };
}

/** What a refused sign-in is called. Being rate limited or offline is not a
 *  wrong password, and saying so sends people to reset one that was right. */
export function signInFailure(error: { status?: number; code?: string }): Error {
  if (error.code === "captcha_failed")
    return new Error("Complete the security check and try again.");
  if (error.status === 429) return new Error("Too many sign-in attempts. Try again shortly.");
  if (!error.status || error.status >= 500)
    return new Error("Could not reach the sign-in service. Check your connection and try again.");
  return new Error("Email or password is incorrect");
}

/** Registration and linking say the same thing for a taken address as for any
 *  other refusal the person can do nothing about: the page is not an account
 *  lookup. A weak password is theirs to fix, so that one is named. */
function registrationFailure(error: { status?: number; code?: string; message: string }): Error {
  if (error.status === 429) return new Error("Too many attempts. Try again shortly.");
  if (!error.status || error.status >= 500)
    return new Error("Could not reach the sign-in service. Check your connection and try again.");
  if (error.code === "captcha_failed")
    return new Error("Complete the security check and try again.");
  if (error.code === "weak_password") return new Error(error.message);
  return new Error("Could not create this account. Sign in instead, or use another address");
}

export async function authenticate(
  email: string,
  password: string,
  inviteToken?: string,
  captchaToken?: string,
): Promise<AuthenticationResult> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
    ...(captchaToken ? { options: { captchaToken } } : {}),
  });
  if (error) throw signInFailure(error);
  if (!data.user) throw new Error("Email or password is incorrect");
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
    throw new Error("That group is no longer available");
  }
  return storeSession(account.userId, account.email, archiveId);
}

/** Disposable ("temp mail") addresses are refused by the server whatever the
 *  client does; asking first only turns its refusal into a sentence. A failed
 *  question lets the request through to that refusal. */
async function refuseDisposable(email: string): Promise<void> {
  const { data, error } = await supabase.rpc("email_allowed", { address: email.trim() });
  if (!error && data === false) throw new Error("Use a permanent email address");
}

/** A new address for an account that has one. With `double_confirm_changes`
 *  the server mails a link to both addresses and keeps the old one until both
 *  are opened; the next launch reads the confirmed address back. */
export async function requestEmailChange(current: string, next: string): Promise<void> {
  const email = next.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address");
  if (email.toLowerCase() === current.trim().toLowerCase())
    throw new Error("This is already your email");
  await refuseDisposable(email);
  const { error } = await supabase.auth.updateUser(
    { email },
    { emailRedirectTo: platform().webOrigin() },
  );
  if (error)
    throw new Error(error.status === 429 ? "Too many requests. Try again later" : error.message);
}

/** Whether an address and password open an account, asked on a client of
 *  its own: the account in front is left alone until they do. */
export async function checkCredentials(
  email: string,
  password: string,
  captchaToken?: string,
): Promise<void> {
  const client = createEphemeralClient();
  const { error } = await client.auth.signInWithPassword({
    email,
    password,
    ...(captchaToken ? { options: { captchaToken } } : {}),
  });
  if (error) throw signInFailure(error);
  await client.auth.signOut({ scope: "local" });
}

export async function changePassword(
  email: string,
  current: string,
  next: string,
  captchaToken?: string,
): Promise<void> {
  if (next.length < 8) throw new Error("Use at least 8 characters");
  if (next === current) throw new Error("Choose a different password");
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.user.email?.toLowerCase() !== email.toLowerCase())
    throw new Error("Sign in to change your password");
  try {
    await checkCredentials(email, current, captchaToken);
  } catch (reason) {
    if (reason instanceof Error && reason.message === "Email or password is incorrect")
      throw new Error("Your current password is incorrect");
    throw reason;
  }
  const {
    data: { session: active },
  } = await supabase.auth.getSession();
  if (active?.user.id !== session.user.id) throw new Error("The signed-in account changed");
  const { error } = await supabase.auth.updateUser({ password: next, current_password: current });
  if (error)
    throw new Error(error.status === 429 ? "Too many requests. Try again later" : error.message);
}

/** Registration deliberately gives the same completion message for a new or
 * existing address. With confirmations enabled Supabase also returns an
 * indistinguishable response, so the page does not become an account lookup. */
export async function registerAccount(
  email: string,
  password: string,
  acceptedPolicies = false,
  captchaToken?: string,
): Promise<RegistrationResult> {
  const inviteToken = platform().inviteToken();
  const data = await signUp(
    supabase.auth,
    email,
    password,
    acceptedPolicies,
    inviteToken,
    captchaToken,
  );

  if (data.session && data.user) {
    const result = await openAccount(data.user.id, data.user.email ?? email, inviteToken);
    return { ...result, confirmationRequired: false };
  }

  localStorage.removeItem(SESSION_KEY);
  return { session: null, confirmationRequired: true };
}

async function signUp(
  auth: typeof supabase.auth,
  email: string,
  password: string,
  acceptedPolicies: boolean,
  inviteToken?: string,
  captchaToken?: string,
) {
  if (!acceptedPolicies)
    throw new Error("Accept the Terms of Use and read the Privacy Policy first");
  await refuseDisposable(email);
  const { data, error } = await auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: signupRedirect(inviteToken),
      ...(captchaToken ? { captchaToken } : {}),
      data: {
        napp_terms_version: POLICY_VERSION,
        napp_privacy_version: POLICY_VERSION,
      },
    },
  });
  if (error) throw registrationFailure(error);
  return data;
}

/** Keep the current account active while an additional account waits for email. */
export async function prepareRegistration(
  email: string,
  password: string,
  acceptedPolicies: boolean,
  captchaToken?: string,
): Promise<boolean> {
  const data = await signUp(
    createEphemeralClient().auth,
    email,
    password,
    acceptedPolicies,
    undefined,
    captchaToken,
  );
  return !data.session;
}

function signupRedirect(inviteToken?: string): string {
  const redirect = new URL(platform().webOrigin());
  if (inviteToken) redirect.searchParams.set("invite", inviteToken);
  return redirect.toString();
}

export async function resendRegistrationCode(email: string, captchaToken?: string): Promise<void> {
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: {
      emailRedirectTo: signupRedirect(platform().inviteToken()),
      ...(captchaToken ? { captchaToken } : {}),
    },
  });
  if (error) throw registrationFailure(error);
}

export async function confirmRegistration(
  email: string,
  code: string,
): Promise<AuthenticationResult> {
  const { user } = await verifyRegistrationCode(supabase.auth, email, code);
  return openConfirmedAccount(() =>
    openAccount(user.id, user.email ?? email, platform().inviteToken()),
  );
}

/** The code is single-use: once it is spent, a failure to open the account
 *  must not leave the person retrying it. The address is confirmed, so they
 *  sign in instead, from a clean local session. */
async function openConfirmedAccount(
  open: () => Promise<AuthenticationResult>,
): Promise<AuthenticationResult> {
  try {
    return await open();
  } catch (reason) {
    localStorage.removeItem(SESSION_KEY);
    resetArchiveCache();
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    if (reason instanceof Error && reason.message.toLowerCase().includes("invitation"))
      throw reason;
    throw new Error("Your email is confirmed. Sign in to continue.");
  }
}

/** The fallback page verifies an address without replacing this browser's session. */
export async function confirmRegistrationAddress(email: string, code: string): Promise<void> {
  const { auth } = createEphemeralClient();
  await verifyRegistrationCode(auth, email, code);
  await auth.signOut({ scope: "local" });
}

/** Verify before leaving the active account. Activate only after its views and writes close. */
export async function prepareRegistrationConfirmation(
  email: string,
  code: string,
): Promise<() => Promise<AuthenticationResult>> {
  const { user, session } = await verifyRegistrationCode(createEphemeralClient().auth, email, code);
  return () =>
    openConfirmedAccount(async () => {
      const { error } = await supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });
      if (error) throw registrationFailure(error);
      return openAccount(user.id, user.email ?? email);
    });
}

async function verifyRegistrationCode(auth: typeof supabase.auth, email: string, code: string) {
  const token = code.replace(/\s/g, "");
  if (!/^\d{8}$/.test(token)) throw new Error("Enter the 8-digit code");
  const { data, error } = await auth.verifyOtp({ email, token, type: "signup" });
  if (error?.code === "otp_expired" || error?.code === "access_denied")
    throw new Error("This code is invalid or expired. Request a new code.");
  if (error) throw registrationFailure(error);
  if (!data.user || !data.session) throw new Error("Could not confirm your email");
  return { user: data.user, session: data.session };
}

/** A saved archive the account can no longer read (left, removed, or one that
 *  belongs to another account on this device) opens the account's first
 *  archive instead of an empty list. Offline, the saved one stands. */
export async function restoreSession(): Promise<AppSession | null> {
  const stored = await restoreArchiveSession(localStorage, supabase.auth);
  if (!stored) return null;
  let archives: ArchiveOption[];
  try {
    archives = await loadArchiveOptions(stored.userId);
  } catch {
    return stored;
  }
  if (archives.some((archive) => archive.archiveId === stored.archiveId)) {
    if (localStorage.getItem(SESSION_KEY) !== JSON.stringify(stored))
      localStorage.setItem(SESSION_KEY, JSON.stringify(stored));
    return stored;
  }
  if (archives.length === 0) {
    localStorage.removeItem(SESSION_KEY);
    resetArchiveCache();
    return null;
  }
  return storeSession(stored.userId, stored.email, archives[0].archiveId);
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

/** Leaves this account signed in for later and opens the sign-in page. No
 *  `signOut` here: it revokes the refresh token on the server, and the account
 *  just saved would then need its password the first time it was returned to.
 *  The next sign-in replaces the client's session without revoking this one. */
export async function addAccount(): Promise<void> {
  await stashCurrent();
  localStorage.removeItem(SESSION_KEY);
  resetArchiveCache();
  await clearNoteStore();
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
    if (error.status !== 400 && error.status !== 401 && error.status !== 403)
      throw new Error(`Couldn't reach ${target.email}. Try again`);
    saveAccounts(savedAccounts().filter((a) => a.userId !== userId));
    throw new Error(`Sign in to ${target.email} again`);
  }
  await clearNoteStore();
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ userId, email: target.email, archiveId: target.archiveId }),
  );
  resetArchiveCache();
  window.location.reload();
}

export async function clearSession(options: { removeLocalContent?: boolean } = {}): Promise<void> {
  const leaving = currentAppSession();
  if (options.removeLocalContent && leaving) {
    const { removeAccountContent } = await import("./accountContent");
    await removeAccountContent(leaving.userId);
  }
  if (leaving) saveAccounts(savedAccounts().filter((a) => a.userId !== leaving.userId));
  localStorage.removeItem(SESSION_KEY);
  resetArchiveCache();
  /* The in-memory cache goes with the tab; the one on disk has to be asked.
     Signing out is the moment the archive's words stop being welcome here. */
  await clearNoteStore();
  await supabase.auth.signOut({ scope: "local" });
}
