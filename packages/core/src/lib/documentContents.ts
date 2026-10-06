/* The document's table of contents, for the one reader that props cannot
 * reach: a `[TOC]` block is drawn by a node view inside the editor, which is
 * built by Tiptap and not by the screen that knows the structure. The screen
 * writes the contents here; the block reads them, and asks for a place to be
 * opened with an event the screen answers — the way `napp:take-up-the-pen`
 * crosses the same boundary. */
import { useSyncExternalStore } from "react";
import type { ContentsEntry } from "./manuscript";

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

export const OPEN_PLACE = "napp:open-place";

export interface PlaceRequest {
  noteId: string;
  /** A heading to go to inside it. */
  text?: string;
}

export function openPlace(request: PlaceRequest): void {
  window.dispatchEvent(new CustomEvent<PlaceRequest>(OPEN_PLACE, { detail: request }));
}
