/* The document's table of contents, for the one reader that props cannot
 * reach: a `[TOC]` block is drawn by a node view inside the editor, which is
 * built by Tiptap and not by the screen that knows the structure. The screen
 * writes the contents here; the block reads them, and asks for a place to be
 * opened with an event the screen answers — the way `napp:take-up-the-pen`
 * crosses the same boundary. */
import { useSyncExternalStore } from "react";
import type { ContentsEntry } from "./manuscript";
import {
  countTargets,
  type ChapterTargets,
  type CountedChapter,
  type ReferenceChapter,
  type ReferenceSettings,
  type TargetKind,
} from "./references";

let contents: ContentsEntry[] = [];
const listeners = new Set<() => void>();

export function setDocumentContents(next: ContentsEntry[]): void {
  if (next === contents) return;
  contents = next;
  listeners.forEach((listener) => listener());
}

export function useDocumentContents(): ContentsEntry[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => contents,
    () => contents,
  );
}

/* ── References ────────────────────────────────────────────────────────────
   The same crossing for the footnotes, captions and cross-references: the
   screen hands over every chapter's targets from the projections it already
   holds, the open chapter's editor hands over its own as they are typed —
   the projection is a save behind, and a reference to a caption written a
   second ago must not read "missing" — and every reader inside the editor
   asks one counted snapshot. */

export interface ReferenceSnapshot {
  chapters: ReferenceChapter[];
  settings: ReferenceSettings;
  counted: Map<string, CountedChapter>;
}

let base: { chapters: ReferenceChapter[]; settings: ReferenceSettings } = {
  chapters: [],
  settings: { numbered: false, footnotes: "chapter", language: "en" },
};
let live: { noteId: string; targets: ChapterTargets } | null = null;
let snapshot: ReferenceSnapshot = { ...base, counted: new Map() };
const referenceListeners = new Set<() => void>();

function recount() {
  const chapters = live
    ? base.chapters.map((chapter) =>
        chapter.id === live!.noteId ? { ...chapter, targets: live!.targets } : chapter,
      )
    : base.chapters;
  snapshot = { chapters, settings: base.settings, counted: countTargets(chapters, base.settings) };
  referenceListeners.forEach((listener) => listener());
}

export function setDocumentReferences(
  chapters: ReferenceChapter[],
  settings: ReferenceSettings,
): void {
  base = { chapters, settings };
  recount();
}

/** The open chapter's targets, read out of its editor as it changes. */
export function setLiveTargets(noteId: string, targets: ChapterTargets | null): void {
  if (!targets) {
    if (live?.noteId !== noteId) return;
    live = null;
  } else live = { noteId, targets };
  recount();
}

export function useReferences(): ReferenceSnapshot {
  return useSyncExternalStore(
    (listener) => {
      referenceListeners.add(listener);
      return () => referenceListeners.delete(listener);
    },
    () => snapshot,
    () => snapshot,
  );
}

export function referenceSnapshot(): ReferenceSnapshot {
  return snapshot;
}

export const OPEN_PLACE = "napp:open-place";

/** Something inside a chapter that is not words: a footnote, a caption, a
 *  heading — by its id when it has one, else by its place among its kind. */
export interface PlaceTarget {
  kind: TargetKind;
  id: string | null;
  index: number;
}

/** A passage somebody left a note on, by the thread that holds it. */
export interface ThreadPlace {
  thread: string;
}

export type Place = string | PlaceTarget | ThreadPlace;

export interface PlaceRequest {
  noteId: string;
  /** A heading to go to inside it. */
  text?: string;
  target?: PlaceTarget;
  thread?: string;
}

export function openPlace(request: PlaceRequest): void {
  window.dispatchEvent(new CustomEvent<PlaceRequest>(OPEN_PLACE, { detail: request }));
}
