import { useSyncExternalStore } from "react";
import type { JSONContent } from "@tiptap/core";
import { withoutInvisibleDocumentEnding } from "./content.ts";

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
  /** The version this editing session started from. If the writer comes back
   * to it after an intermediate autosave, its original edit time is still the
   * truthful one to show in the list. */
  original: Draft;
  originalUpdatedAt: string | null;
  /** Edited since the save queue last took it. Survives note switches, so
   *  moving away from a half-written note never strands the words. */
  dirty: boolean;
}

const slots = new Map<string, Slot>();
const pending = new Set<string>();

/** ProseMirror may emit the same node with object keys in a different order
 * after an edit (for example `text, marks` becomes `marks, text`). Object-key
 * order is not part of the document, so a raw JSON.stringify would turn an
 * invisible serialization detail into a real edit. Arrays stay ordered because
 * node and mark order is meaningful. */
function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalJson(child)]),
  );
}

function sameDraft(left: Draft, right: Draft): boolean {
  return (
    left.title.trimEnd() === right.title.trimEnd() &&
    left.body.trimEnd() === right.body.trimEnd() &&
    JSON.stringify(canonicalJson(withoutInvisibleDocumentEnding(left.content))) ===
      JSON.stringify(canonicalJson(withoutInvisibleDocumentEnding(right.content)))
  );
}

/* ── Surviving a reload ──────────────────────────────────────────────────────
   The Map above is memory, and a refresh is amnesia: until this existed, F5 on
   a half-written note threw the words away with no error and no trace. The
   flush on `pagehide` covers a deliberate close; it does not cover a reload
   that beats the write, and it cannot cover one made offline.

   `sessionStorage`, not `localStorage`, and on purpose: an unsaved note has
   the lifetime of the open tab even though the auth session survives a restart.
   A reload keeps it. Closing the tab drops it; signing out already calls
   `clearDrafts()`, which clears this as well, so no note text outlives the
   archive being open.

   `base` is stored beside `draft` because the three-way merge needs it. A
   draft restored without the version it departed from would read the other
   person's blocks as a deletion — the one failure this store exists to
   prevent. ──────────────────────────────────────────────────────────────── */

const STORE_KEY = "napp:drafts";

let writeTimer: ReturnType<typeof setTimeout> | undefined;

/* Below AUTOSAVE_MS, and that is the whole specification. Coalescing for
   longer than the save takes to fire means the mirror is written only after
   the draft has already gone clean — an empty store that looks like it works
   until the day the network is down and it is the only copy. */
function writeThrough(): void {
  clearTimeout(writeTimer);
  writeTimer = setTimeout(persist, 150);
}

function persist(): void {
  try {
    const dirty: Record<string, { draft: Draft; base: Draft }> = {};
    for (const [id, slot] of slots) {
      if (slot.dirty || pending.has(id)) dirty[id] = { draft: slot.draft, base: slot.base };
    }
    if (Object.keys(dirty).length === 0) sessionStorage.removeItem(STORE_KEY);
    else sessionStorage.setItem(STORE_KEY, JSON.stringify(dirty));
  } catch {
    /* A full or unavailable store costs the reload, not the session. */
  }
}

function restore(): void {
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    if (!raw) return;
    const stored = JSON.parse(raw) as Record<string, { draft: Draft; base: Draft }>;
    for (const [id, { draft, base }] of Object.entries(stored)) {
      if (typeof draft?.title === "string" && typeof base?.title === "string") {
        slots.set(id, { draft, base, original: base, originalUpdatedAt: null, dirty: true });
      }
    }
  } catch {
    /* Unreadable is the same as absent: the archive still holds the note. */
  }
}

restore();

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
  return slots.get(id)?.dirty === true || pending.has(id);
}

export function hasPending(): boolean {
  for (const slot of slots.values()) if (slot.dirty) return true;
  return pending.size > 0;
}

// ── Writing ────────────────────────────────────────────────────────────────

/** Selection landed on a note. A draft with unsaved work wins over the stored
 *  note, exactly as before; a clean one is refreshed, so a stale draft can
 *  never shadow an edit that arrived from the other device. */
