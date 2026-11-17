/* What a passage lock is worth, and where it is worth it.
 *
 * `notes.locked_by` is a column, so Postgres refuses the row and there is
 * nothing to argue about. A passage is different: the mark that carries it
 * lives inside a Yjs document both members are entitled to write, and no row
 * level security policy will ever see it. The boundary therefore has to be the
 * one place every update passes through — the collaboration server — and this
 * file is what it asks.
 *
 * It reads the Yjs document directly rather than the ProseMirror projection:
 * the delta already carries marks as attributes, which is all this needs.
 *
 * The editor also refuses to write a foreign lock, using ProseMirror's own
 * marks. That is a courtesy and reads as one: it keeps the caret out of a
 * passage that would bounce. This file is the rule. */
import * as Y from "yjs";
import { WRITE_LOCK_MARK } from "./content.ts";
import { BODY_FRAGMENT } from "./ydoc.ts";

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

/** Whether `update`, sent by `userId`, changes something it had no business
 *  changing — the text under somebody else's lock, the lock itself, or a new
 *  lock stamped with somebody else's name — and if so, the update that takes
 *  exactly that change back. Null when there is nothing to take back.
 *
 *  Judged on a copy, from the update alone. The server awaits between hearing a
 *  message and applying it, and other members' updates land in that gap; a
 *  judgement that compared the whole document before and after blamed this
 *  writer for their changes, and putting the whole document back erased
 *  whatever anybody else had typed in the meantime. Undoing this update by its
 *  own items touches nothing else, whenever it is applied. */
export function revertIfBroken(doc: Y.Doc, update: Uint8Array, userId: string): Uint8Array | null {
  const held = lockedPassages(doc);
  if (!heldByAnother(held, userId)) return null;

  const trial = new Y.Doc({ gc: false });
  Y.applyUpdate(trial, Y.encodeStateAsUpdate(doc));
  const judged = Symbol("judged");
  const undo = new Y.UndoManager(trial.getXmlFragment(BODY_FRAGMENT), {
    trackedOrigins: new Set([judged]),
    captureTimeout: 0,
  });
  try {
    Y.applyUpdate(trial, update, judged);
    if (!broken(lockedPassages(trial), held, userId)) return null;
    const applied = Y.encodeStateVector(trial);
    undo.undo();
    return Y.encodeStateAsUpdate(trial, applied);
  } finally {
    undo.destroy();
    trial.destroy();
  }
}

function broken(now: Map<string, string>, before: Map<string, string>, userId: string): boolean {
  for (const [owner, text] of before) {
    if (owner !== userId && now.get(owner) !== text) return true;
  }
  for (const owner of now.keys()) {
    if (owner !== userId && !before.has(owner)) return true;
  }
  return false;
}
