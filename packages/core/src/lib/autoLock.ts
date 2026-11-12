import { useEffect, useRef } from "react";

/* ── Locking the archive when nobody is there ─────────────────────────────────
   This is the one preference in the app that protects something. The signed-in
   session persists on this device until sign-out, so a laptop left open
   on a kitchen table is an open archive — and it is a *shared* archive, so it
   is not only your own notes sitting there.

   Locking is exactly what the sign-out button already does: the session is
   dropped, the drafts are flushed first so nothing is lost, the cached notes
   leave this device with `clearNoteStore()`, and reading again means signing
   in again. Nothing is deleted from the archive and nothing is sent anywhere.

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
const DEADLINE_KEY = "napp:auto-lock-deadline";

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

    /* The deadline is a time, kept where every tab and the next launch can
       read it. A timer alone restarts from zero whenever it is re-armed, and
       does not run at all while the laptop is asleep or the app is closed. */
    const due = () => Number(localStorage.getItem(DEADLINE_KEY)) || 0;
    const expire = () => {
      localStorage.removeItem(DEADLINE_KEY);
      lock.current();
    };

    let timer = 0;
    let written = 0;
    const arm = () => {
      const now = Date.now();
      // Typing calls this on every key; the stored copy need not be that fresh.
      if (now - written > 10_000) {
        localStorage.setItem(DEADLINE_KEY, String(now + minutes * 60_000));
        written = now;
      }
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        // Another tab may have been busy since this timer was set.
        if (Date.now() >= due()) expire();
        else arm();
      }, minutes * 60_000);
    };

    /* Coming back to a tab that was hidden past its deadline locks at once
       rather than granting a fresh window for having been away. */
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      const deadline = due();
      if (deadline && Date.now() >= deadline) expire();
      else arm();
    };

    // A launch after the deadline passed while the app was closed.
    const left = due();
    if (left && Date.now() >= left) {
      expire();
      return;
    }

    for (const event of ACTIVITY) window.addEventListener(event, arm, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    arm();

    return () => {
      window.clearTimeout(timer);
      // Signed out or switched off: the next sign-in starts its own window.
      localStorage.removeItem(DEADLINE_KEY);
      for (const event of ACTIVITY) window.removeEventListener(event, arm);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [minutes]);
}
