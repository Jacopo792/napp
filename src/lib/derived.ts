import { countWords, previewOf } from "./format";
import type { Note, Folder, Meta, NoteMeta, Tag } from "./types";

/* ── Derived reading, computed once ──────────────────────────────────────────
   Stripping Markdown for a preview and counting words are both full passes over
   a note body, and the catalogue wants them for every visible row. Doing that
   during render means every row pays the cost again on every render of the
   page — which, on a corpus of long study notes, is the most expensive thing
   the interface does.

   The cache is keyed on the object itself. A note is replaced, never mutated,
   so a new object is exactly the signal that the text changed: there is no
   dependency array to keep honest, and nothing to invalidate by hand. ─────── */

export interface Derived {
  /** Markdown reduced to a line of readable prose. */
  preview: string;
  words: number;
  /** Title and body folded to lower case once, so search is a substring test
   *  rather than a fresh pass over the whole corpus per typed character. */
  haystack: string;
}

const notes = new WeakMap<Note, Derived>();

export function derivedOf(note: Note): Derived {
  let derived = notes.get(note);
  if (!derived) {
    derived = {
      preview: previewOf(note.body),
      words: countWords(note.body),
      haystack: `${note.title}\n${note.body}`.toLowerCase(),
    };
    notes.set(note, derived);
  }
  return derived;
}

/* ── Metadata, indexed ───────────────────────────────────────────────────────
   `meta.notes.find(...)` reads well and costs nothing once. It was being called
   inside loops in five places — the folder filter, the tag filter, each row's
   tags, each row's pin state, and the rail's counts — which turns a list render
   into O(notes × metadata). Same trick: the index is cached on the Meta object,
   which is likewise replaced rather than mutated. ────────────────────────── */

export interface MetaIndex {
  byNote: Map<string, NoteMeta>;
  byTag: Map<string, Tag>;
  byFolder: Map<string, Folder>;
}

const metas = new WeakMap<Meta, MetaIndex>();

export function indexOf(meta: Meta): MetaIndex {
  let index = metas.get(meta);
  if (!index) {
    index = {
      byNote: new Map(meta.notes.map((note) => [note.id, note])),
      byTag: new Map(meta.tags.map((tag) => [tag.id, tag])),
      byFolder: new Map(meta.folders.map((folder) => [folder.id, folder])),
    };
    metas.set(meta, index);
  }
  return index;
}