export function ensureDraft(id: string, stored: Draft, updatedAt: string | null = null): void {
  const slot = slots.get(id);
  // `storeEntry()` updates the React catalogue after our own autosave. That
  // render must not start a fresh editing session and discard `original`: the
  // writer may still undo that autosave back to the earlier saved document.
  if (slot && sameDraft(slot.base, stored)) return;
  if (slot && isDirty(id)) return;
  slots.set(id, {
    draft: stored,
    base: stored,
    original: stored,
    originalUpdatedAt: updatedAt,
    dirty: false,
  });
  pending.delete(id);
  writeThrough();
  notifyTitle(id);
}

export function editTitle(id: string, title: string): void {
  const slot = slots.get(id);
  if (!slot || slot.draft.title === title) return;
  slot.draft = { title, body: slot.draft.body, content: slot.draft.content };
  slot.dirty = !sameDraft(slot.draft, slot.base);
  if (!slot.dirty) pending.delete(id);
  writeThrough();
  notifyTitle(id);
}

export function editBody(id: string, body: string, content: JSONContent): void {
  const slot = slots.get(id);
  if (!slot) return;
  slot.draft = { title: slot.draft.title, body, content };
  slot.dirty = !sameDraft(slot.draft, slot.base);
  if (!slot.dirty) pending.delete(id);
  writeThrough();
}

/** Text pulled from the other device, applied only once the page has
 *  established that nothing local is waiting for this note. */
export function replaceDraft(id: string, draft: Draft, updatedAt: string | null = null): void {
  slots.set(id, {
    draft,
    base: draft,
    original: draft,
    originalUpdatedAt: updatedAt,
    dirty: false,
  });
  pending.delete(id);
  writeThrough();
  notifyTitle(id);
}

/** A clean write landed. What went to the archive is what the next merge
 *  compares against — not what is on screen now, which may have moved on. */
export function rebaseDraft(id: string, saved: Draft): void {
  const slot = slots.get(id);
  if (!slot) return;
  slot.base = saved;
  pending.delete(id);
  // A save may have landed while the writer was deleting back to the old text.
  // Re-evaluate against the saved version, rather than losing that reversal.
  slot.dirty = !sameDraft(slot.draft, saved);
  writeThrough();
}

/**
 * A merged write landed. The archive now holds `base`; this editor holds
 * `draft`, which is `base` plus anything typed while the write was in flight.
 * Both have to be set together: a base that is not what the archive holds
 * makes the next merge read the other person's blocks as a deletion.
 */
export function reconcileDraft(id: string, base: Draft, draft: Draft, dirty: boolean): void {
  slots.set(id, { draft, base, original: base, originalUpdatedAt: null, dirty });
  if (!dirty) pending.delete(id);
  else pending.delete(id);
  writeThrough();
  notifyTitle(id);
}

export function dropDraft(id: string): void {
  slots.delete(id);
  pending.delete(id);
  writeThrough();
  notifyTitle(id);
}

export function clearDrafts(): void {
  for (const id of [...slots.keys()]) slots.delete(id);
  pending.clear();
  clearTimeout(writeTimer);
  try {
    sessionStorage.removeItem(STORE_KEY);
  } catch {
    /* Nothing to clear is the outcome we wanted anyway. */
  }
}

// ── The save queue's view ──────────────────────────────────────────────────

/** Hands every unsaved draft to the caller and marks them taken. Typing during
 *  the write marks the slot dirty again, so the next drain picks it up. */
export interface PendingDraft {
  id: string;
  draft: Draft;
  /** Present only when the document has returned exactly to the session's
   * original saved content. */
  restoreUpdatedAt: string | null;
}

export function takePending(): PendingDraft[] {
  const taken: PendingDraft[] = [];
  for (const [id, slot] of slots) {
    if (!slot.dirty) continue;
    slot.dirty = false;
    pending.add(id);
    taken.push({
      id,
      draft: slot.draft,
      restoreUpdatedAt: sameDraft(slot.draft, slot.original) ? slot.originalUpdatedAt : null,
    });
  }
  writeThrough();
  return taken;
}

/** A failed write. The draft is still the truth, so only the flag returns. */
export function requeue(id: string): void {
  const slot = slots.get(id);
  if (slot) slot.dirty = true;
  pending.delete(id);
  writeThrough();
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
