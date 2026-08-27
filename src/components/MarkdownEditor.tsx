import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Annotation, EditorState, Compartment } from "@codemirror/state";
import {
  EditorView,
  keymap,
  drawSelection,
  placeholder as cmPlaceholder,
  ViewPlugin,
  Decoration,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage, markdownKeymap } from "@codemirror/lang-markdown";
import { syntaxTree } from "@codemirror/language";

/* ── Invisible markdown ──────────────────────────────────────────────────────
   Markdown renders as formatting while you type. There is no toolbar and no
   preview pane, because both of them mean the words you wrote and the words
   you read are two different objects.

   Syntax markers are not deleted — they are hidden only while the cursor is on
   another line, and reappear the moment you move onto the line that owns them.
   That is the one rule that makes this editable rather than merely pretty: the
   source is always one caret move away, so nothing about the note is a mystery.

   Sizing comes entirely from CSS custom properties written by lib/axes.ts, so
   the axis bar drives real font-variation-settings on the text as it is typed
   rather than a preview of it. ─────────────────────────────────────────────── */

/** Marker node types that vanish when the caret is elsewhere. */
const HIDDEN_MARKS = new Set([
  "HeaderMark",
  "EmphasisMark",
  "StrikethroughMark",
  "LinkMark",
  "URL",
]);

/** Nodes styled in place; the value is the class from styles.css. */
const INLINE_CLASS: Record<string, string> = {
  StrongEmphasis: "cm-md-strong",
  Emphasis: "cm-md-em",
  Strikethrough: "cm-md-strike",
  InlineCode: "cm-md-code",
  CodeText: "cm-md-fence",
  CodeInfo: "cm-md-fence",
  Link: "cm-md-link",
  ListMark: "cm-md-list",
  QuoteMark: "cm-md-mark",
  HorizontalRule: "cm-md-hr",
};

const HEADING_CLASS: Record<string, string> = {
  ATXHeading1: "cm-md-h1",
  ATXHeading2: "cm-md-h2",
  ATXHeading3: "cm-md-h3",
  ATXHeading4: "cm-md-h4",
  ATXHeading5: "cm-md-h4",
  ATXHeading6: "cm-md-h4",
  SetextHeading1: "cm-md-h1",
  SetextHeading2: "cm-md-h2",
};

const hideMark = Decoration.replace({});
const dimMark = Decoration.mark({ class: "cm-md-mark" });

/** Document replacements caused by opening/syncing a note are not user edits. */
const externalDocumentChange = Annotation.define<boolean>();

function buildDecorations(view: EditorView): DecorationSet {
  const ranges: { from: number; to: number; deco: Decoration }[] = [];
  const doc = view.state.doc;

  // Lines the caret or a selection currently touches. Markers on these lines
  // stay visible, so editing the syntax never fights with rendering it.
  const activeLines = new Set<number>();
  for (const r of view.state.selection.ranges) {
    const first = doc.lineAt(r.from).number;
    const last = doc.lineAt(r.to).number;
    for (let n = first; n <= last; n++) activeLines.add(n);
  }

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        const heading = HEADING_CLASS[node.name];
        if (heading) {
          // A line decoration so the whole line takes the heading's metrics,
          // not just the run of characters that happen to be typed so far.
          const line = doc.lineAt(node.from);
          ranges.push({
            from: line.from,
            to: line.from,
            deco: Decoration.line({ class: heading }),
          });
          return;
        }

        if (HIDDEN_MARKS.has(node.name)) {
          if (node.to === node.from) return;
          const onActiveLine = activeLines.has(doc.lineAt(node.from).number);
          ranges.push({
            from: node.from,
            to: node.to,
            deco: onActiveLine ? dimMark : hideMark,
          });
          return;
        }

        const cls = INLINE_CLASS[node.name];
        if (cls && node.to > node.from) {
          ranges.push({ from: node.from, to: node.to, deco: Decoration.mark({ class: cls }) });
        }
      },
    });
  }

  // Sorted on the way in: line decorations and nested marks can share a start
  // offset, and Decoration.set resolves the ordering rules for us.
  return Decoration.set(
    ranges.map((r) => r.deco.range(r.from, r.to)),
    true,
  );
}

const richMarkdown = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(u: ViewUpdate) {
      // Selection is in the dependency list on purpose: moving the caret onto
      // a line is what brings that line's markers back.
      if (u.docChanged || u.viewportChanged || u.selectionSet) {
        this.decorations = buildDecorations(u.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

export type FormatAction =
  | "bold"
  | "italic"
  | "strike"
  | "code"
  | "heading"
  | "bullet-list"
  | "ordered-list"
  | "quote"
  | "link"
  | "divider";

export interface MarkdownEditorHandle {
  format: (action: FormatAction) => void;
  insertText: (text: string) => void;
  focus: () => void;
}

interface Props {
  value: string;
  readOnly: boolean;
  placeholder: string;
  /** Changing this swaps the document wholesale — a different note, not an edit. */
  docKey: string;
  onChange: (next: string) => void;
}

function replaceSelection(
  editor: EditorView,
  insert: string,
  selectedFrom: number,
  selectedTo: number,
): void {
  const { from, to } = editor.state.selection.main;
  editor.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + selectedFrom, head: from + selectedTo },
    scrollIntoView: true,
  });
  editor.focus();
}

