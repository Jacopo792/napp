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
