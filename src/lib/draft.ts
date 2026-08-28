import { useSyncExternalStore } from "react";
import { countChars, countWords } from "./format";

/* ── The draft store ─────────────────────────────────────────────────────────
   The text being typed does not live in React state, and this is the whole
   point of the file.

   A note body reaching `useState` means every keystroke re-renders the page
   that owns it, and with it the catalogue, the rail and the axis bar — none of
   which have anything to say about the character just typed. CodeMirror already
   owns the document; React only ever needed the text at three moments: to save
   it, to count it, and to hand it to a freshly mounted editor. So the drafts sit
   in a module-level Map, and the two things that genuinely track them subscribe
   separately:

     • the title field, on its own note's title;
     • the word/character readout, on its own note's body, throttled.

   Typing a body therefore re-renders nothing at all until the readout ticks.

   This follows the store idiom already used by lib/axes.ts and lib/media.ts —
   a module singleton plus useSyncExternalStore — rather than introducing a
   state library for one Map. ─────────────────────────────────────────────── */

export interface Draft {
  title: string;
  body: string;
}

interface Slot {
  draft: Draft;
  /** Edited since the save queue last took it. Survives note switches, so
   *  moving away from a half-written note never strands the words. */
  dirty: boolean;
}

const slots = new Map<string, Slot>();

/** Split by what the subscriber cares about: a body keystroke must never wake
 *  the title field, and a title keystroke must never recount the body. */
const titleListeners = new Map<string, Set<() => void>>();
const metricListeners = new Map<string, Set<() => void>>();

function notify(map: Map<string, Set<() => void>>, id: string): void {
  map.get(id)?.forEach((listener) => listener());
}

function subscriber(map: Map<string, Set<() => void>>, id: string) {
  return (listener: () => void) => {
    let set = map.get(id);
    if (!set) map.set(id, (set = new Set()));
    set.add(listener);
    return () => {
      set!.delete(listener);
      if (set!.size === 0) map.delete(id);
    };
  };
}

// ── Reading ────────────────────────────────────────────────────────────────

export function readDraft(id: string): Draft | undefined {
  return slots.get(id)?.draft;
}

export function isDirty(id: string): boolean {
  return slots.get(id)?.dirty === true;
}

export function hasPending(): boolean {
  for (const slot of slots.values()) if (slot.dirty) return true;
  return false;
}

// ── Writing ────────────────────────────────────────────────────────────────

/** Selection landed on a note. A draft with unsaved work wins over the stored
 *  note, exactly as before; a clean one is refreshed, so a stale draft can
 *  never shadow an edit that arrived from the other device. */
export function ensureDraft(id: string, stored: Draft): void {
  const slot = slots.get(id);
  if (slot?.dirty) return;
  slots.set(id, { draft: stored, dirty: false });
  metricsFor(id, stored.body);
  notify(titleListeners, id);
  notify(metricListeners, id);
}

export function editTitle(id: string, title: string): void {
  const slot = slots.get(id);
  if (!slot || slot.draft.title === title) return;
  slot.draft = { title, body: slot.draft.body };
  slot.dirty = true;
  notify(titleListeners, id);
}

export function editBody(id: string, body: string): void {
  const slot = slots.get(id);
  if (!slot || slot.draft.body === body) return;
  slot.draft = { title: slot.draft.title, body };
  slot.dirty = true;
  scheduleMetrics(id);
}

/** Text pulled from the other device, applied only once the page has
 *  established that nothing local is waiting for this note. */
export function replaceDraft(id: string, draft: Draft): void {
  slots.set(id, { draft, dirty: false });
  metricsFor(id, draft.body);
  notify(titleListeners, id);
  notify(metricListeners, id);
}

export function dropDraft(id: string): void {
  slots.delete(id);
  metrics.delete(id);
  const timer = metricTimers.get(id);
  if (timer !== undefined) {
    window.clearTimeout(timer);
    metricTimers.delete(id);
  }
}

export function clearDrafts(): void {
  for (const id of [...slots.keys()]) dropDraft(id);
}

// ── The save queue's view ──────────────────────────────────────────────────

/** Hands every unsaved draft to the caller and marks them taken. Typing during
 *  the write marks the slot dirty again, so the next drain picks it up. */
export function takePending(): [string, Draft][] {
  const taken: [string, Draft][] = [];
  for (const [id, slot] of slots) {
    if (!slot.dirty) continue;
    slot.dirty = false;
    taken.push([id, slot.draft]);
  }
  return taken;
}

/** A failed write. The draft is still the truth, so only the flag returns. */
export function requeue(id: string): void {
  const slot = slots.get(id);
  if (slot) slot.dirty = true;
}

// ── Metrics, throttled ─────────────────────────────────────────────────────

export interface Metrics {
  words: number;
  chars: number;
}

const EMPTY_METRICS: Metrics = { words: 0, chars: 0 };
const METRICS_MS = 300;

/** The counted body is kept alongside the counts so an unchanged document is
 *  never recounted, and so getSnapshot can return a stable reference. */
const metrics = new Map<string, { counted: string; value: Metrics }>();
const metricTimers = new Map<string, number>();

function metricsFor(id: string, body: string): Metrics {
  const cached = metrics.get(id);
  if (cached && cached.counted === body) return cached.value;
  const value: Metrics = { words: countWords(body), chars: countChars(body) };
  metrics.set(id, { counted: body, value });
  return value;
}

function scheduleMetrics(id: string): void {
  if (metricTimers.has(id)) return;
  metricTimers.set(
    id,
    window.setTimeout(() => {
      metricTimers.delete(id);
      const body = slots.get(id)?.draft.body;
      if (body === undefined) return;
      const before = metrics.get(id)?.value;
      if (metricsFor(id, body) !== before) notify(metricListeners, id);
    }, METRICS_MS),
  );
}

// ── Hooks ──────────────────────────────────────────────────────────────────

export function useDraftTitle(id: string | null): string {
  const subscribe = id ? subscriber(titleListeners, id) : noopSubscribe;
  return useSyncExternalStore(
    subscribe,
    () => (id ? (slots.get(id)?.draft.title ?? "") : ""),
    () => "",
  );
}

export function useDraftMetrics(id: string | null): Metrics {
  const subscribe = id ? subscriber(metricListeners, id) : noopSubscribe;
  return useSyncExternalStore(
    subscribe,
    () => (id ? metricsFor(id, slots.get(id)?.draft.body ?? "") : EMPTY_METRICS),
    () => EMPTY_METRICS,
  );
}

function noopSubscribe(): () => void {
  return () => {};
}
