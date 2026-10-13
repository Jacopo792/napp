/* Suggesting, the way Word tracks changes and Google Docs suggests.
 *
 * While it is on, nothing a writer does to the text is final. What they type
 * is kept and marked `suggestedInsert`; what they delete is put back and
 * marked `suggestedDelete`, struck through, until somebody accepts or
 * rejects it. The marks live in the note's Yjs document like every other
 * mark, so a proposal converges and travels the way the words do.
 *
 * It works after the fact, in `appendTransaction`: the edit happens as it
 * always does, and one transaction appended to it puts deleted words back
 * and marks the new ones. That keeps every way of editing — typing, Backspace,
 * Delete, paste, cut, autocorrect — one code path rather than one per key.
 *
 * ponytail: only a transaction of one replace step inside one text block is
 * tracked. Joining paragraphs, splitting a list, moving a block are applied
 * as they are, because putting a deleted paragraph boundary back is a
 * structural undo this is not. Typing, deleting and pasting within a
 * paragraph — nearly all of revising — are tracked.
 *
 * Deleting words you yourself proposed takes them away for real: that is
 * changing your mind, not proposing a deletion of your own proposal.
 *
 * Pure apart from ProseMirror, so `node --experimental-strip-types` tests it. */
import { Extension } from "@tiptap/core";
import type { MarkType, Node as ProseMirrorNode, Slice } from "@tiptap/pm/model";
import {
  Plugin,
  PluginKey,
  TextSelection,
  type EditorState,
  type Transaction,
} from "@tiptap/pm/state";
import { ReplaceStep } from "@tiptap/pm/transform";
import { ySyncPluginKey } from "y-prosemirror";

export const suggestionKey = new PluginKey("suggestions");

export const INSERT = "suggestedInsert";
export const DELETE = "suggestedDelete";

export interface SuggestionMode {
  on: boolean;
  author: string;
}

function onlyOwnInsertion(
  doc: ProseMirrorNode,
  from: number,
  to: number,
  insert: MarkType,
  author: string,
): boolean {
  let own = true;
  doc.nodesBetween(from, to, (node) => {
    if (!node.isText) return true;
    const mark = insert.isInSet(node.marks);
    if (!mark || mark.attrs.author !== author) own = false;
    return own;
  });
  return own;
}

/** The transaction that turns `tr` into a proposal, or null to leave it. */
export function suggest(
  transactions: readonly Transaction[],
  oldState: EditorState,
  newState: EditorState,
  mode: SuggestionMode,
): Transaction | null {
  if (!mode.on || !mode.author || transactions.length !== 1) return null;
  const tr = transactions[0];
  if (!tr.docChanged || tr.getMeta(ySyncPluginKey) || tr.getMeta(suggestionKey)) return null;
  if (tr.steps.length !== 1 || !(tr.steps[0] instanceof ReplaceStep)) return null;
  const { from, to, slice } = tr.steps[0] as unknown as { from: number; to: number; slice: Slice };
  const insert = newState.schema.marks[INSERT];
  const remove = newState.schema.marks[DELETE];
  if (!insert || !remove) return null;

  const $from = oldState.doc.resolve(from);
  const $to = oldState.doc.resolve(to);
  if (!$from.sameParent($to) || !$from.parent.isTextblock) return null;

  const next = newState.tr;
  let kept = 0;
  if (to > from && !onlyOwnInsertion(oldState.doc, from, to, insert, mode.author)) {
    const gone = oldState.doc.slice(from, to).content;
    next.insert(from, gone);
    kept = gone.size;
    next.addMark(from, from + kept, remove.create({ author: mode.author }));
  }
  if (slice.size > 0) {
    next.addMark(from + kept, from + kept + slice.size, insert.create({ author: mode.author }));
  }
  if (!next.docChanged) return null;

  /* Backspace walks left over what it struck; Delete and typing over a
     selection leave the caret after what was there. */
  const backspace = oldState.selection.empty && oldState.selection.from === to && to > from;
  const caret = backspace ? from : from + kept + slice.size;
  next.setSelection(TextSelection.create(next.doc, caret));
  return next.setMeta(suggestionKey, true);
}

export interface Suggestion {
  from: number;
  to: number;
  kind: typeof INSERT | typeof DELETE;
  author: string;
}

/** Every proposal in the document, each run of one kind by one person as
 *  one, in document order. */
export function suggestionsIn(doc: ProseMirrorNode): Suggestion[] {
  const found: Suggestion[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText) return true;
    for (const mark of node.marks) {
      if (mark.type.name !== INSERT && mark.type.name !== DELETE) continue;
      const kind = mark.type.name as Suggestion["kind"];
      const author = String(mark.attrs.author ?? "");
      const last = found[found.length - 1];
      if (last && last.to === pos && last.kind === kind && last.author === author)
        last.to = pos + node.nodeSize;
      else found.push({ from: pos, to: pos + node.nodeSize, kind, author });
    }
    return false;
  });
  return found;
}

/** The proposal the caret is in, or next to. */
export function suggestionAt(doc: ProseMirrorNode, pos: number): Suggestion | null {
  return suggestionsIn(doc).find((one) => one.from <= pos && pos <= one.to) ?? null;
}

/** Accept or reject these proposals in one transaction. An accepted
 *  insertion keeps its words and loses its mark; an accepted deletion takes
 *  its words away. Rejecting does the opposite. */
export function settle(
  state: EditorState,
  suggestions: Suggestion[],
  accept: boolean,
): Transaction {
  const tr = state.tr;
  // From the end, so each range is still where it was found.
  for (const one of [...suggestions].sort((a, b) => b.from - a.from)) {
    const mark = state.schema.marks[one.kind];
    const keep = (one.kind === INSERT) === accept;
    if (keep) tr.removeMark(one.from, one.to, mark);
    else tr.delete(one.from, one.to);
  }
  return tr.setMeta(suggestionKey, true);
}

/** The editor half: the plugin, reading whether Suggesting is on from the
 *  caller on every transaction, so turning it on needs no new editor. */
export function suggestionsExtension(read: () => SuggestionMode) {
  return Extension.create({
    name: "suggestions",
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: suggestionKey,
          appendTransaction: (transactions, oldState, newState) =>
            suggest(transactions, oldState, newState, read()),
        }),
      ];
    },
  });
}
