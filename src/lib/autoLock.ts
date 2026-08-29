import { useEffect, useRef } from "react";

/* ── Locking the archive when nobody is there ─────────────────────────────────
   This is the one preference in the app that protects something. The archive
   key lives in this browser for as long as the tab does, so a laptop left open
   on a kitchen table is an unlocked archive — and it is a *shared* archive, so
   it is not only your own notes sitting there.

   Locking is exactly what the sign-out button already does: the key is dropped,
   the drafts are flushed first so nothing is lost, and reading again means
   signing in again. Nothing is deleted and nothing is sent anywhere.

   "Never" is the default, because an archive that locks itself unasked is a
   surprise, and surprises about your own notes are worse than the setting being
   off until you choose it. ─────────────────────────────────────────────────── */

export const AUTO_LOCK_CHOICES = [0, 5, 15, 60] as const;
export type AutoLockMinutes = (typeof AUTO_LOCK_CHOICES)[number];

export const AUTO_LOCK_LABELS: Record<AutoLockMinutes, string> = {
  0: "Never",
  5: "5 min",
  15: "15 min",
  60: "1 hour",
};

const KEY = "napp:auto-lock";

function isChoice(value: number): value is AutoLockMinutes {
  return (AUTO_LOCK_CHOICES as readonly number[]).includes(value);
}

export function loadAutoLock(): AutoLockMinutes {
  try {
    const raw = Number(localStorage.getItem(KEY));
    return isChoice(raw) ? raw : 0;
  } catch {
    return 0;
  }
}

export function saveAutoLock(minutes: AutoLockMinutes): void {
  try {
    localStorage.setItem(KEY, String(minutes));
  } catch {
    /* Private mode: the choice still holds for this session. */
  }
}

/** Activity that counts as "still here". Passive so none of it costs a frame. */
const ACTIVITY = ["pointerdown", "keydown", "wheel", "touchstart"] as const;

/**
 * Locks after `minutes` of no activity in this tab. 0 disables it entirely.
 *
 * `onLock` is held in a ref rather than in the dependency list: it is rebuilt
 * on every render of the route, and depending on it would restart the timer
 * dozens of times a second while you type — which is a timer that never fires.
 */
export function useAutoLock(minutes: AutoLockMinutes, onLock: () => void): void {
  const lock = useRef(onLock);
  lock.current = onLock;

  useEffect(() => {
    if (minutes === 0) return;

    let timer = 0;
    const arm = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => lock.current(), minutes * 60_000);
    };

    /* Coming back to a tab that was hidden past its deadline locks at once
       rather than granting a fresh window for having been away. */
    const onVisibility = () => {
      if (document.visibilityState === "visible") arm();
    };

    for (const event of ACTIVITY) window.addEventListener(event, arm, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    arm();

    return () => {
      window.clearTimeout(timer);
      for (const event of ACTIVITY) window.removeEventListener(event, arm);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [minutes]);
}
