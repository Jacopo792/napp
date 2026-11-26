/* What changed, release by release, in the words of somebody using Napp
 * rather than somebody building it. The sheet that shows it opens by itself
 * once after an update, and is always one press away in the sidebar and ⌘K.
 *
 * A release is written here as it is made: a new entry at the top, its
 * version matching `apps/*\/package.json`. What has been read is a fact about
 * the person, so it travels with the account (`whatsNewSeen` in
 * `profile_preferences`) and installing the desktop app does not announce a
 * release already read in the browser.
 *
 * Pure, so `node --experimental-strip-types` can test it. */

const LATEST = "https://github.com/Jacopo792/napp/releases/latest";

/** Where the newest installers are. The names carry no version (see
 *  `electron-builder.yml`), so these never go stale. */
export const DOWNLOADS = {
  page: LATEST,
  mac: `${LATEST}/download/Napp-mac-arm64.dmg`,
  macIntel: `${LATEST}/download/Napp-mac-x64.dmg`,
  windows: `${LATEST}/download/Napp-windows-setup.exe`,
};

export const CURRENT_RELEASE = "1.0.1";

function parts(version: string): number[] {
  return version.split(".").map((part) => Number.parseInt(part, 10) || 0);
}

/** Negative when `a` is older than `b`. An empty version is older than any. */
/* This device's copy of what has been read, so a remount or a closed window
   that beats the account's debounced write does not bring "New" back. The
   account row is still the authority; the two merge to the later. */
const SEEN_KEY = "napp:whats-new-seen";

export function localWhatsNewSeen(): string {
  try {
    return localStorage.getItem(SEEN_KEY) ?? "";
  } catch {
    return "";
  }
}

export function rememberWhatsNewSeen(version: string): void {
  try {
    localStorage.setItem(SEEN_KEY, version);
  } catch {
    /* Private window: the account row still carries it. */
  }
}

const SPOTLIGHT_KEY = "napp:spotlight-learned";

export function localSpotlightLearned(): boolean {
  try {
    return localStorage.getItem(SPOTLIGHT_KEY) === "1";
  } catch {
    return false;
  }
}

export function compareVersions(a: string, b: string): number {
  if (!a || !b) return a ? 1 : b ? -1 : 0;
  const left = parts(a);
  const right = parts(b);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference) return difference;
  }
  return 0;
}

/** The further of two readings, as remarks are merged: a device that has
 *  read nothing must not un-read what another read. */
export function laterVersion(a: string, b: string): string {
  return compareVersions(a, b) >= 0 ? a : b;
}

/** "6 October 2026", in the reader's own order for a date. */
export function releaseDate(date: string): string {
  const day = new Date(`${date}T12:00:00`);
  return Number.isNaN(day.getTime())
    ? date
    : day.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}
