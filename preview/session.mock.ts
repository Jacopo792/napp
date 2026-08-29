import { PREVIEW_U1 } from "./fixture";

/* Preview-only stand-in for src/lib/session.ts. The archive is already open, so
   the notes surface can be inspected without credentials. There is no key of any
   kind: the preview mirrors the account-protected format the app now uses. */

export interface AppSession {
  userId: string;
  email: string;
  archiveId: string;
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

const ARCHIVE_ID = "00000000-0000-4000-8000-000000000001";
const EMAIL = "preview@example.invalid";

async function previewSession(email = EMAIL): Promise<AppSession> {
  return {
    userId: PREVIEW_U1,
    email,
    archiveId: ARCHIVE_ID,
  };
}

export async function authenticate(email: string): Promise<AuthenticationResult> {
  const session = await previewSession(email || EMAIL);
  const archives: ArchiveOption[] = [
    { archiveId: session.archiveId, name: "Preview archive", joinedAt: "2026-05-18" },
  ];
  if (email.startsWith("multi")) {
    archives.push({
      archiveId: "00000000-0000-4000-8000-000000000002",
      name: "Study group",
      joinedAt: "2026-08-29",
    });
  }
  return {
    session: archives.length === 1 ? session : null,
    account: { userId: session.userId, email: session.email },
    archives,
  };
}

export async function chooseArchive(
  account: { userId: string; email: string },
  archiveId: string,
): Promise<AppSession> {
  return { userId: account.userId, email: account.email, archiveId };
}

export async function registerAccount(): Promise<{
  session: AppSession | null;
  confirmationRequired: boolean;
}> {
  return { session: null, confirmationRequired: true };
}

export async function restoreSession(): Promise<AppSession | null> {
  return previewSession();
}

export async function clearSession(): Promise<void> {
  /* Nothing to clear: the preview session is recreated on every load. */
}
