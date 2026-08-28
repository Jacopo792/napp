import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Annotation, Compartment, EditorState, Facet, Transaction } from "@codemirror/state";
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

export interface ImagePreview {
  src: string;
  alt: string;
}

/** Raised by an image widget when the reader asks to see it full size. */
const IMAGE_OPEN_EVENT = "napp:image-open";

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
type ImageResolver = (imageId: string) => Promise<Blob>;
const imageResolver = Facet.define<ImageResolver | undefined, ImageResolver | undefined>({
  combine: (values) => values[0],
});

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
  if (
    /^napp-image:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      raw,
    )
  ) {
    return raw;
  }
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

const ICON = {
  expand:
    '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
  trash:
    '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/>',
};

function iconButton(icon: keyof typeof ICON, label: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "cm-md-image-action";
  button.title = label;
  button.setAttribute("aria-label", label);
  button.innerHTML =
    `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" ` +
    `stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
    `${ICON[icon]}</svg>`;
  // Keep the caret where it was: pressing an action must not move the selection
  // into the source it is acting on.
  button.addEventListener("mousedown", (event) => event.preventDefault());
  return button;
}

/**
 * An embedded image is a reading object, never a span of text. Its source is a
 * storage reference rather than encoded bytes. The widget replaces the Markdown
 * unconditionally and carries its own actions: open the image full size, or
 * remove it whole.
 */
class ImageWidget extends WidgetType {
  constructor(
    readonly alt: string,
    readonly url: string,
    readonly from: number,
    readonly to: number,
    readonly resolveImage: ImageResolver | undefined,
  ) {
    super();
  }

  eq(other: ImageWidget): boolean {
    return (
      other.alt === this.alt &&
      other.url === this.url &&
      other.from === this.from &&
      other.to === this.to &&
      other.resolveImage === this.resolveImage
    );
  }

  toDOM(view: EditorView): HTMLElement {
    const frame = document.createElement("span");
    frame.className = "cm-md-image-widget";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "cm-md-image-open";
    button.title = "Open full size";
    button.setAttribute("aria-label", `Open image full size: ${this.alt}`);

    const image = document.createElement("img");
    image.alt = this.alt;
    image.loading = "lazy";
    image.decoding = "async";
    if (this.url.startsWith("napp-image:")) {
      const imageId = this.url.slice("napp-image:".length);
      if (!this.resolveImage) {
        queueMicrotask(() => image.dispatchEvent(new Event("error")));
      } else {
        void this.resolveImage(imageId)
          .then((blob) => {
            if (!image.isConnected) return;
            const objectUrl = URL.createObjectURL(blob);
            image.dataset.objectUrl = objectUrl;
            image.src = objectUrl;
          })
          .catch(() => image.dispatchEvent(new Event("error")));
      }
    } else {
      image.src = this.url;
    }
    button.append(image);
    frame.append(button);

    const error = document.createElement("span");
    error.className = "cm-md-image-error";
    error.textContent = "This image could not be displayed.";
    error.hidden = true;
    frame.append(error);

    image.addEventListener("error", () => {
      button.hidden = true;
      error.hidden = false;
      frame.classList.add("is-error");
    });

    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      frame.dispatchEvent(
        new CustomEvent<ImagePreview>(IMAGE_OPEN_EVENT, {
          bubbles: true,
          detail: { src: image.currentSrc || image.src, alt: this.alt },
        }),
      );
    });

    const actions = document.createElement("span");
    actions.className = "cm-md-image-actions";

    const open = iconButton("expand", "Open full size");
    open.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      button.click();
    });
    actions.append(open);

    if (!view.state.readOnly) {
      const remove = iconButton("trash", "Remove image");
      remove.classList.add("is-danger");
      remove.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        removeImageAt(view, this.from, this.to);
      });
      actions.append(remove);
    }

    frame.append(actions);

    if (this.alt && this.alt !== "Image") {
      const caption = document.createElement("span");
      caption.className = "cm-md-image-caption";
      caption.textContent = this.alt;
      frame.append(caption);
    }

    return frame;
  }

  destroy(dom: HTMLElement): void {
    const objectUrl = dom.querySelector("img")?.dataset.objectUrl;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }

  ignoreEvent(): boolean {
    return true;
  }
}

/**
 * Takes the whole image out, and the line with it when the image was all the
 * line held — otherwise removing a picture leaves a blank paragraph behind. A
 * picture sitting between two blank lines takes one of them along too, so the
 * paragraphs it separated close up to a single gap.
 */
function removeImageAt(view: EditorView, from: number, to: number): void {
  const doc = view.state.doc;
  const line = doc.lineAt(from);

  if (line.from !== from || line.to !== to) {
    view.dispatch({ changes: { from, to, insert: "" }, selection: { anchor: from } });
    view.focus();
    return;
  }

  const before = line.number > 1 ? doc.line(line.number - 1) : null;
  const after = line.number < doc.lines ? doc.line(line.number + 1) : null;

  let start = line.from;
  let end = line.to;
  if (before) start = before.to;
  else if (after) end = after.from;
  if (before && after && before.length === 0 && after.length === 0) end = after.from;

  view.dispatch({
    changes: { from: start, to: end, insert: "" },
    selection: { anchor: start },
    scrollIntoView: true,
  });
  view.focus();
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

interface MarkdownDecorations {
  decorations: DecorationSet;
  /** Image widgets, kept apart so the caret can step over them as one unit. */
  images: DecorationSet;
}

function buildDecorations(view: EditorView): MarkdownDecorations {
  const ranges: { from: number; to: number; deco: Decoration }[] = [];
  const images: { from: number; to: number; deco: Decoration }[] = [];
  const doc = view.state.doc;
  const resolveImage = view.state.facet(imageResolver);

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

        // Images never yield to the caret. Their source is encoded bytes, not
        // prose, so there is nothing useful on the other side of revealing it.
        if (node.name === "Image") {
          const image = markdownImage(source);
          if (image) {
            const deco = Decoration.replace({
              widget: new ImageWidget(image.alt, image.url, node.from, node.to, resolveImage),
            });
            ranges.push({ from: node.from, to: node.to, deco });
            images.push({ from: node.from, to: node.to, deco });
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
  return {
    decorations: Decoration.set(
      ranges.map((r) => r.deco.range(r.from, r.to)),
      true,
    ),
    images: Decoration.set(
      images.map((r) => r.deco.range(r.from, r.to)),
      true,
    ),
  };
}

const richMarkdown = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    images: DecorationSet;

    constructor(view: EditorView) {
      ({ decorations: this.decorations, images: this.images } = buildDecorations(view));
    }

    update(u: ViewUpdate) {
      // Selection is in the dependency list on purpose: moving the caret onto
      // a line is what brings that line's markers back.
      if (u.docChanged || u.viewportChanged || u.selectionSet || u.focusChanged) {
        ({ decorations: this.decorations, images: this.images } = buildDecorations(u.view));
      }
    }
  },
  { decorations: (v) => v.decorations },
);

/* An arrow key steps over a picture, and one backspace deletes it. The storage
   reference (or a legacy base64 payload) is never exposed character by character. */
const atomicImages = EditorView.atomicRanges.of(
  (view) => view.plugin(richMarkdown)?.images ?? Decoration.none,
);

/**
 * Full-size view of an embedded image. The note stays exactly as it was — this
 * is a reading affordance, not an edit — so the overlay closes on Escape, on a
 * click outside the picture, and on the one visible control.
 */
function ImageLightbox({ preview, onClose }: { preview: ImagePreview; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={preview.alt}
      className="lightbox"
      onClick={onClose}
    >
      <figure className="lightbox-figure" onClick={(event) => event.stopPropagation()}>
        <img src={preview.src} alt={preview.alt} />
        {preview.alt && preview.alt !== "Image" && (
          <figcaption className="readout">{preview.alt}</figcaption>
        )}
      </figure>
      <button type="button" onClick={onClose} className="lightbox-close" aria-label="Close image">
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.9}
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>,
    document.body,
  );
}

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
  resolveImage?: ImageResolver;
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
  { value, readOnly, placeholder, docKey, revision = 0, onChange, onPasteImage, resolveImage },
  ref,
) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const [preview, setPreview] = useState<ImagePreview | null>(null);
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
          imageResolver.of(resolveImage),
          richMarkdown,
          atomicImages,
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

  // An image widget lives in CodeMirror's DOM, outside React. It asks for a
  // full-size view by raising an event that bubbles up to this host.
  useEffect(() => {
    const node = host.current;
    if (!node) return;
    const open = (event: Event) => setPreview((event as CustomEvent<ImagePreview>).detail);
    node.addEventListener(IMAGE_OPEN_EVENT, open);
    return () => node.removeEventListener(IMAGE_OPEN_EVENT, open);
  }, []);

  return (
    <>
      <div ref={host} className="h-full" />
      {preview && <ImageLightbox preview={preview} onClose={() => setPreview(null)} />}
    </>
  );
});
