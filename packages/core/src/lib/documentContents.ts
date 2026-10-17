/* The document's table of contents, for the one reader that props cannot
 * reach: a `[TOC]` block is drawn by a node view inside the editor, which is
 * built by Tiptap and not by the screen that knows the structure. The screen
 * writes the contents here; the block reads them, and asks for a place to be
 * opened with an event the screen answers — the way `napp:take-up-the-pen`
 * crosses the same boundary. */
import { useSyncExternalStore } from "react";
import { citationNumbers, type CitationContext, type Source } from "./citations";
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
  /** What a citation and the bibliography are printed from. */
  citing: CitationContext;
}

let base: { chapters: ReferenceChapter[]; settings: ReferenceSettings } = {
  chapters: [],
  settings: { numbered: false, footnotes: "chapter", language: "en", citations: "author-date" },
};
let sources = new Map<string, Source>();
let live: { noteId: string; targets: ChapterTargets } | null = null;
let snapshot: ReferenceSnapshot = {
  ...base,
  counted: new Map(),
  citing: { style: "author-date", language: "en", sources, numbers: new Map() },
};
const referenceListeners = new Set<() => void>();

function recount() {
  const chapters = live
    ? base.chapters.map((chapter) =>
        chapter.id === live!.noteId ? { ...chapter, targets: live!.targets } : chapter,
      )
    : base.chapters;
  snapshot = {
    chapters,
    settings: base.settings,
    counted: countTargets(chapters, base.settings),
    citing: {
      style: base.settings.citations,
      language: base.settings.language,
      sources,
      numbers: citationNumbers(chapters.flatMap((chapter) => chapter.targets.citations)),
    },
  };
  referenceListeners.forEach((listener) => listener());
}

/** The archive's library, as `archive_sources` last answered. */
export function setDocumentSources(next: Source[]): void {
  sources = new Map(next.map((source) => [source.id, source]));
  recount();
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

/* Taking a file of sources in is the screen's to do — it holds the session —
   but it is asked for from the citation picker, inside the editor. */
let importer: ((text: string) => Promise<number>) | null = null;

export function setSourceImporter(next: ((text: string) => Promise<number>) | null): void {
  importer = next;
}

/** How many sources the file held, once they are in the library. */
export function importSources(text: string): Promise<number> {
  return importer ? importer(text) : Promise.reject(new Error("Open a document to import into"));
}

export const OPEN_PLACE = "napp:open-place";

/** Something inside a chapter that is not words: a footnote, a caption, a
 *  heading — by its id when it has one, else by its place among its kind. */
export interface PlaceTarget {
  kind: TargetKind;
  id: string | null;
  index: number;
}

/** Words to go back to and light for a moment — the passage a note was
 *  continued from. Found by its words, so an edit to them loses the light,
 *  never the chapter. */
export interface PassagePlace {
  passage: string;
}

export interface BlockPlace {
  blockId: string;
}
export type Place = string | PlaceTarget | PassagePlace | BlockPlace;

export interface PlaceRequest {
  noteId: string;
  blockId?: string;
  /** A heading to go to inside it. */
  text?: string;
  target?: PlaceTarget;
  passage?: string;
}

export function openPlace(request: PlaceRequest): void {
  window.dispatchEvent(new CustomEvent<PlaceRequest>(OPEN_PLACE, { detail: request }));
}
