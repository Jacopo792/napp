import { WRITE_LOCK_MARK } from "@/features/editor/lib/content";
import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { ySyncPluginKey } from "y-prosemirror";

/* Keeps this browser from writing a passage the other member has taken back.
 *
 * A courtesy, not the rule. The rule is `writeLocks.ts` on the collaboration
 * server, which sees every update from every client and puts back anything a
 * foreign lock covers; this only means the caret does not appear to work and
 * then bounce a moment later.
 *
 * A remote change arrives as a transaction too, carrying `ySyncPluginKey`, and
 * has to pass: it is the other member writing their own locked passage, and
 * refusing it would leave this editor disagreeing with the document it is
 * bound to — which is the one failure worse than an edit that does not stick.
 *
 * Read through a ref because the owner changes with the note and the extension
 * list is built once. */
export function writeLockGuardExtension(owner: { current: string | null }) {
  /* The same walk answers both halves, so it is done once per document rather
     than once per draw: the caret refuses these ranges, and they are the ones
     that have to look refusable. A lock of your own is tinted by the mark's own
     stylesheet and stays perfectly writable. */
  let seen: ProseMirrorNode | null = null;
  let decorations = DecorationSet.empty;

  return Extension.create({
    name: "writeLockGuard",
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: new PluginKey("writeLockGuard"),
          props: {
            decorations(state) {
              if (state.doc === seen) return decorations;
              const lock = state.schema.marks[WRITE_LOCK_MARK];
              const mine = owner.current;
              const found: Decoration[] = [];
              if (lock) {
                state.doc.descendants((node, pos) => {
                  if (!node.isText) return true;
                  const held = node.marks.find((mark) => mark.type === lock);
                  if (held && held.attrs.owner !== mine) {
                    found.push(
                      Decoration.inline(pos, pos + node.nodeSize, {
                        class: "is-held-by-them",
                      }),
                    );
                  }
                  return true;
                });
              }
              seen = state.doc;
              decorations = DecorationSet.create(state.doc, found);
              return decorations;
            },
          },
          filterTransaction(transaction, state) {
            if (!transaction.docChanged || transaction.getMeta(ySyncPluginKey)) return true;
            const lock = state.schema.marks[WRITE_LOCK_MARK];
            if (!lock) return true;
            const mine = owner.current;
            return !transaction.steps.some((step) => {
              const range = step as unknown as { from?: number; to?: number };
              if (typeof range.from !== "number" || typeof range.to !== "number") return false;
              let held = false;
              state.doc.nodesBetween(range.from, Math.max(range.from, range.to), (node) => {
                const found = node.marks.find((mark) => mark.type === lock);
                if (found && found.attrs.owner !== mine) held = true;
              });
              return held;
            });
          },
        }),
      ];
    },
  });
}

/* A comment never written. A decoration rather than a write: the mark may be
   the other member's, who is still typing the first remark, and the document
   is theirs too. The class lands inside the anchor's span, so the stylesheet
   reaches the anchor with `:has`. */
export const unsaidKey = new PluginKey("unsaidComments");

export function unsaidCommentsExtension(said: { current: ReadonlySet<string> | null | undefined }) {
  return Extension.create({
    name: "unsaidComments",
    addProseMirrorPlugins() {
      return [
        new Plugin<DecorationSet>({
          key: unsaidKey,
          state: {
            init: () => DecorationSet.empty,
            apply(transaction, set, _old, state) {
              if (!transaction.docChanged && !transaction.getMeta(unsaidKey)) return set;
              const known = said.current;
              if (!known) return DecorationSet.empty;
              const found: Decoration[] = [];
              state.doc.descendants((node, pos) => {
                if (!node.isText) return true;
                const mark = node.marks.find((m) => m.type.name === "comment");
                if (mark?.attrs.threadId && !known.has(mark.attrs.threadId as string))
                  found.push(
                    Decoration.inline(pos, pos + node.nodeSize, { class: "comment-unsaid" }),
                  );
                return true;
              });
              return DecorationSet.create(state.doc, found);
            },
          },
          props: {
            decorations: (state) => unsaidKey.getState(state) as DecorationSet,
          },
        }),
      ];
    },
  });
}

/* A passage lit for a moment. A decoration, not a class on the DOM: the
   view redraws the spans it owns and a class written there is lost or left
   behind. The range follows edits until the light goes out. */
export const passageFlashKey = new PluginKey<DecorationSet>("passageFlash");

export const PassageFlash = Extension.create({
  name: "passageFlash",
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: passageFlashKey,
        state: {
          init: () => DecorationSet.empty,
          apply(transaction, set) {
            const meta = transaction.getMeta(passageFlashKey) as
              | { from: number; to: number }
              | null
              | undefined;
            if (meta === null) return DecorationSet.empty;
            if (meta)
              return DecorationSet.create(transaction.doc, [
                Decoration.inline(meta.from, meta.to, { class: "is-flashing" }),
              ]);
            return set.map(transaction.mapping, transaction.doc);
          },
        },
        props: {
          decorations: (state) => passageFlashKey.getState(state),
        },
      }),
    ];
  },
});

/** Where these words stand inside one block of text, or null. */
export function findPassage(
  doc: ProseMirrorNode,
  text: string,
): { from: number; to: number } | null {
  let found: { from: number; to: number } | null = null;
  doc.descendants((node, pos) => {
    if (found) return false;
    if (!node.isTextblock) return true;
    const content = node.textContent;
    for (let at = content.indexOf(text); at >= 0 && !found; at = content.indexOf(text, at + 1)) {
      /* Text offset to document position: walk the inline children, since a
         footnote or a picture inside the block takes one position and no text. */
      let offset = 0;
      let from = -1;
      node.forEach((child, childOffset) => {
        const length = child.isText ? child.text!.length : 0;
        if (from < 0 && child.isText && at < offset + length)
          from = pos + 1 + childOffset + (at - offset);
        offset += length;
      });
      if (from >= 0) found = { from, to: from + text.length };
    }
    return false;
  });
  return found;
}
