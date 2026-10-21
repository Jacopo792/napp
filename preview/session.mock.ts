import { PREVIEW_ARCHIVE, PREVIEW_U1, PREVIEW_U2 } from "./fixture";
import { loadSpaces } from "./spaces.mock";
import type { AppSession, ArchiveOption, ArchiveSelection, AuthenticationResult } from "../packages/core/src/lib/session";
export type { AppSession, ArchiveOption, ArchiveSelection, AuthenticationResult };

/* Native QA uses genuine account transitions against disposable fixture state.
   No password or real auth endpoint is involved. */
let current: AppSession | null = { userId: PREVIEW_U1, email: "preview@example.invalid", archiveId: PREVIEW_ARCHIVE };
let active: AppSession | null = current;
const saved = new Map<string, AppSession>([[PREVIEW_U2, { userId: PREVIEW_U2, email: "second@example.invalid", archiveId: PREVIEW_ARCHIVE }]]);
let booksOnly = false;

export async function loadArchiveOptions(userId: string, selection: ArchiveSelection = {}): Promise<ArchiveOption[]> {
  const spaces = await loadSpaces({ userId, email: "preview@example.invalid", archiveId: PREVIEW_ARCHIVE });
  return spaces.filter((space) => (!booksOnly || space.kind === "document" || ![PREVIEW_ARCHIVE, "00000000-0000-4000-8000-000000000002"].includes(space.archiveId)) && (!selection.notesOnly || space.kind !== "document") && space.members.some((member) => member.userId === userId)).map((space) => ({ archiveId: space.archiveId, name: space.name, joinedAt: "2026-05-18" }));
}
export async function authenticate(email: string, _password?: string, _invite?: string, selection: ArchiveSelection = {}): Promise<AuthenticationResult> {
  booksOnly = email.startsWith("books");
  const userId = email.startsWith("second") ? PREVIEW_U2 : PREVIEW_U1;
  active = { userId, email, archiveId: PREVIEW_ARCHIVE };
  const archives = await loadArchiveOptions(userId, selection);
  current = archives.length === 1 ? { ...active, archiveId: archives[0].archiveId } : null;
  return { session: current, account: active, archives };
}
export async function chooseArchive(account: { userId: string; email: string }, archiveId: string, selection: ArchiveSelection = {}): Promise<AppSession> {
  const options = await loadArchiveOptions(account.userId, selection);
  if (!options.some((item) => item.archiveId === archiveId)) throw new Error("That archive is no longer available");
  current = active = { ...account, archiveId };
  return current;
}
export async function registerAccount() { return { session: null, confirmationRequired: true }; }
export async function restoreSession(): Promise<AppSession | null> { return current; }
export async function clearSession(): Promise<void> {
  if (active) saved.delete(active.userId);
  current = active = null;
}
export function otherAccounts(userId: string) {
  return [...saved.values()].filter((account) => account.userId !== userId).map(({ userId, email }) => ({ userId, email }));
}
export async function pauseAccount(): Promise<void> {
  if (current) saved.set(current.userId, current);
  current = null;
}
export const addAccount = pauseAccount;
export async function resumeAccount(userId: string, selection: ArchiveSelection = {}): Promise<AuthenticationResult> {
  const target = saved.get(userId);
  if (!target) throw new Error("That account is no longer saved");
  if (current) saved.set(current.userId, current);
  booksOnly = false;
  active = target;
  const archives = await loadArchiveOptions(userId, selection);
  const archive = archives.find((item) => item.archiveId === target.archiveId) ?? archives[0];
  current = archive ? { ...target, archiveId: archive.archiveId } : null;
  return { session: current, account: target, archives };
}
export async function switchAccount(userId: string): Promise<void> {
  await resumeAccount(userId);
  window.location.reload();
}
export class SignInAgain extends Error {
  constructor(readonly email: string) {
    super(`Sign in to ${email} again`);
    this.name = "SignInAgain";
  }
}
export async function notesArchives(account: { userId: string }): Promise<ArchiveOption[]> {
  return loadArchiveOptions(account.userId, { notesOnly: true });
}
export function forgetAccount(userId: string): void {
  saved.delete(userId);
}
