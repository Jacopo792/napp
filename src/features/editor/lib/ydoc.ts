/* The document as Yjs holds it.
 *
 * A note is one `Y.Doc` with two roots: `Y.Text("title")` and the
 * `Y.XmlFragment("default")` Tiptap's Collaboration extension binds to. Both
 * live in the same document, so the title and the body of one note arrive in
 * one update and can never disagree about which version of the note they are.
 *
 * Nothing here touches the network or the DOM: it is the pure half, shared
 * verbatim by the browser and the collaboration server, which is the point.
 * A document converted by one and read by the other has to come back the same,
 * and the only way to guarantee that is for both to run this file. */
import { getSchema, type JSONContent } from "@tiptap/core";
import type { Schema } from "@tiptap/pm/model";
import { prosemirrorJSONToYDoc, yDocToProsemirrorJSON } from "y-prosemirror";
import * as Y from "yjs";
import { DOCUMENT_EXTENSIONS, EMPTY_RICH_TEXT, isRichTextDocument } from "./content.ts";

/** The Yjs root the body lives under. Tiptap's default, and changing it would
 *  strand every document already written. */
export const BODY_FRAGMENT = "default";
/** The Yjs root the title lives under. */
export const TITLE_TEXT = "title";

/** Bumped only if the roots above change meaning. Stored beside every binary so
 *  a future format can tell what it is looking at without guessing. */
export const DOCUMENT_FORMAT_VERSION = 1;

let cached: Schema | null = null;

/** The ProseMirror schema of a note. Built once — it is a few hundred
 *  milliseconds of extension resolution and never varies. */
export function noteSchema(): Schema {
  cached ??= getSchema(DOCUMENT_EXTENSIONS);
  return cached;
}

/** Build the collaborative document a note starts life as.
 *
 *  Called exactly once per note, by the server, when no binary exists yet. A
 *  second call would not merge with the first: two independently seeded
 *  documents share no history, so applying one to the other appends the body
 *  twice. That is the duplication this whole file is arranged to prevent, and
 *  why the browser never seeds. */
export function seedDocument(title: string, content: unknown): Y.Doc {
  const document = isRichTextDocument(content) ? content : EMPTY_RICH_TEXT;
  const doc = prosemirrorJSONToYDoc(noteSchema(), document, BODY_FRAGMENT);
  if (title) doc.getText(TITLE_TEXT).insert(0, title);
  return doc;
}

/** What the rest of the archive reads: lists, search, preview, export and
 *  templates all take the projection, never the binary. */
export function projectDocument(doc: Y.Doc): { title: string; content: JSONContent } {
  return {
    title: doc.getText(TITLE_TEXT).toString(),
    content: yDocToProsemirrorJSON(doc, BODY_FRAGMENT) as JSONContent,
  };
}

/** A document is empty when it has never held anything — not merely when it
 *  reads as blank. An empty state vector means no client has ever written. */
export function isUntouched(doc: Y.Doc): boolean {
  return Y.encodeStateVector(doc).length <= 1;
}

/** Stable colour shared by the browser and collaboration server. */
export function collaborationColor(userId: string): string {
  let hash = 0;
  for (let index = 0; index < userId.length; index++) {
    hash = (hash * 31 + userId.charCodeAt(index)) >>> 0;
  }
  return `hsl(${hash % 360} 64% 62%)`;
}

export function encodeDocument(doc: Y.Doc): Uint8Array {
  return Y.encodeStateAsUpdate(doc);
}

export function decodeDocument(state: Uint8Array): Y.Doc {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, state);
  return doc;
}
