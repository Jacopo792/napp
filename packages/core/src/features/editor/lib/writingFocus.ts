/* Focus and typewriter scrolling for a document — the way a long piece of
 * writing is written in iA Writer or Ulysses, offered in the place Word keeps
 * its Focus view.
 *
 * Nothing here is schema: it is decorations and scrolling, read by the editor
 * alone, so the server, the exports and the other member never see it. The
 * settings arrive through `read()` rather than as options, because options
 * are fixed when the editor is built and the editor is built once; changing
 * them dispatches an empty transaction with `WRITING_FOCUS` so the
 * decorations are drawn again. */
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

export type FocusSetting = "off" | "paragraph" | "sentence";

export interface WritingFocusSettings {
  focus: FocusSetting;
  typewriter: boolean;
}

export const WRITING_FOCUS = new PluginKey("writingFocus");

/** The sentence `offset` stands in, as [from, to) offsets into `text`. A
 *  sentence ends after . ! ? or … and any closing quote or bracket, followed
 *  by a space; the caret just after the full stop still belongs to the
 *  sentence it has finished. */
export function sentenceAround(text: string, offset: number): [number, number] {
  const ends = /[.!?…]+["'»”’)\]]*\s+/g;
  let from = 0;
  let to = text.length;
  for (const match of text.matchAll(ends)) {
    const end = match.index + match[0].length;
    if (end <= offset && end < text.length) from = end;
    else if (match.index >= offset || end > offset) {
      to = match.index + match[0].trimEnd().length;
      break;
    }
  }
  return [from, Math.max(from, to)];
}

function decorations(state: EditorState, focus: FocusSetting): DecorationSet {
  if (focus === "off") return DecorationSet.empty;
  const { $head } = state.selection;
  if ($head.depth === 0) return DecorationSet.empty;
  const block = $head.before(1);
  const top = state.doc.nodeAt(block);
  if (!top) return DecorationSet.empty;
  const found = [Decoration.node(block, block + top.nodeSize, { class: "is-writing-focus" })];
  if (focus === "sentence" && $head.parent.isTextblock) {
    const start = $head.start();
    const text = $head.parent.textBetween(0, $head.parent.content.size, undefined, "￼");
    const [from, to] = sentenceAround(text, $head.parentOffset);
    if (to > from)
      found.push(Decoration.inline(start + from, start + to, { class: "is-writing-sentence" }));
  }
  return DecorationSet.create(state.doc, found);
}

/** Keep the caret's line at the middle of whatever scrolls the page. */
function centre(view: EditorView) {
  if (!view.hasFocus()) return;
  const scroller = view.dom.closest<HTMLElement>(".manuscript-desk");
  if (!scroller) return;
  const caret = view.coordsAtPos(view.state.selection.head);
  const box = scroller.getBoundingClientRect();
  const offset = (caret.top + caret.bottom) / 2 - (box.top + box.height / 2);
  if (Math.abs(offset) > 2) scroller.scrollBy({ top: offset });
}

export const WritingFocus = Extension.create<{ read: () => WritingFocusSettings }>({
  name: "writingFocus",
  addOptions: () => ({ read: () => ({ focus: "off", typewriter: false }) }),
  addProseMirrorPlugins() {
    const { read } = this.options;
    return [
      new Plugin({
        key: WRITING_FOCUS,
        props: {
          decorations: (state) => decorations(state, read().focus),
          attributes: (): Record<string, string> =>
            read().focus === "off" ? {} : { "data-writing-focus": read().focus },
        },
        view: () => ({
          update(view, previous) {
            if (!read().typewriter) return;
            if (previous.selection.eq(view.state.selection) && previous.doc.eq(view.state.doc))
              return;
            // After the browser has laid the new line out.
            requestAnimationFrame(() => centre(view));
          },
        }),
      }),
    ];
  },
});
