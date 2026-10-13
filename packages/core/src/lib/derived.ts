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

/** The first place this document names a note without linking to it — its
 *  title as plain words — returned exactly as it is written there, because
 *  those are the words the editor is then asked to find and link. Null when
 *  it never does.
 *
 * Read a text block at a time, not a text node, so a title with one word in
 * bold is still found, and folded both sides as the search is. A title is a
 * whole word only at an end that is a letter or a digit: "Dante" is not
 * inside "Danteschi", but "C++" ends in punctuation and needs no boundary
 * after it. Words already inside any note link are not a mention. This is
 * Obsidian's "unlinked mentions", with the rules read out of its app.js. */
export function mentionOf(document: unknown, title: string): string | null {
  const wanted = fold(title.trim());
  // ponytail: too short to mean the note rather than the language.
  if (wanted.length < 3) return null;
  const letter = /[\p{L}\p{N}]/u;
  const open = letter.test(wanted[0]);
  const close = letter.test(wanted[wanted.length - 1]);

  let found: string | null = null;
  const block = (node: { content?: unknown[] }) => {
    let text = "";
    const linked: boolean[] = [];
    for (const child of node.content ?? []) {
      const leaf = child as { text?: string; marks?: { type?: string }[] };
      if (typeof leaf.text !== "string") continue;
      const inLink = leaf.marks?.some((mark) => mark.type === "noteLink") ?? false;
      text += leaf.text;
      for (let n = 0; n < leaf.text.length; n += 1) linked.push(inLink);
    }
    let folded = "";
    const at: number[] = [];
    for (let index = 0; index < text.length; index += 1) {
      const one = fold(text[index]);
      for (let n = 0; n < one.length; n += 1) at.push(index);
      folded += one;
    }
    for (let hit = folded.indexOf(wanted); hit >= 0; hit = folded.indexOf(wanted, hit + 1)) {
      const end = hit + wanted.length;
      if (open && hit > 0 && letter.test(folded[hit - 1])) continue;
      if (close && end < folded.length && letter.test(folded[end])) continue;
      const start = at[hit];
      const stop = at[end - 1] + 1;
      if (linked.slice(start, stop).some(Boolean)) continue;
      return text.slice(start, stop);
    }
    return null;
  };
  const walk = (node: unknown) => {
    if (found || !node || typeof node !== "object") return;
    const shaped = node as { content?: unknown[] };
    if (!Array.isArray(shaped.content)) return;
    if (shaped.content.some((child) => typeof (child as { text?: unknown }).text === "string"))
      found = block(shaped);
    else shaped.content.forEach(walk);
  };
  walk(document);
  return found;
}

/** Every note this document links to, in the order the links first appear —
 *  the other direction of `linksTo`, for the note sheet's "Links to". */
export function linkedNoteIds(document: unknown, found = new Set<string>()): Set<string> {
  if (!document || typeof document !== "object") return found;
  const node = document as {
    marks?: { type?: string; attrs?: { noteId?: string } }[];
    content?: unknown[];
  };
  for (const mark of node.marks ?? [])
    if (mark.type === "noteLink" && mark.attrs?.noteId) found.add(mark.attrs.noteId);
  for (const child of node.content ?? []) linkedNoteIds(child, found);
  return found;
}
