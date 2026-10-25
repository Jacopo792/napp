import { accountContentRemovalKey } from "./accountContentShape.ts";

export interface AppSession {
  userId: string;
  email: string;
  archiveId: string;
}

export const SESSION_KEY = "napp:archive-session";

interface SessionAuth {
  getUser(): Promise<{
    data: { user: { id: string } | null };
    error: { message: string; status?: number; name?: string; code?: string } | null;
  }>;
}

/** The SDK restores and refreshes its persisted token before getUser validates
 * it. An unavailable server must not erase the separately saved archive. */
export async function restoreArchiveSession(
  storage: Pick<Storage, "getItem" | "removeItem">,
  auth: SessionAuth,
): Promise<AppSession | null> {
  const raw = storage.getItem(SESSION_KEY);
  if (!raw) return null;
  let stored: AppSession;
  try {
    stored = JSON.parse(raw);
    if (
      !stored ||
      typeof stored.userId !== "string" ||
      !stored.userId ||
      typeof stored.email !== "string" ||
      typeof stored.archiveId !== "string" ||
      !stored.archiveId
    )
      throw new Error("Invalid saved archive");
  } catch {
    storage.removeItem(SESSION_KEY);
    return null;
  }

  if (storage.getItem(accountContentRemovalKey(stored.userId))) {
    // A crash during explicit device removal must not restore a permanently
    // blocked editor. A fresh sign-in is required to start using caches again.
    storage.removeItem(SESSION_KEY);
    return null;
  }

  const { data, error } = await auth.getUser();
  if (error) {
    const expired =
      error.status === 401 ||
      error.status === 403 ||
      error.name === "AuthSessionMissingError" ||
      ["session_not_found", "refresh_token_not_found", "refresh_token_already_used"].includes(
        error.code ?? "",
      );
    if (!expired) throw new Error("Could not reconnect. Check your connection and try again.");
  }
  if (error || !data.user || data.user.id !== stored.userId) {
    storage.removeItem(SESSION_KEY);
    return null;
  }
  return stored;
}

/** Written once an account with an address has been open on this device, and
 *  never taken away by a failed restore. */
export const SIGNED_IN_BEFORE_KEY = "napp:signed-in-before";

/** The phone opens on an anonymous account only when it has never held a real
 *  one: no saved archive session, no saved account, no account ever opened.
 *  A real session that fails to restore — offline, refused, a permission
 *  error — is asked for again, never replaced. Read it before anything that
 *  may clear the saved session. */
export function mayStartAnonymous(storage: Pick<Storage, "getItem">): boolean {
  if (storage.getItem(SESSION_KEY) || storage.getItem(SIGNED_IN_BEFORE_KEY)) return false;
  try {
    const saved = JSON.parse(storage.getItem("napp:accounts") ?? "[]");
    return !(Array.isArray(saved) && saved.length);
  } catch {
    return false;
  }
}
