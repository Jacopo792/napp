/* What a passage lock is worth, and where it is worth it.
 *
 * `notes.locked_by` is a column, so Postgres refuses the row and there is
 * nothing to argue about. A passage is different: the mark that carries it
 * lives inside a Yjs document both members are entitled to write, and no row
 * level security policy will ever see it. The boundary therefore has to be the
 * one place every update passes through — the collaboration server — and this
 * file is what it asks.
 *
 * It reads the Yjs document directly rather than the ProseMirror projection.
 * Two reasons: converting a whole note on every keystroke to find out whether
 * anything is locked is the expensive half of the work, and the delta already
 * carries marks as attributes, which is all this needs. The projection is used
 * only when something is locked and has to be put back.
 *
 * The editor also refuses to write a foreign lock, using ProseMirror's own
 * marks. That is a courtesy and reads as one: it keeps the caret out of a
 * passage that would bounce. This file is the rule. */
import type { JSONContent } from "@tiptap/core";
import { updateYFragment } from "y-prosemirror";
import * as Y from "yjs";
import { WRITE_LOCK_MARK } from "./content.ts";
import { BODY_FRAGMENT, noteSchema, projectDocument } from "./ydoc.ts";

/** Every locked passage in the body, keyed by the account holding it.
 *
 *  ponytail: the value is the held text, concatenated per holder, so moving a
 *  locked passage somewhere else in the same note without changing a character
 *  reads as no change. Key it by position if that ever stops being a curiosity.
 */
export function lockedPassages(doc: Y.Doc): Map<string, string> {
  const held = new Map<string, string>();

  const walk = (node: unknown): void => {
    if (node instanceof Y.XmlText) {
      const delta = node.toDelta() as {
        insert?: unknown;
        attributes?: Record<string, unknown>;
      }[];
      for (const op of delta) {
        const lock = op.attributes?.[WRITE_LOCK_MARK] as { owner?: unknown } | undefined;
        const owner = typeof lock?.owner === "string" ? lock.owner : "";
        if (owner && typeof op.insert === "string") {
          held.set(owner, (held.get(owner) ?? "") + op.insert);
        }
      }
      return;
    }
    if (node instanceof Y.XmlElement || node instanceof Y.XmlFragment) {
      for (const child of node.toArray()) walk(child);
    }
  };

  walk(doc.getXmlFragment(BODY_FRAGMENT));
  return held;
}

/** Whether anybody but `userId` holds a passage of this document. Nothing has
 *  to be watched while the answer is no, which is the ordinary case and the
 *  reason this is asked first. */
export function heldByAnother(held: Map<string, string>, userId: string): boolean {
  for (const owner of held.keys()) if (owner !== userId) return true;
  return false;
}

/** What has to be remembered before an update from `userId` is applied, or
 *  null when this document holds nothing they could break. */
export interface Guard {
  held: Map<string, string>;
  snapshot: JSONContent;
  userId: string;
}

export function guard(doc: Y.Doc, userId: string): Guard | null {
  const held = lockedPassages(doc);
  if (!heldByAnother(held, userId)) return null;
  return { held, snapshot: projectDocument(doc).content, userId };
}

/** Whether an update changed something it had no business changing: the text
 *  under somebody else's lock, the lock itself, or a new lock stamped with
 *  somebody else's name. */
export function broken(doc: Y.Doc, before: Guard): boolean {
  const now = lockedPassages(doc);
  for (const [owner, text] of before.held) {
    if (owner !== before.userId && now.get(owner) !== text) return true;
  }
  for (const owner of now.keys()) {
    if (owner !== before.userId && !before.held.has(owner)) return true;
  }
  return false;
}

/** Put the document back as it was. Yjs has no undo that does not need a
 *  history to walk, so the way back is the way in: diff the remembered
 *  projection into the fragment, which is exactly what the editor's own
 *  binding does with every keystroke.
 *
 *  Coarse on purpose. An update that broke a lock is reverted whole, including
 *  anything legitimate it carried alongside — in ordinary use it never fires,
 *  because the editor refuses first, and a client that got here went round it.
 */
export function restore(doc: Y.Doc, before: Guard): void {
  const node = noteSchema().nodeFromJSON(before.snapshot);
  doc.transact(() => {
    /* An empty binding cache, which is all a one-off diff needs: the mapping
       is what an editor carries between keystrokes, and `isOMark` is a lookup
       table this fills as it goes. */
    updateYFragment(doc, doc.getXmlFragment(BODY_FRAGMENT), node, {
      mapping: new Map(),
      isOMark: new Map(),
    });
  });
}