function formatSelection(editor: EditorView, action: FormatAction): void {
  const selection = editor.state.selection.main;
  const selected = editor.state.doc.sliceString(selection.from, selection.to);

  const wrap = (before: string, after: string, fallback: string) => {
    const content = selected || fallback;
    replaceSelection(
      editor,
      `${before}${content}${after}`,
      before.length,
      before.length + content.length,
    );
  };

  if (action === "bold") return wrap("**", "**", "bold text");
  if (action === "italic") return wrap("_", "_", "italic text");
  if (action === "strike") return wrap("~~", "~~", "strikethrough");
  if (action === "code") return wrap("`", "`", "code");
  if (action === "link") {
    const label = selected || "link text";
    const insert = `[${label}](https://)`;
    const urlStart = label.length + 3;
    return replaceSelection(editor, insert, urlStart, urlStart + 8);
  }
  if (action === "divider") {
    return replaceSelection(editor, "\n\n---\n\n", 7, 7);
  }

  const firstLine = editor.state.doc.lineAt(selection.from);
  const lastLine = editor.state.doc.lineAt(selection.to);
  const block = editor.state.doc.sliceString(firstLine.from, lastLine.to);
  let transformed = block;

  if (action === "heading") {
    transformed = block
      .split("\n")
      .map((line) => (line.startsWith("## ") ? line.slice(3) : `## ${line}`))
      .join("\n");
  } else {
    const prefix = action === "bullet-list" ? "- " : action === "ordered-list" ? "1. " : "> ";
    transformed = block
      .split("\n")
      .map((line) => `${prefix}${line}`)
      .join("\n");
  }

  editor.dispatch({
    changes: { from: firstLine.from, to: lastLine.to, insert: transformed },
    selection: { anchor: firstLine.from, head: firstLine.from + transformed.length },
    scrollIntoView: true,
  });
  editor.focus();
}

export const MarkdownEditor = forwardRef<MarkdownEditorHandle, Props>(function MarkdownEditor(
  { value, readOnly, placeholder, docKey, onChange },
  ref,
) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const editable = useRef(new Compartment());

  useImperativeHandle(ref, () => ({
    format(action) {
      if (readOnly || !view.current) return;
      formatSelection(view.current, action);
    },
    insertText(text) {
      if (readOnly || !view.current) return;
      const editor = view.current;
      const { from, to } = editor.state.selection.main;
      const prefix =
        from > 0 && !editor.state.doc.sliceString(0, from).endsWith("\n\n") ? "\n\n" : "";
      const insert = `${prefix}${text}\n\n`;
      editor.dispatch({
        changes: { from, to, insert },
        selection: { anchor: from + insert.length },
        scrollIntoView: true,
      });
      editor.focus();
    },
    focus() {
      view.current?.focus();
    },
  }));

  useEffect(() => {
    if (!host.current) return;

    const v = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          drawSelection(),
          EditorView.lineWrapping,
          markdown({ base: markdownLanguage }),
          richMarkdown,
          cmPlaceholder(placeholder),
          keymap.of([
            { key: "Mod-b", run: (editor) => (formatSelection(editor, "bold"), true) },
            { key: "Mod-i", run: (editor) => (formatSelection(editor, "italic"), true) },
            ...markdownKeymap,
            ...defaultKeymap,
            ...historyKeymap,
            indentWithTab,
          ]),
          editable.current.of([
            EditorState.readOnly.of(readOnly),
            EditorView.editable.of(!readOnly),
          ]),
          EditorView.updateListener.of((u) => {
            const external = u.transactions.some((transaction) =>
              transaction.annotation(externalDocumentChange),
            );
            if (u.docChanged && !external) onChangeRef.current(u.state.doc.toString());
          }),
        ],
      }),
      parent: host.current,
    });

    view.current = v;
    return () => {
      v.destroy();
      view.current = null;
    };
    // Mounted once; document and read-only state are reconciled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A different note: replace the document and put the reader back at the top.
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    if (v.state.doc.toString() === value) return;
    v.dispatch({
      changes: { from: 0, to: v.state.doc.length, insert: value },
      selection: { anchor: 0 },
      scrollIntoView: true,
      annotations: externalDocumentChange.of(true),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docKey]);

  // An edit that arrived from outside this component (a pending draft being
  // restored, say). Never fight the user's own keystrokes.
  useEffect(() => {
    const v = view.current;
    if (!v || v.hasFocus) return;
    if (v.state.doc.toString() === value) return;
    v.dispatch({
      changes: { from: 0, to: v.state.doc.length, insert: value },
      annotations: externalDocumentChange.of(true),
    });
  }, [value]);

  useEffect(() => {
    const v = view.current;
    if (!v) return;
    v.dispatch({
      effects: editable.current.reconfigure([
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
      ]),
    });
  }, [readOnly]);

  return <div ref={host} className="h-full" />;
});
