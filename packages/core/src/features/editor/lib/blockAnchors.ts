/* Only structural local edits can duplicate a paragraph's id: normal typing
 * pays no walk of the document. Preserve the pre-existing paragraph when a
 * copy is pasted before it; give neither a split nor a paste a second target. */
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import type { Fragment } from "@tiptap/pm/model";
import { ySyncPluginKey } from "y-prosemirror";
import { blockId } from "../../../lib/blockLinks.ts";
export function blockAnchorPlugin() {
  return new Plugin({
    key: new PluginKey("uniqueBlockAnchors"),
    appendTransaction(transactions, before, after) {
      const structural = transactions.some(
        (tr) =>
          !tr.getMeta(ySyncPluginKey) &&
          tr.steps.some((step) => {
            const slice = (step as unknown as { slice?: { content: Fragment } }).slice;
            let blocks = false;
            slice?.content.forEach((node) => {
              if (!node.isInline) blocks = true;
            });
            return blocks;
          }),
      );
      if (!structural) return null;
      const originals = new Map<string, number>();
      before.doc.descendants((node, pos) => {
        const id = blockId(node.attrs.blockId);
        if (id && !originals.has(id))
          originals.set(
            id,
            transactions.reduce((mapped, tr) => tr.mapping.map(mapped, 1), pos),
          );
      });
      const positions = new Map<string, number[]>();
      after.doc.descendants((node, pos) => {
        const id = blockId(node.attrs.blockId);
        if (id) positions.set(id, [...(positions.get(id) || []), pos]);
      });
      let tr: Transaction | null = null;
      for (const [id, places] of positions) {
        if (places.length < 2) continue;
        const original = originals.get(id);
        const keep = original !== undefined && places.includes(original) ? original : places[0];
        for (const pos of places)
          if (pos !== keep) tr = (tr ?? after.tr).setNodeAttribute(pos, "blockId", null);
      }
      return tr;
    },
  });
}
export const UniqueBlockAnchors = Extension.create({
  name: "uniqueBlockAnchors",
  addProseMirrorPlugins() {
    return [blockAnchorPlugin()];
  },
});
