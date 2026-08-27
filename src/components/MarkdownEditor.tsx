import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Annotation, Compartment, EditorState, Transaction } from "@codemirror/state";
import {
  EditorView,
  keymap,
  drawSelection,
  placeholder as cmPlaceholder,
  ViewPlugin,
  Decoration,
  WidgetType,
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

function safeLinkUrl(raw: string): string | null {
  try {
    const url = new URL(raw, window.location.href);
    return ["http:", "https:", "mailto:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function safeImageUrl(raw: string): string | null {
  if (/^data:image\/(?:jpeg|png|webp);base64,/i.test(raw)) return raw;
  try {
    const url = new URL(raw, window.location.href);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

class LinkWidget extends WidgetType {
  constructor(
    readonly label: string,
    readonly url: string,
  ) {
    super();
  }

  eq(other: LinkWidget): boolean {
    return other.label === this.label && other.url === this.url;
  }

  toDOM(): HTMLElement {
    const anchor = document.createElement("a");
    anchor.className = "cm-md-link-widget";
    anchor.href = this.url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.textContent = this.label;
    anchor.title = this.url;
    anchor.addEventListener("mousedown", (event) => event.stopPropagation());
    anchor.addEventListener("click", (event) => event.stopPropagation());
    return anchor;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

class ImageWidget extends WidgetType {
  constructor(
    readonly alt: string,
    readonly url: string,
    readonly sourceFrom: number,
  ) {
    super();
  }

  eq(other: ImageWidget): boolean {
    return other.alt === this.alt && other.url === this.url && other.sourceFrom === this.sourceFrom;
  }

  toDOM(view: EditorView): HTMLElement {
    const frame = document.createElement("span");
    frame.className = "cm-md-image-widget";

    const image = document.createElement("img");
    image.src = this.url;
    image.alt = this.alt;
    image.loading = "lazy";
    image.decoding = "async";
    frame.append(image);

    const error = document.createElement("span");
    error.className = "cm-md-image-error";
    error.textContent = "Image could not be loaded";
    error.hidden = true;
    frame.append(error);

    image.addEventListener("error", () => {
      image.hidden = true;
      error.hidden = false;
      frame.classList.add("is-error");
    });

    if (!view.state.readOnly) {
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "cm-md-image-edit";
      edit.textContent = "Edit source";
      edit.addEventListener("mousedown", (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      edit.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        view.dispatch({ selection: { anchor: this.sourceFrom }, scrollIntoView: true });
        view.focus();
      });
      frame.append(edit);
    }

    return frame;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

function markdownLink(source: string): { label: string; url: string } | null {
  const match = source.match(/^\[([\s\S]*?)\]\(([\s\S]+)\)$/);
  if (!match) return null;
  const url = safeLinkUrl(match[2].trim());
  return url ? { label: match[1] || url, url } : null;
}

function markdownImage(source: string): { alt: string; url: string } | null {
  const match = source.match(/^!\[([\s\S]*?)\]\(([\s\S]+)\)$/);
  if (!match) return null;
  const url = safeImageUrl(match[2].trim());
  return url ? { alt: match[1] || "Image", url } : null;
}

function buildDecorations(view: EditorView): DecorationSet {
  const ranges: { from: number; to: number; deco: Decoration }[] = [];
  const doc = view.state.doc;

  // Lines the caret or a selection currently touches. Markers on these lines
  // stay visible, so editing the syntax never fights with rendering it.
  const activeLines = new Set<number>();
  if (view.hasFocus) {
    for (const r of view.state.selection.ranges) {
      const first = doc.lineAt(r.from).number;
      const last = doc.lineAt(r.to).number;
      for (let n = first; n <= last; n++) activeLines.add(n);
    }
  }

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        const source = doc.sliceString(node.from, node.to);
        const sourceLine = doc.lineAt(node.from).number;
        const onActiveLine = activeLines.has(sourceLine);

        if (node.name === "Image" && !onActiveLine) {
          const image = markdownImage(source);
          if (image) {
            ranges.push({
              from: node.from,
              to: node.to,
              deco: Decoration.replace({
                widget: new ImageWidget(image.alt, image.url, node.from),
              }),
            });
            return false;
          }
        }

        if (node.name === "Link" && !onActiveLine) {
          const link = markdownLink(source);
          if (link) {
            ranges.push({
              from: node.from,
              to: node.to,
              deco: Decoration.replace({ widget: new LinkWidget(link.label, link.url) }),
            });
            return false;
          }
        }

        if (node.name === "URL" && node.node.parent?.name !== "Link" && !onActiveLine) {
          const url = safeLinkUrl(source);
          if (url) {
            ranges.push({
              from: node.from,
              to: node.to,
              deco: Decoration.replace({ widget: new LinkWidget(source, url) }),
            });
            return false;
          }
        }

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
      if (u.docChanged || u.viewportChanged || u.selectionSet || u.focusChanged) {
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
  getSelectedText: () => string;
  insertLink: (label: string, url: string) => void;
  insertText: (text: string) => void;
  insertImage: (src: string, alt: string) => void;
  focus: () => void;
}

interface Props {
  value: string;
  readOnly: boolean;
  placeholder: string;
  /** Changing this swaps the document wholesale — a different note, not an edit. */
  docKey: string;
  /**
   * Bumped by the page when `value` carries text pulled from another device.
   * Only then is the document rewritten under a caret that is already in it.
   */
  revision?: number;
  onChange: (next: string) => void;
  onPasteImage?: (file: File) => Promise<{ src: string; alt: string } | null>;
}

/**
 * Rewrites the document to `text` touching only the span that actually differs.
 * Replacing the whole doc would work too, but CodeMirror maps the selection
 * through the change it is given: a narrow change leaves a caret sitting after
 * the edit exactly where it was, which is what makes a remote update land
 * without shoving the reader somewhere else.
 */
function reconcileDoc(view: EditorView, text: string): void {
  const doc = view.state.doc.toString();
  if (doc === text) return;

  let from = 0;
  const shared = Math.min(doc.length, text.length);
  while (from < shared && doc[from] === text[from]) from++;
  let to = doc.length;
  let end = text.length;
  while (to > from && end > from && doc[to - 1] === text[end - 1]) {
    to--;
    end--;
  }

  view.dispatch({
    changes: { from, to, insert: text.slice(from, end) },
    annotations: [externalDocumentChange.of(true), Transaction.addToHistory.of(false)],
  });
}

function insertImage(editor: EditorView, src: string, alt: string): void {
  const { from, to } = editor.state.selection.main;
  const before = editor.state.doc.sliceString(0, from);
  const prefix = from > 0 && !before.endsWith("\n\n") ? "\n\n" : "";
  const insert = `${prefix}![${alt}](${src})\n\n`;
  editor.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + insert.length },
    scrollIntoView: true,
  });
  editor.focus();
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
  { value, readOnly, placeholder, docKey, revision = 0, onChange, onPasteImage },
  ref,
) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onPasteImageRef = useRef(onPasteImage);
  onPasteImageRef.current = onPasteImage;
  const editable = useRef(new Compartment());

  useImperativeHandle(ref, () => ({
    format(action) {
      if (readOnly || !view.current) return;
      formatSelection(view.current, action);
    },
    getSelectedText() {
      const editor = view.current;
      if (!editor) return "";
      const { from, to } = editor.state.selection.main;
      return editor.state.doc.sliceString(from, to);
    },
    insertLink(label, url) {
      if (readOnly || !view.current) return;
      const editor = view.current;
      const cleanLabel = label.replaceAll("[", "").replaceAll("]", "").trim() || url;
      const insert = `[${cleanLabel}](${url})`;
      replaceSelection(editor, insert, insert.length, insert.length);
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
    insertImage(src, alt) {
      if (readOnly || !view.current) return;
      insertImage(view.current, src, alt);
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
          EditorView.domEventHandlers({
            paste(event, editor) {
              if (editor.state.readOnly || !onPasteImageRef.current) return false;
              const item = Array.from(event.clipboardData?.items ?? []).find(
                (candidate) => candidate.kind === "file" && candidate.type.startsWith("image/"),
              );
              const file = item?.getAsFile();
              if (!file) return false;

              event.preventDefault();
              void onPasteImageRef.current(file).then((prepared) => {
                if (!prepared || !editor.dom.isConnected) return;
                insertImage(editor, prepared.src, prepared.alt);
              });
              return true;
            },
          }),
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
  // External swaps must never enter the undo stack — otherwise Ctrl+Z would
  // revert the current note to the previous note's content (the reported "Angel" bug).
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    if (v.state.doc.toString() === value) return;
    v.dispatch({
      changes: { from: 0, to: v.state.doc.length, insert: value },
      selection: { anchor: 0 },
      scrollIntoView: true,
      annotations: [externalDocumentChange.of(true), Transaction.addToHistory.of(false)],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docKey]);

  // An edit that arrived from outside this component (a pending draft being
  // restored, say). Never fight the user's own keystrokes: while the caret is
  // in here, `value` can lag a render behind the document and writing it back
  // would undo the characters just typed.
  useEffect(() => {
    const v = view.current;
    if (!v || v.hasFocus) return;
    reconcileDoc(v, value);
  }, [value]);

  // Text pulled from the other device. The page raises `revision` only once it
  // has established there is nothing unsaved for this note, so this is the one
  // outside edit that may be applied while the caret is in the document.
  const appliedRevision = useRef(revision);
  useEffect(() => {
    if (appliedRevision.current === revision) return;
    appliedRevision.current = revision;
    if (view.current) reconcileDoc(view.current, value);
    // `value` is read for its current commit, not tracked: a revision bump is
    // the only thing that authorises this write.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision]);

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
