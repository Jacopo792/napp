/* The preview has no profile row, so preferences are whatever this browser
   already holds and nothing is ever written back. Presence is on here, unlike
   the real default, because the point of the preview is to look at the pill.

   Kept in step with `@/lib/accountPreferences` by hand: every export the route
   imports has to exist here, or the whole route fails to load. */
import { DEFAULT_APPEARANCE, currentAppearance, setAppearance } from "@/lib/appearance";
import { DEFAULT_AXES, currentAxes, setAxes } from "@/lib/axes";
import {
  accountPreferences,
  flagsOf,
  mergeRemarksSeen,
  type AccountFlags,
  type AccountPreferences,
  type RemarksSeen,
} from "@/lib/preferenceShape";
import { DEFAULT_WRITING_PREFERENCES, currentWritingPreferences, setWritingPreferences } from "@/lib/writingPreferences";
import { localWhatsNewSeen } from "@/lib/whatsNew";

export { flagsOf, mergeRemarksSeen };
export type { AccountFlags, AccountPreferences } from "@/lib/preferenceShape";

export const DEFAULT_FLAGS: AccountFlags = {
  presence: true,
  collaborators: true,
  proofreader: true,
  autocorrect: true,
  autoLock: 0,
  spaceSwitch: false,
  whatsNewSeen: "",
};

export function preferencesWith(flags: AccountFlags, seen: RemarksSeen = {}) {
  return accountPreferences(
    currentAppearance(),
    currentAxes(),
    currentWritingPreferences(),
    flags,
    seen,
  );
}

/* No account to read it off, so the preview simply has read everything. */
export function heldRemarksSeen(): RemarksSeen {
  return {};
}

/* The row the preview does not have, kept for the life of the page — so a
   switch flipped here survives the remount that changing archive is.
   On the global object, so a hot reload of this module keeps it too. */
const store = globalThis as { __nappPreview_preferences?: AccountPreferences };

export function localPreferences(seen: RemarksSeen = {}) {
  return store.__nappPreview_preferences ?? preferencesWith({ ...DEFAULT_FLAGS, whatsNewSeen: localWhatsNewSeen() }, seen);
}

export async function pullAccountPreferences(session: { userId: string }) {
  store.__nappPreview_preferences ??= accounts.get(session.userId);
  return localPreferences();
}

export function pushAccountPreferences(_session: unknown, preferences: AccountPreferences): void {
  store.__nappPreview_preferences = preferences;
}

export function watchLocalStores(): () => void {
  return () => {};
}

export function subscribeToAccountPreferences(): null {
  return null;
}

export async function unsubscribeFromAccountPreferences(): Promise<void> {}

const accounts = new Map<string, AccountPreferences>();
export async function releaseAccountPreferences(session?: { userId: string }): Promise<void> {
  if (session && store.__nappPreview_preferences) accounts.set(session.userId, store.__nappPreview_preferences);
  delete store.__nappPreview_preferences;
  setAppearance(DEFAULT_APPEARANCE);
  setAxes(DEFAULT_AXES);
  setWritingPreferences(DEFAULT_WRITING_PREFERENCES);
}
