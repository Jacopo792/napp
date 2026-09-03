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
): AccountPreferences {
  return { appearance, axes, writing, ...flagsOf(flags) };
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
  );
}
