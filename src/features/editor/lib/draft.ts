import { useSyncExternalStore } from "react";
import type { JSONContent } from "@tiptap/core";

/* ── The draft store ─────────────────────────────────────────────────────────
   The text being typed does not live in React state, and this is the whole
   point of the file.

   A note body reaching `useState` means every keystroke re-renders the page
   that owns it, and with it the catalogue, the rail and the axis bar — none of
   which have anything to say about the character just typed. Tiptap already
   owns the document; React only ever needed the text at two moments: to save it
   and to hand it to a freshly mounted editor. So the drafts sit in a
   module-level Map, and the one thing that genuinely tracks them — the title
   field, on its own note's title — subscribes to that alone.

   Typing a body therefore re-renders nothing at all.

   This follows the store idiom already used by lib/axes.ts and lib/media.ts —
   a module singleton plus useSyncExternalStore — rather than introducing a
   state library for one Map. ─────────────────────────────────────────────── */

export interface Draft {
  title: string;
  body: string;
  content: JSONContent;
}

interface Slot {
  draft: Draft;
  /** What this draft was last in agreement with the archive about: the note as
   *  it was read, or as it was last written. A merge needs three documents and
   *  this is the third — without it, a save that collides with somebody else's
   *  can only overwrite or be overwritten. */
  base: Draft;
  /** Edited since the save queue last took it. Survives note switches, so
   *  moving away from a half-written note never strands the words. */
  dirty: boolean;
}

const slots = new Map<string, Slot>();

const titleListeners = new Map<string, Set<() => void>>();

function notifyTitle(id: string): void {
  titleListeners.get(id)?.forEach((listener) => listener());
}

function subscriber(id: string) {
  return (listener: () => void) => {
    let set = titleListeners.get(id);
    if (!set) titleListeners.set(id, (set = new Set()));
    set.add(listener);
    return () => {
      set!.delete(listener);
      if (set!.size === 0) titleListeners.delete(id);
    };
  };
}

// ── Reading ────────────────────────────────────────────────────────────────

export function readDraft(id: string): Draft | undefined {
  return slots.get(id)?.draft;
}

/** The version this draft departed from, for a three-way merge. */
export function readBase(id: string): Draft | undefined {
  return slots.get(id)?.base;
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
  slots.set(id, { draft: stored, base: stored, dirty: false });
  notifyTitle(id);
}

export function editTitle(id: string, title: string): void {
  const slot = slots.get(id);
  if (!slot || slot.draft.title === title) return;
  slot.draft = { title, body: slot.draft.body, content: slot.draft.content };
  slot.dirty = true;
  notifyTitle(id);
}

export function editBody(id: string, body: string, content: JSONContent): void {
  const slot = slots.get(id);
  if (!slot) return;
  slot.draft = { title: slot.draft.title, body, content };
  slot.dirty = true;
}

/** Text pulled from the other device, applied only once the page has
 *  established that nothing local is waiting for this note. */
export function replaceDraft(id: string, draft: Draft): void {
  slots.set(id, { draft, base: draft, dirty: false });
  notifyTitle(id);
}

/** A clean write landed. What went to the archive is what the next merge
 *  compares against — not what is on screen now, which may have moved on. */
export function rebaseDraft(id: string, saved: Draft): void {
  const slot = slots.get(id);
  if (slot) slot.base = saved;
}

/**
 * A merged write landed. The archive now holds `base`; this editor holds
 * `draft`, which is `base` plus anything typed while the write was in flight.
 * Both have to be set together: a base that is not what the archive holds
 * makes the next merge read the other person's blocks as a deletion.
 */
export function reconcileDraft(id: string, base: Draft, draft: Draft, dirty: boolean): void {
  slots.set(id, { draft, base, dirty });
  notifyTitle(id);
}

export function dropDraft(id: string): void {
  slots.delete(id);
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

// ── Hooks ──────────────────────────────────────────────────────────────────

export function useDraftTitle(id: string | null): string {
  const subscribe = id ? subscriber(id) : noopSubscribe;
  return useSyncExternalStore(
    subscribe,
    () => (id ? (slots.get(id)?.draft.title ?? "") : ""),
    () => "",
  );
}

function noopSubscribe(): () => void {
  return () => {};
}
