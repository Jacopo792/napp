/* The preview has no profile row, so preferences are whatever this browser
   already holds and nothing is ever written back. Presence is on here, unlike
   the real default, because the point of the preview is to look at the pill. */
import { currentAppearance } from "@/lib/appearance";
import { currentAxes } from "@/lib/axes";
import { currentWritingPreferences } from "@/lib/writingPreferences";

export type { AccountFlags, AccountPreferences } from "@/lib/accountPreferences";

export const DEFAULT_FLAGS = {
  presence: true,
  collaborators: true,
  proofreader: true,
  autoLock: 0 as const,
};

export function localPreferences() {
  return {
    appearance: currentAppearance(),
    axes: currentAxes(),
    writing: currentWritingPreferences(),
    ...DEFAULT_FLAGS,
  };
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
