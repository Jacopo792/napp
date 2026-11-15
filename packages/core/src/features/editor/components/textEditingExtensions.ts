import { rememberSpelling, takeAutocorrection } from "@/features/editor/lib/autocorrect";
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

/* Word's paragraph keys, on the paragraphs and headings the selection
   touches. Only in a document — a note keeps every key it had. */
export const ManuscriptKeys = Extension.create({
  name: "manuscriptKeys",
  addKeyboardShortcuts() {
    const align = (textAlign: string | null) => () =>
      this.editor
        .chain()
        .updateAttributes("paragraph", { textAlign })
        .updateAttributes("heading", { textAlign })
        .run();
    return {
      "Mod-Shift-l": align(null),
      "Mod-Shift-e": align("center"),
      "Mod-Shift-r": align("right"),
      "Mod-Shift-j": align("justify"),
      "Mod-Enter": () => this.editor.commands.insertContent({ type: "pageBreak" }),
    };
  },
});

export function capitalizeSentences(text: string): string {
  return text.replace(/(^\s*[a-zà-ÿ])|([.!?]\s+[a-zà-ÿ])/g, (m) => m.toUpperCase());
}

export function sentenceCapitalizeExtension() {
  return Extension.create({
    name: "sentenceCapitalize",
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: new PluginKey("sentenceCapitalize"),
          props: {
            handleTextInput(view, from, to, text) {
              if (text.length !== 1) return false;
              const isLetter = text.toLowerCase() !== text.toUpperCase();
              if (!isLetter) return false;
              if (text !== text.toLowerCase()) return false;
              const before = view.state.doc.textBetween(0, from, "\n", "\n");
              const trimmed = before.trimEnd();
              const isStart = trimmed === "";
              const isAfterSentence = /[.!?]$/.test(trimmed) && /\s$/.test(before);
              if (!isStart && !isAfterSentence) return false;
              view.dispatch(view.state.tr.insertText(text.toUpperCase(), from, to));
              return true;
            },
          },
        }),
      ];
    },
  });
}

/** The word that has just been finished, read backwards from the caret.
 *
 *  Accented letters are in the class and an apostrophe may end it, and both
 *  are load-bearing for Italian: `perchè` is a word this corrects and `e'` is
 *  a word it corrects *into* something — neither of them is `[A-Za-z]+`, which
 *  is what the class was when the dictionary was sixteen English contractions.
 *  The apostrophe is allowed only at the end, so `l'accento` is read as
 *  `accento` and the article is left where it is. */
const FINISHED_WORD = /([A-Za-zÀ-ÖØ-öø-ÿ]+['’]?)$/;

/** How long after a correction an undo is still about that correction. Longer
 *  and a ⌘Z meant for something else teaches the dictionary a word nobody
 *  refused; shorter and the hand has not finished reacting. */
const UNDO_IS_A_REFUSAL_FOR_MS = 4000;

/** A small, local counterpart to the familiar phone-style correction. It acts
 * only when a word is completed and never rewrites a sentence while its
 * meaning is still changing.
 *
 * The last word is the writer's, and the way they get it is **undo**: a ⌘Z
 * arriving on the heels of a correction is that spelling being refused, and a
 * refused spelling is learned and never corrected again. That replaced a
 * counter which simply stopped correcting every word after its second
 * correction, for ever — see `autocorrect.ts`.
 *
 * Whether it runs at all is read through a **ref**. It is a setting, and a
 * setting that arrived as a prop would rebuild the editor when it changed —
 * which the whole collaborative path exists to do exactly once. */
export function autocorrectExtension(enabled: React.RefObject<boolean>) {
  return Extension.create({
    name: "autocorrect",
    addProseMirrorPlugins() {
      /* What the last correction replaced, and when. Plugin-local rather than
         module-level: two editors are open in a split, and a refusal in one is
         not a refusal in the other's document. */
      let refusable: { word: string; at: number } | null = null;
      return [
        new Plugin({
          key: new PluginKey("autocorrect"),
          props: {
            /* The undo itself is still the history's to perform — this only
               listens. Returning true here would swallow ⌘Z. */
            handleKeyDown(_view, event) {
              if (!refusable) return false;
              if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z")
                return false;
              if (Date.now() - refusable.at < UNDO_IS_A_REFUSAL_FOR_MS)
                rememberSpelling(refusable.word);
              refusable = null;
              return false;
            },
            handleTextInput(view, from, to, text) {
              if (!enabled.current) return false;
              if (!/^[\s.,!?;:]$/.test(text)) return false;
              const $from = view.state.doc.resolve(from);
              const before = $from.parent.textBetween(0, $from.parentOffset, " ", " ");
              const match = FINISHED_WORD.exec(before);
              if (!match) return false;
              const corrected = takeAutocorrection(match[1]);
              if (!corrected) return false;
              view.dispatch(
                view.state.tr.insertText(`${corrected}${text}`, from - match[1].length, to),
              );
              refusable = { word: match[1], at: Date.now() };
              return true;
            },
          },
        }),
      ];
    },
  });
}
