/* What the editor does with footnotes, captions and cross-references: put
 * one in, find one again, give a cited target its id, and keep that id one
 * target's. The schema is in `content.ts`, the counting in
 * `lib/references.ts`; this is the part that needs a live editor. */
import { Extension, type Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { NodeSelection, Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import type { Adoption, CaptionKind, CountedTarget, TargetKind } from "@/lib/references";

export const newReferenceId = (): string => crypto.randomUUID();

/* ── Asking a footnote to open ───────────────────────────────────────────
   A footnote is written in a popover that belongs to its node view. A new
   one opens itself — the position is left here by the insert and read once
   by the view that mounts there, as `penWanted` does for a drawing, because
   a mount cannot tell being made from being come back to — and one already
   in the text is opened with an event, from the list under the chapter. */

let footnoteWanted: number | null = null;

export function takeFootnoteWanted(pos: number | undefined): boolean {
  if (pos === undefined || footnoteWanted !== pos) return false;
  footnoteWanted = null;
  return true;
}

export const OPEN_FOOTNOTE = "napp:open-footnote";

export function openFootnoteAt(pos: number): void {
  window.dispatchEvent(new CustomEvent<number>(OPEN_FOOTNOTE, { detail: pos }));
}

/** Word's Insert Footnote: the number at the caret (after a selection, never
 *  in place of it), and its popover open to be written in. */
export function insertFootnote(editor: Editor): void {
  const at = editor.state.selection.to;
  footnoteWanted = at;
  /* No `focus()`: the popover takes the keyboard, and Tiptap's focus lands
     a frame later and would take it back. The caret waits after the number. */
  editor
    .chain()
    .insertContentAt(at, { type: "footnote" })
    .setTextSelection(at + 1)
    .run();
}

/** Word's Insert Caption. Under the picture or the block the caret is in; a
 *  table's above or below it as the document is set. An empty paragraph
 *  becomes the caption instead of gaining one under it. */
export function insertCaption(editor: Editor, kind: CaptionKind, tableSide: "above" | "below") {
  const { selection } = editor.state;
  const { $from } = selection;
  if ($from.parent.type.name === "paragraph" && $from.parent.content.size === 0) {
    editor.chain().focus().setNode("caption", { kind }).run();
    return;
  }
  let tableDepth = 0;
  for (let depth = $from.depth; depth > 0; depth -= 1)
    if ($from.node(depth).type.name === "table") tableDepth = depth;
  const pos =
    tableDepth > 0
      ? kind === "table" && tableSide === "above"
        ? $from.before(tableDepth)
        : $from.after(tableDepth)
      : selection instanceof NodeSelection && selection.node.isBlock
        ? selection.to
        : $from.depth > 0
          ? $from.after(1)
          : selection.to;
  editor
    .chain()
    .focus()
    .insertContentAt(pos, { type: "caption", attrs: { kind } })
    .setTextSelection(pos + 1)
    .run();
}

/* ── Finding a target in the live document ───────────────────────────────
   Counted exactly as `targetsOf()` counts the projection: a heading by its
   words alone (the atoms inside it say nothing), a caption, a footnote. */

function wordsOf(node: PMNode): string {
  let text = "";
  node.descendants((child) => {
    if (child.isText) text += child.text ?? "";
  });
  return text;
}

function kindOf(node: PMNode): TargetKind | null {
  if (node.type.name === "heading") return wordsOf(node).trim() ? "section" : null;
  if (node.type.name === "caption") return node.attrs.kind === "table" ? "table" : "figure";
  if (node.type.name === "footnote") return "footnote";
  return null;
}

const idOf = (node: PMNode): string | null =>
  ((node.type.name === "heading" ? node.attrs.anchor : node.attrs.id) as string | null) ?? null;

const idAttribute = (node: PMNode) => (node.type.name === "heading" ? "anchor" : "id");

function eachTarget(
  doc: PMNode,
  visit: (node: PMNode, pos: number, kind: TargetKind, index: number) => boolean | void,
): void {
  const seen: Record<TargetKind, number> = { section: 0, figure: 0, table: 0, footnote: 0 };
  let done = false;
  doc.descendants((node, pos) => {
    if (done) return false;
    const kind = kindOf(node);
    if (kind && visit(node, pos, kind, seen[kind]++)) done = true;
    return !done && node.type.name !== "footnote";
  });
}

/** Where a target is now: by its id, or by its place among its kind. */
export function findTarget(
  doc: PMNode,
  target: { kind: TargetKind; id: string | null; index: number },
): { node: PMNode; pos: number } | null {
  let found: { node: PMNode; pos: number } | null = null;
  eachTarget(doc, (node, pos, kind, index) => {
    if (target.id ? idOf(node) === target.id : kind === target.kind && index === target.index) {
      found = { node, pos };
      return true;
    }
  });
  if (!found && target.id) return findTarget(doc, { ...target, id: null });
  return found;
}

/** Word's Insert Cross-reference. A target in this chapter that has no id
 *  is given one in the same transaction; one in another chapter is cited by
 *  an id it does not carry yet, and its words, until that chapter is opened
 *  and adopts it (`adoptTargets`). `pendingId` is an id another reference is
 *  already waiting to give the same target, so two citations agree. */
export function insertCrossReference(
  editor: Editor,
  target: CountedTarget,
  from: string,
  label: string,
  pendingId?: string,
): void {
  const id = target.id ?? pendingId ?? newReferenceId();
  editor
    .chain()
    .focus()
    .command(({ tr }) => {
      if (target.id || target.noteId !== from) return true;
      const found = findTarget(tr.doc, target);
      if (found) tr.setNodeAttribute(found.pos, idAttribute(found.node), id);
      return true;
    })
    .insertContent({
      type: "crossReference",
      attrs: { target: id, noteId: target.noteId, kind: target.kind, match: target.text, label },
    })
    .run();
}

/** Give the ids this chapter owes to references made from elsewhere. One
 *  transaction, kept out of the undo history: nobody here did anything. */
export function adoptTargets(editor: Editor, adoptions: Adoption[]): void {
  if (!adoptions.length || !editor.isEditable) return;
  const { tr } = editor.state;
  for (const adoption of adoptions)
    eachTarget(tr.doc, (node, pos, kind) => {
      if (kind !== adoption.kind || idOf(node) !== null) return;
      const words = node.type.name === "footnote" ? String(node.attrs.text ?? "") : wordsOf(node);
      if (words !== adoption.match) return;
      tr.setNodeAttribute(pos, idAttribute(node), adoption.id);
      return true;
    });
  if (tr.docChanged) editor.view.dispatch(tr.setMeta("addToHistory", false));
}

/* ── One id, one target ──────────────────────────────────────────────────
   A cited heading copied and pasted would carry its id twice, and every
   reference to it would go wherever the count met it first. So a paste
   takes the id off what it brought in when the original is still there.
   Dragging is a move, not a copy, and keeps it. */

const uniqueTargets = new PluginKey("uniqueReferenceTargets");

export const UniqueReferenceTargets = Extension.create({
  name: "uniqueReferenceTargets",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: uniqueTargets,
        appendTransaction(transactions, before, after) {
          const paste = transactions.find((tr) => tr.getMeta("uiEvent") === "paste");
          if (!paste) return null;
          const start = paste.mapping.map(before.selection.from, -1);
          const end = after.selection.to;
          const places = new Map<string, { pos: number; node: PMNode }[]>();
          eachTarget(after.doc, (node, pos) => {
            const id = idOf(node);
            if (id) places.set(id, [...(places.get(id) ?? []), { pos, node }]);
          });
          let tr: Transaction | null = null;
          for (const found of places.values()) {
            if (found.length < 2) continue;
            const pasted = found.filter(({ pos }) => pos >= start && pos < end);
            const keep = pasted.length === found.length ? pasted.slice(1) : pasted;
            for (const { pos, node } of keep)
              tr = (tr ?? after.tr).setNodeAttribute(pos, idAttribute(node), null);
          }
          return tr;
        },
      }),
    ];
  },
});

/** ⌥⌘F, Word's key for a footnote, wherever the document has them. */
export function footnoteKeys(read: () => boolean) {
  return Extension.create({
    name: "footnoteKeys",
    addKeyboardShortcuts() {
      return {
        "Mod-Alt-f": ({ editor }) => {
          if (!read() || !editor.isEditable) return false;
          insertFootnote(editor);
          return true;
        },
      };
    },
  });
}
