import { PREVIEW_U1 } from "./fixture";

/* Preview-only stand-in for src/lib/session.ts. The archive is already open, so
   the notes surface can be inspected without credentials. There is no key of any
   kind: the preview mirrors the account-protected format the app now uses. */

export interface AppSession {
  userId: string;
  email: string;
  archiveId: string;
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

export async function authenticate(email: string): Promise<AppSession> {
  return previewSession(email || EMAIL);
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
