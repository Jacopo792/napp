/* The preview has no profile row, so preferences are whatever this browser
   already holds and nothing is ever written back. Presence is on here, unlike
   the real default, because the point of the preview is to look at the pill.

   Kept in step with `@/lib/accountPreferences` by hand: every export the route
   imports has to exist here, or the whole route fails to load. */
import { currentAppearance } from "@/lib/appearance";
import { currentAxes } from "@/lib/axes";
import {
  accountPreferences,
  flagsOf,
  mergeRemarksSeen,
  type AccountFlags,
  type RemarksSeen,
} from "@/lib/preferenceShape";
import { currentWritingPreferences } from "@/lib/writingPreferences";

export { flagsOf, mergeRemarksSeen };
export type { AccountFlags, AccountPreferences } from "@/lib/preferenceShape";

export const DEFAULT_FLAGS: AccountFlags = {
  presence: true,
  collaborators: true,
  proofreader: true,
  autoLock: 0,
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

export function localPreferences(seen: RemarksSeen = {}) {
  return preferencesWith(DEFAULT_FLAGS, seen);
}

/* No account to read it off, so the preview simply has read everything. */
export function heldRemarksSeen(): RemarksSeen {
  return {};
}

export async function pullAccountPreferences() {
  return localPreferences();
}

export function pushAccountPreferences(): void {}

export function watchLocalStores(): () => void {
  return () => {};
}

export function subscribeToAccountPreferences(): null {
  return null;
}

export async function unsubscribeFromAccountPreferences(): Promise<void> {}
