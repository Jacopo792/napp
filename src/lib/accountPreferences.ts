/* Preferences that belong to the person, not to the browser.
 *
 * Every one of these used to live in localStorage alone, which is why two
 * browsers signed into the same account showed different palettes, different
 * wallpapers and a different answer to "is live presence on". Worse, the
 * disagreement was silent: nothing was broken, the two copies simply drifted
 * and whichever one you were looking at was the one you believed.
 *
 * One jsonb column on `profiles` fixes it, in three moves and no more:
 *
 * - **Pull on sign-in.** The row wins over what this browser had. Local
 *   storage stays as a cache so the first paint is not a round trip, but it is
 *   never the authority.
 * - **Push on change.** Debounced, and the whole blob every time — these are a
 *   handful of scalars, and a per-field merge is a conflict resolver nobody
 *   asked for.
 * - **Follow the row.** `profiles` is already published to Realtime, so a
 *   change made in the other browser arrives here instead of waiting for the
 *   next sign-in. Our own write comes back too and is recognised by its
 *   payload rather than by a flag, which is what keeps a loop from starting.
 *
 * What stays local, deliberately: pane widths, collapsed groups, the expanded
 * folders and the per-note "remarks I have seen" stamps. Those are facts about
 * a device looking at the archive, not about the person reading it. */
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  loadProofreaderPreference,
  saveProofreaderPreference,
} from "@/features/editor/lib/proofread";
import {
  adoptWallpaper,
  currentAppearance,
  setAppearance,
  subscribeToAppearance,
  wallpaperBlob,
} from "./appearance";
import { downloadObject, uploadObject } from "./archiveAssets";
import { prepareImageForNote } from "./image";
import { loadAutoLock, saveAutoLock } from "./autoLock";
import { currentAxes, setAxes, subscribeToAxes } from "./axes";
import {
  DEFAULT_FLAGS,
  mergeAccountPreferences,
  type AccountPreferences,
} from "./preferenceShape.ts";
import type { AppSession } from "./session";
import { fail, supabase } from "./supabaseClient";
import {
  currentWritingPreferences,
  setWritingPreferences,
  subscribeToWritingPreferences,
} from "./writingPreferences";

export { DEFAULT_FLAGS };
export type { AccountFlags, AccountPreferences } from "./preferenceShape.ts";

/** What this browser holds right now: what a fresh account's first push
 *  writes, and what a field the row does not carry falls back to. */
export function localPreferences(): AccountPreferences {
  return {
    ...DEFAULT_FLAGS,
    appearance: currentAppearance(),
    axes: currentAxes(),
    writing: currentWritingPreferences(),
    proofreader: loadProofreaderPreference(),
    autoLock: loadAutoLock(),
  };
}

/** Hand the stores their values without echoing a write back up. The setters
 *  are the same ones Settings calls, so applying is one code path and not a
 *  second copy of "what a preference does when it changes". */
function apply(preferences: AccountPreferences): void {
  setAppearance(preferences.appearance);
  setAxes(preferences.axes);
  setWritingPreferences(preferences.writing);
  saveProofreaderPreference(preferences.proofreader);
  saveAutoLock(preferences.autoLock);
}

/* ── The wallpaper's bytes ──────────────────────────────────────────────────
   Every other preference is a scalar and travels in the row. A wallpaper is a
   picture, so the row carries only its object id and the bytes go where every
   other picture in this archive goes — `note-images`, through the upload and
   download this module's neighbours already own. Nothing new is granted: it is
   the same private bucket, under the same archive, that a photograph pasted
   into a note lands in.

   IndexedDB stays the device's copy, so the wallpaper is on screen at the
   first paint rather than after a download. This key is how the device knows
   which shared picture that copy is. */
const HELD_WALLPAPER = "napp:wallpaper-object";

function heldWallpaper(): string | null {
  try {
    return localStorage.getItem(HELD_WALLPAPER);
  } catch {
    return null;
  }
}

function holdWallpaper(objectId: string | null): void {
  try {
    if (objectId) localStorage.setItem(HELD_WALLPAPER, objectId);
    else localStorage.removeItem(HELD_WALLPAPER);
  } catch {
    /* Private mode: the picture still shows, it is simply fetched again. */
  }
}

/* ponytail: the old object is left in the bucket when a wallpaper is replaced.
   Sweep it if wallpapers ever stop being one small picture per account. */
