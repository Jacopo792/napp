/* What a stored preferences blob is allowed to be.
 *
 * Kept apart from `accountPreferences.ts` for one reason: that module reaches
 * the Supabase client, and a module that reaches the Supabase client cannot be
 * imported by `node --experimental-strip-types`. This half is pure, so it has
 * a test — which is the half worth having one, because it decides what a
 * browser shows after a pull and it is reading JSON that has been sitting in a
 * column across however many versions of this client. */
import { DEFAULT_APPEARANCE, type Appearance } from "./appearance.ts";
import { AUTO_LOCK_CHOICES, type AutoLockMinutes } from "./autoLock.ts";
import { DEFAULT_AXES, type Axes } from "./axes.ts";
import { PRESENCE_PALETTES, type WritingPreferences } from "./writingPreferences.ts";
export type { RemarksSeen } from "./commentThreads.ts";
import type { RemarksSeen } from "./commentThreads.ts";

/** The switches that have no store of their own. */
export interface AccountFlags {
  /** Broadcast that you are in the archive right now — the ring on a face in
   *  the roster, and nothing else. Mutual: the channel is joined only while
   *  publishing, so switching it off also stops you seeing other people's. */
  presence: boolean;
  /** Draw the other members on the note you have open: their face beside the
   *  title, their caret in the text. Purely what *you* are shown — it does not
   *  stop them seeing you, which is what the switch above is for. */
  collaborators: boolean;
  proofreader: boolean;
  autoLock: AutoLockMinutes;
}

export interface AccountPreferences extends AccountFlags {
  appearance: Appearance;
  axes: Axes;
  writing: WritingPreferences;
  remarksSeen: RemarksSeen;
}

/**
 * The later of two readings, note by note.
 *
 * The one place in this blob that is not last-write-wins, and it has to be:
 * this is a watermark, so the answer to "which of these two is right" is
 * neither — it is the further one. Two devices that have each read different
 * conversations have both read them, and a device that has read none of them
 * must not un-read the other's.
 *
 * The keys come out sorted, because the write guard compares `JSON.stringify`
 * output and insertion order is part of that string: unsorted, the same map
 * assembled from two directions is two different blobs and the guard never
 * matches.
 *
 * ponytail: nothing prunes a note that has been deleted for good. It is one
 * short string per note ever opened; sweep it against the catalogue if an
 * archive ever gets big enough for that to matter.
 */
export function mergeRemarksSeen(a: RemarksSeen, b: RemarksSeen): RemarksSeen {
  const merged: RemarksSeen = {};
  for (const noteId of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
    const mine = a[noteId] ?? "";
    const theirs = b[noteId] ?? "";
    merged[noteId] = mine > theirs ? mine : theirs;
  }
  return merged;
}

export const DEFAULT_FLAGS: AccountFlags = {
  presence: false,
  collaborators: true,
  proofreader: true,
  autoLock: 0,
};

/**
 * The four switches, and nothing else.
 *
 * Load-bearing. `AccountPreferences` extends `AccountFlags`, so handing the
 * whole object to a `useState<AccountFlags>` type-checks and quietly carries
 * the appearance, the axes and the palette along inside it — and the push
 * spreads that state *last*, over a fresh reading of the live stores. The
 * effect is that changing a colour writes back the colour from the last pull:
 * the account never hears about a palette anybody chose. Take the four.
 */
export function flagsOf(preferences: AccountFlags): AccountFlags {
  return {
    presence: preferences.presence,
    collaborators: preferences.collaborators,
    proofreader: preferences.proofreader,
    autoLock: preferences.autoLock,
  };
}

/**
 * The one place the shape is assembled, and therefore the one place its key
 * order is decided.
 *
 * Order is not cosmetic here: both sides of the write guard are compared as
 * `JSON.stringify` output, which keeps insertion order, so the same values
 * assembled in a different order are a different string — the guard never
 * matches, every mount rewrites the row it has just read, and each browser
 * re-applies the echo of its own write. Assembling both the merge and the
 * local reading through this function is what makes that impossible rather
 * than merely unlikely.
 */
export function accountPreferences(
  appearance: Appearance,
  axes: Axes,
  writing: WritingPreferences,
  flags: AccountFlags,
  remarksSeen: RemarksSeen,
): AccountPreferences {
  return { appearance, axes, writing, remarksSeen, ...flagsOf(flags) };
}

function isAutoLock(value: unknown): value is AutoLockMinutes {
  return (AUTO_LOCK_CHOICES as readonly number[]).includes(value as number);
}

/**
 * The row over what this browser holds, and what this browser holds over the
 * defaults.
 *
 * That middle term is the whole subtlety. A field the row does not carry — an
 * older client wrote it, or this account has never saved — must keep the local
 * value rather than snap back to a default, or signing in on the browser you
 * have been using for a year would quietly undo a year of choices on the
 * strength of an empty column.
 */
export function mergeAccountPreferences(
  stored: unknown,
  local: AccountPreferences,
): AccountPreferences {
  const row = (stored ?? {}) as Partial<AccountPreferences>;
  const writing = row.writing as Partial<WritingPreferences> | undefined;
  return accountPreferences(
    { ...DEFAULT_APPEARANCE, ...local.appearance, ...(row.appearance ?? {}) },
    { ...DEFAULT_AXES, ...local.axes, ...(row.axes ?? {}) },
    {
      presencePalette: PRESENCE_PALETTES.some((palette) => palette.id === writing?.presencePalette)
        ? writing!.presencePalette!
        : local.writing.presencePalette,
    },
    {
      presence: typeof row.presence === "boolean" ? row.presence : local.presence,
      collaborators:
        typeof row.collaborators === "boolean" ? row.collaborators : local.collaborators,
      proofreader: typeof row.proofreader === "boolean" ? row.proofreader : local.proofreader,
      autoLock: isAutoLock(row.autoLock) ? row.autoLock : local.autoLock,
    },
    mergeRemarksSeen(local.remarksSeen, asSeen(row.remarksSeen)),
  );
}

function asSeen(value: unknown): RemarksSeen {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const seen: RemarksSeen = {};
  for (const [noteId, at] of Object.entries(value)) if (typeof at === "string") seen[noteId] = at;
  return seen;
}
