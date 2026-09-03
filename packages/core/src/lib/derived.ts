/* With the extension, and for the reason `exchange.ts` carries one: `pnpm test`
   runs under `node --experimental-strip-types`, which does not resolve an
   extensionless relative import. `allowImportingTsExtensions` is already on, so
   the extension costs nothing and is what makes this file testable. */
import { countWords, fold, previewOf } from "./format.ts";
import type { Note, Folder, Meta, NoteMeta } from "./types.ts";

/* ── Derived reading, computed once ──────────────────────────────────────────
   Building a preview and counting words are both full passes over
   a note body, and the catalogue wants them for every visible row. Doing that
   during render means every row pays the cost again on every render of the
   page — which, on a corpus of long study notes, is the most expensive thing
   the interface does.

   The cache is keyed on the object itself. A note is replaced, never mutated,
   so a new object is exactly the signal that the text changed: there is no
   dependency array to keep honest, and nothing to invalidate by hand. ─────── */

export interface Derived {
  /** Plain text reduced to one readable line. */
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
      haystack: fold(`${note.title}\n${note.body}`),
    };
    notes.set(note, derived);
  }
  return derived;
}

/* ── Metadata, indexed ───────────────────────────────────────────────────────
   `meta.notes.find(...)` reads well and costs nothing once. It was being called
   inside loops — the folder filter, each row's pin state, and the rail's counts
   — which turns a list render into O(notes × metadata). Same trick: the index
   is cached on the Meta object, which is likewise replaced rather than
   mutated. ──────────────────────────────────────────────────────────────── */

export interface MetaIndex {
  byNote: Map<string, NoteMeta>;
  byFolder: Map<string, Folder>;
}

const metas = new WeakMap<Meta, MetaIndex>();

export function indexOf(meta: Meta): MetaIndex {
  let index = metas.get(meta);
  if (!index) {
    index = {
      byNote: new Map(meta.notes.map((note) => [note.id, note])),
      byFolder: new Map(meta.folders.map((folder) => [folder.id, folder])),
    };
    metas.set(meta, index);
  }
  return index;
}

/** Does this document link to that note?
 *
 * A link is a `noteLink` mark inside the Tiptap JSON, so the question is
 * answered by walking the document the archive already handed over — there is
 * no column to index and no query to write. Depth-first and short-circuiting,
 * because most notes link to nothing and the answer is usually no.
 */
export function linksTo(document: unknown, noteId: string): boolean {
  if (!document || typeof document !== "object") return false;
  const node = document as {
    marks?: { type?: string; attrs?: { noteId?: string } }[];
    content?: unknown[];
  };
  if (node.marks?.some((mark) => mark.type === "noteLink" && mark.attrs?.noteId === noteId))
    return true;
  return Array.isArray(node.content) && node.content.some((child) => linksTo(child, noteId));
}