async function shareWallpaper(session: AppSession): Promise<void> {
  const appearance = currentAppearance();
  if (!appearance.wallpaper || appearance.wallpaperObject) return;
  const blob = await wallpaperBlob();
  if (!blob) return;
  const objectId = crypto.randomUUID();
  /* Downscaled on the way out for the same reason a note's picture is: what
     was chosen is whatever came off a phone, and the other browser has to
     download it before it can show anything. */
  await uploadObject(session, objectId, await prepareImageForNote(blob));
  holdWallpaper(objectId);
  setAppearance({ ...currentAppearance(), wallpaperObject: objectId });
}

async function collectWallpaper(session: AppSession, objectId: string | null): Promise<void> {
  if (!objectId || objectId === heldWallpaper()) return;
  await adoptWallpaper(await downloadObject(session, objectId, "image/webp"));
  holdWallpaper(objectId);
}

/** The last blob written or read, so the Realtime echo of our own push is
 *  recognised and dropped rather than re-applied. */
let settled = "";

export async function pullAccountPreferences(session: AppSession): Promise<AccountPreferences> {
  const result = await supabase
    .from("profile_preferences")
    .select("preferences")
    .eq("user_id", session.userId)
    .maybeSingle();
  fail(result.error);
  const stored = (result.data as { preferences: unknown } | null)?.preferences;
  const preferences = mergeAccountPreferences(stored, localPreferences());
  settled = JSON.stringify(preferences);
  apply(preferences);
  /* The picture is a download, so it lands after the colours do rather than
     holding them up — and a failure leaves this device on its own copy. */
  void collectWallpaper(session, preferences.appearance.wallpaperObject).catch(() => undefined);
  return preferences;
}

let pending: number | undefined;

/** Debounced because a colour picker is a stream of values, not one: dragging
 *  the accent slider is fifty preference changes and one row worth writing. */
export function pushAccountPreferences(session: AppSession, preferences: AccountPreferences): void {
  const blob = JSON.stringify(preferences);
  if (blob === settled) return;
  settled = blob;
  window.clearTimeout(pending);
  pending = window.setTimeout(() => {
    /* A picture chosen on this device is uploaded before the row that names it
       is written, so the other browser never reads an id with nothing behind
       it. The upload sets `wallpaperObject`, which comes back through this
       function as one more change to push. */
    void shareWallpaper(session).catch(() => undefined);
    void supabase
      .from("profile_preferences")
      .upsert({ user_id: session.userId, preferences }, { onConflict: "user_id" });
  }, 500);
}

/** The stores that live outside React: whatever moves in them is pushed with
 *  the flags the caller is holding. Returns the unsubscribe. */
export function watchLocalStores(onChange: () => void): () => void {
  const offs = [
    subscribeToAppearance(onChange),
    subscribeToAxes(onChange),
    subscribeToWritingPreferences(onChange),
  ];
  return () => offs.forEach((off) => off());
}

export async function unsubscribeFromAccountPreferences(channel: RealtimeChannel): Promise<void> {
  await supabase.removeChannel(channel);
}

/** The other browser's change, arriving.
 *
 *  Its own table, and not a column on `profiles`, for two reasons that only
 *  appeared once something wrote it often. `subscribeToArchive` treats any
 *  change to `profiles` as a wake-up and reloads the whole archive snapshot —
 *  so a colour slider dragged here reloaded *her* archive over there. And
 *  `profiles_read_shared` has no column list, so sharing an archive would have
 *  handed her your wallpaper, your palette and your lock timeout.
 *
 *  `*` rather than `UPDATE`: the first write an account ever makes is the
 *  insert half of the upsert, and the browser left open in the other room
 *  wants that one too. */
export function subscribeToAccountPreferences(
  session: AppSession,
  onChange: (preferences: AccountPreferences) => void,
): RealtimeChannel {
  return supabase
    .channel(`preferences:${session.userId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "profile_preferences",
        filter: `user_id=eq.${session.userId}`,
      },
      (payload) => {
        const stored = (payload.new as { preferences?: unknown } | null)?.preferences;
        const preferences = mergeAccountPreferences(stored, localPreferences());
        const blob = JSON.stringify(preferences);
        if (blob === settled) return;
        settled = blob;
        apply(preferences);
        void collectWallpaper(session, preferences.appearance.wallpaperObject).catch(
          () => undefined,
        );
        onChange(preferences);
      },
    )
    .subscribe();
}
