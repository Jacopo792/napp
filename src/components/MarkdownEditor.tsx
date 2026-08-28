import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Annotation,
  Compartment,
  EditorState,
  Facet,
  StateField,
  Transaction,
} from "@codemirror/state";
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
import {
  SearchCursor,
  SearchQuery,
  findNext,
  findPrevious,
  search,
  setSearchQuery,
} from "@codemirror/search";
import { attachmentExtension, attachmentObjectId } from "@/lib/attachments";

/* The tree's own node type, taken from the tree rather than from a direct
   dependency on @lezer/common that this package does not otherwise need. */
type SyntaxNode = ReturnType<typeof syntaxTree>["topNode"];

/* ── Invisible markdown ──────────────────────────────────────────────────────
   Markdown renders as formatting while you type. There is no toolbar and no
   preview pane, because both of them mean the words you wrote and the words
   you read are two different objects.

   Syntax markers are not deleted — they are hidden only while the cursor is on
   another line, and reappear the moment you move onto the line that owns them.
   That is the one rule that makes this editable rather than merely pretty: the
   source is always one caret move away, so nothing about the note is a mystery.

   Sizing comes entirely from CSS custom properties written by lib/axes.ts, so
   the axis bar drives the reading scale and weight on the text as it is typed
   rather than a preview of it. ─────────────────────────────────────────────── */

export interface ImagePreview {
  src: string;
  alt: string;
}

/** Raised by an image widget when the reader asks to see it full size. */
const IMAGE_OPEN_EVENT = "napp:image-open";

/* Markers that are never shown. The formatting they ask for is already on the
   screen, so printing the syntax as well prints it twice — which is the whole
   complaint about "invisible" markdown that stops being invisible the moment
   the caret arrives. Emphasis, headings, quotes, lists and colours are drawn,
   never spelled. Only two things still reveal their source, and both do it
   because their source is not prose: a link (you have to be able to edit the
   URL) and a table (you have to be able to edit the grid). */
const HIDDEN_MARKS = new Set(["HeaderMark", "EmphasisMark", "StrikethroughMark", "QuoteMark"]);

/** Nodes styled in place; the value is the class from styles.css. */
const INLINE_CLASS: Record<string, string> = {
  StrongEmphasis: "cm-md-strong",
  Emphasis: "cm-md-em",
  Strikethrough: "cm-md-strike",
  InlineCode: "cm-md-code",
  CodeText: "cm-md-fence",
  CodeInfo: "cm-md-fence",
  Link: "cm-md-link",
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
const numberMark = Decoration.mark({ class: "cm-md-number" });
const doneMark = Decoration.mark({ class: "cm-md-done" });

/** Document replacements caused by opening/syncing a note are not user edits. */
const externalDocumentChange = Annotation.define<boolean>();
type ImageResolver = (imageId: string) => Promise<Blob>;
const imageResolver = Facet.define<ImageResolver | undefined, ImageResolver | undefined>({
  combine: (values) => values[0],
});
const fileResolver = Facet.define<ImageResolver | undefined, ImageResolver | undefined>({
  combine: (values) => values[0],
});

/* Text colour, and the syntax that carries it through the Markdown. The old
   `==text==` highlight notation is kept so notes written before this render
   unchanged — what it means now is the colour of the letters, not a wash
   behind them. */
const COLOR_PATTERN = /==(?:(yellow|purple|pink|orange|mint|blue):)?((?:(?!==).)+)==/g;
const COLOR_STRIP = /==(?:(?:yellow|purple|pink|orange|mint|blue):)?((?:(?!==).)+)==/g;

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

/** The dot a bulleted list's `-` becomes. */
class BulletWidget extends WidgetType {
  eq(): boolean {
    return true;
  }

  toDOM(): HTMLElement {
    const dot = document.createElement("span");
    dot.className = "cm-md-bullet";
    dot.textContent = "\u2022";
    dot.setAttribute("aria-hidden", "true");
    return dot;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

/**
 * A checklist box. It is a control, not a picture of one: clicking it rewrites
 * the single character between the brackets, so the state of the list lives in
 * the note rather than in this component.
 */
class TaskWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly from: number,
  ) {
    super();
  }

  eq(other: TaskWidget): boolean {
    return other.checked === this.checked && other.from === this.from;
  }

  toDOM(view: EditorView): HTMLElement {
    const box = document.createElement("button");
    box.type = "button";
    box.className = `cm-md-task${this.checked ? " is-done" : ""}`;
    box.setAttribute("aria-pressed", String(this.checked));
    box.setAttribute("aria-label", this.checked ? "Mark as not done" : "Mark as done");
    box.innerHTML = this.checked
      ? '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" ' +
        'stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M20 6 9 17l-5-5"/></svg>'
      : "";
    box.addEventListener("mousedown", (event) => event.preventDefault());
    box.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (view.state.readOnly) return;
      view.dispatch({
        changes: { from: this.from + 1, to: this.from + 2, insert: this.checked ? " " : "x" },
      });
    });
    return box;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

interface TableCellSpec {
  text: string;
  /** Where in the document this cell's text starts, so a click can land there. */
  pos: number;
}

interface TableSpec {
  header: TableCellSpec[];
  rows: TableCellSpec[][];
}

/**
 * A table drawn as a table.
 *
 * Pipes and dashes are a serialisation, not a layout: read as text they are
 * noise, and no amount of styling makes a row of `|` line up into columns. So
 * the block is replaced by a real grid whenever the caret is somewhere else,
 * and clicking a cell puts the caret in that cell's source — which is the only
 * moment the pipes are useful, and the only moment they appear.
 */
class TableWidget extends WidgetType {
  constructor(
    readonly spec: TableSpec,
    readonly key: string,
  ) {
    super();
  }

  eq(other: TableWidget): boolean {
    return other.key === this.key;
  }

  toDOM(view: EditorView): HTMLElement {
    const frame = document.createElement("div");
    frame.className = "cm-md-table";

    const table = document.createElement("table");
    const head = document.createElement("thead");
    const headRow = document.createElement("tr");
    for (const cell of this.spec.header) headRow.append(this.cell(view, cell, "th"));
    head.append(headRow);
    table.append(head);

    const body = document.createElement("tbody");
    for (const row of this.spec.rows) {
      const tr = document.createElement("tr");
      for (const cell of row) tr.append(this.cell(view, cell, "td"));
      body.append(tr);
    }
    table.append(body);
    frame.append(table);
    return frame;
  }

  private cell(view: EditorView, spec: TableCellSpec, tag: "th" | "td"): HTMLElement {
    const cell = document.createElement(tag);
    cell.textContent = spec.text || "\u00a0";
    cell.title = "Click to edit this cell";
    cell.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      view.dispatch({ selection: { anchor: spec.pos }, scrollIntoView: true });
      view.focus();
    });
    return cell;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

const ICON = {
  download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
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
 * A PDF is a document, not a paragraph. It sits in the note as a card carrying
 * its name and type; opening it decrypts the stored bytes in this tab and hands
 * the result to a new one, so the file is read where files are read.
 *
 * The window is opened synchronously on the click and navigated once the bytes
 * arrive — asking for it after the await is what a popup blocker refuses.
 */
class AttachmentWidget extends WidgetType {
  constructor(
    readonly label: string,
    readonly objectId: string,
    readonly from: number,
    readonly to: number,
    readonly resolveFile: ImageResolver | undefined,
  ) {
    super();
  }

  eq(other: AttachmentWidget): boolean {
    return (
      other.label === this.label &&
      other.objectId === this.objectId &&
      other.from === this.from &&
      other.to === this.to &&
      other.resolveFile === this.resolveFile
    );
  }

  toDOM(view: EditorView): HTMLElement {
    const frame = document.createElement("span");
    frame.className = "cm-md-file-widget";

    const open = document.createElement("button");
    open.type = "button";
    open.className = "cm-md-file-open";
    open.title = `Open ${this.label} in a new tab`;
    open.setAttribute("aria-label", `Open ${this.label} in a new tab`);

    const badge = document.createElement("span");
    badge.className = "cm-md-file-badge";
    badge.textContent = attachmentExtension(this.label);

    const text = document.createElement("span");
    text.className = "cm-md-file-text";
    const name = document.createElement("span");
    name.className = "cm-md-file-name";
    name.textContent = this.label;
    const hint = document.createElement("span");
    hint.className = "cm-md-file-hint";
    hint.textContent = "Encrypted attachment · opens in a new tab";
    text.append(name, hint);

    open.append(badge, text);
    frame.append(open);

    open.addEventListener("mousedown", (event) => event.preventDefault());
    open.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!this.resolveFile) return;

      /* Opened empty and now, while the click is still the reason anything is
         happening — asking for the window after the decrypt is what a popup
         blocker refuses. `noopener` is deliberately absent: it makes the call
         return null, and the handle is the whole point. The opener is severed
         by hand instead, as soon as the tab has somewhere to be. */
      const tab = window.open("", "_blank");
      hint.textContent = "Decrypting…";
      void this.resolveFile(this.objectId)
        .then((blob) => {
          const objectUrl = URL.createObjectURL(blob);
          if (tab) {
            tab.location.replace(objectUrl);
            tab.opener = null;
          }
          hint.textContent = tab
            ? "Encrypted attachment · opens in a new tab"
            : "Allow pop-ups to open this attachment";
          // The new tab has to finish reading the blob before it is released.
          window.setTimeout(() => URL.revokeObjectURL(objectUrl), 120_000);
        })
        .catch((reason: unknown) => {
          tab?.close();
          // The reason matters: "not signed in" and "the object is gone" are
          // different problems, and a card that says neither is a dead end.
          hint.textContent =
            reason instanceof Error ? reason.message : "This attachment could not be opened";
          frame.classList.add("is-error");
        });
    });

    if (!view.state.readOnly) {
      const actions = document.createElement("span");
      actions.className = "cm-md-file-actions";
      const download = iconButton("download", `Download ${this.label}`);
      download.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!this.resolveFile) return;
        hint.textContent = "Preparing download…";
        void this.resolveFile(this.objectId)
          .then((blob) => {
            const objectUrl = URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.href = objectUrl;
            anchor.download = this.label;
            anchor.hidden = true;
            document.body.append(anchor);
            anchor.click();
            anchor.remove();
            window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
            hint.textContent = "Encrypted attachment · opens in a new tab";
          })
          .catch((reason: unknown) => {
            hint.textContent =
              reason instanceof Error ? reason.message : "This attachment could not be downloaded";
            frame.classList.add("is-error");
          });
      });
      actions.append(download);
      const remove = iconButton("trash", `Remove ${this.label}`);
      remove.classList.add("is-danger");
      remove.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        removeImageAt(view, this.from, this.to);
      });
      actions.append(remove);
      frame.append(actions);
    }

    return frame;
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

function markdownAttachment(source: string): { label: string; objectId: string } | null {
  const match = source.match(/^\[([\s\S]*?)\]\(([\s\S]+)\)$/);
  if (!match) return null;
  const objectId = attachmentObjectId(match[2]);
  return objectId ? { label: match[1] || "Attachment", objectId } : null;
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

/**
 * Reads a Table node into rows of cells with the position of each cell's text,
 * so the grid drawn from it can hand a click back to the source it came from.
 */
function readTable(state: EditorState, table: SyntaxNode): TableSpec | null {
  const doc = state.doc;
  const cellsOf = (row: SyntaxNode): TableCellSpec[] => {
    const cells: TableCellSpec[] = [];
    for (let cell = row.firstChild; cell; cell = cell.nextSibling) {
      if (cell.name !== "TableCell") continue;
      cells.push({ text: doc.sliceString(cell.from, cell.to).trim(), pos: cell.from });
    }
    return cells;
  };

  let header: TableCellSpec[] | null = null;
  const rows: TableCellSpec[][] = [];
  for (let row = table.firstChild; row; row = row.nextSibling) {
    if (row.name === "TableHeader") header = cellsOf(row);
    else if (row.name === "TableRow") rows.push(cellsOf(row));
  }
  if (!header || header.length === 0) return null;

  // Ragged rows are legal Markdown and would otherwise draw a broken grid.
  const width = header.length;
  for (const row of rows) {
    while (row.length < width) row.push({ text: "", pos: row.at(-1)?.pos ?? table.from });
    row.length = width;
  }
  return { header, rows };
}

function buildDecorations(view: EditorView): MarkdownDecorations {
  const ranges: { from: number; to: number; deco: Decoration }[] = [];
  const images: { from: number; to: number; deco: Decoration }[] = [];
  /* Two decorations may never replace the same character, so every replacing
     range is recorded and the colour pass checks against it. */
  const replaced: { from: number; to: number }[] = [];
  const doc = view.state.doc;
  const resolveImage = view.state.facet(imageResolver);
  const resolveFile = view.state.facet(fileResolver);

  // Lines the caret or a selection currently touches. Only links and tables
  // consult this: everything else is drawn whatever the caret is doing.
  const activeLines = new Set<number>();
  if (view.hasFocus) {
    for (const r of view.state.selection.ranges) {
      const first = doc.lineAt(r.from).number;
      const last = doc.lineAt(r.to).number;
      for (let n = first; n <= last; n++) activeLines.add(n);
    }
  }
  /** Swallow the blank that separates a marker from the words it introduces. */
  const withTrailingSpace = (to: number) => {
    let end = to;
    while (end < doc.length && doc.sliceString(end, end + 1) === " ") end++;
    return end;
  };

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        const source = doc.sliceString(node.from, node.to);

        /* A table is drawn by the state field below, not here: a block-level
           replacement is not something a view plugin is allowed to produce. Its
           rows are skipped so nothing decorates the source underneath it. */
        if (node.name === "Table") return false;

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
            replaced.push({ from: node.from, to: node.to });
            return false;
          }
        }

        if (node.name === "Link") {
          // An attachment is a stored object, never prose: revealing its source
          // would show a storage id, so the card stands whatever the caret does.
          const attachment = markdownAttachment(source);
          if (attachment) {
            const deco = Decoration.replace({
              widget: new AttachmentWidget(
                attachment.label,
                attachment.objectId,
                node.from,
                node.to,
                resolveFile,
              ),
            });
            ranges.push({ from: node.from, to: node.to, deco });
            images.push({ from: node.from, to: node.to, deco });
            replaced.push({ from: node.from, to: node.to });
            return false;
          }
        }

        const onActiveLine = activeLines.has(doc.lineAt(node.from).number);

        if (node.name === "Link" && !onActiveLine) {
          const link = markdownLink(source);
          if (link) {
            ranges.push({
              from: node.from,
              to: node.to,
              deco: Decoration.replace({ widget: new LinkWidget(link.label, link.url) }),
            });
            replaced.push({ from: node.from, to: node.to });
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
            replaced.push({ from: node.from, to: node.to });
            return false;
          }
        }

        // The brackets and parentheses of a link the caret is standing in.
        if (
          node.name === "LinkMark" ||
          (node.name === "URL" && node.node.parent?.name === "Link")
        ) {
          if (!onActiveLine && node.to > node.from) {
            ranges.push({ from: node.from, to: node.to, deco: hideMark });
            replaced.push({ from: node.from, to: node.to });
          } else if (node.to > node.from) {
            ranges.push({ from: node.from, to: node.to, deco: dimMark });
          }
          return;
        }

        /* ── Blocks that take the whole line ──────────────────────────────── */
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

        if (node.name === "Blockquote") {
          const first = doc.lineAt(node.from).number;
          const last = doc.lineAt(node.to).number;
          for (let n = first; n <= last; n++) {
            const line = doc.line(n);
            ranges.push({
              from: line.from,
              to: line.from,
              deco: Decoration.line({ class: "cm-md-quote-line" }),
            });
          }
          return;
        }

        if (node.name === "ListItem") {
          const line = doc.lineAt(node.from);
          const ordered = node.node.parent?.name === "OrderedList";
          const task = Boolean(node.node.getChild("Task"));
          ranges.push({
            from: line.from,
            to: line.from,
            deco: Decoration.line({
              class: `cm-md-item${ordered ? " is-ordered" : ""}${task ? " is-task" : ""}`,
            }),
          });
          return;
        }

        if (node.name === "ListMark") {
          const item = node.node.parent;
          const ordered = item?.parent?.name === "OrderedList";
          const task = Boolean(item?.getChild("Task"));
          const end = withTrailingSpace(node.to);
          if (task) {
            // The checkbox is the marker; the dash in front of it is not.
            ranges.push({ from: node.from, to: end, deco: hideMark });
            replaced.push({ from: node.from, to: end });
          } else if (ordered) {
            // A number carries meaning, so it is styled rather than replaced.
            ranges.push({ from: node.from, to: node.to, deco: numberMark });
          } else {
            ranges.push({
              from: node.from,
              to: end,
              deco: Decoration.replace({ widget: new BulletWidget() }),
            });
            replaced.push({ from: node.from, to: end });
          }
          return;
        }

        if (node.name === "TaskMarker") {
          const end = withTrailingSpace(node.to);
          const checked = /[xX]/.test(source.slice(1, 2));
          ranges.push({
            from: node.from,
            to: end,
            deco: Decoration.replace({ widget: new TaskWidget(checked, node.from) }),
          });
          replaced.push({ from: node.from, to: end });
          return;
        }

        if (node.name === "Task") {
          if (/^\[[xX]\]/.test(source)) {
            ranges.push({ from: node.from, to: node.to, deco: doneMark });
          }
          return;
        }

        /* ── Inline markers ───────────────────────────────────────────────── */
        if (HIDDEN_MARKS.has(node.name)) {
          if (node.to === node.from) return;
          const end =
            node.name === "HeaderMark" || node.name === "QuoteMark"
              ? withTrailingSpace(node.to)
              : node.to;
          ranges.push({ from: node.from, to: end, deco: hideMark });
          replaced.push({ from: node.from, to: end });
          return;
        }

        // Inline code loses its backticks; a fenced block keeps its fence, so
        // there is still something on screen saying "this is a code block".
        if (node.name === "CodeMark" && node.node.parent?.name === "InlineCode") {
          if (node.to > node.from) {
            ranges.push({ from: node.from, to: node.to, deco: hideMark });
            replaced.push({ from: node.from, to: node.to });
          }
          return;
        }
        if (node.name === "CodeMark") {
          ranges.push({ from: node.from, to: node.to, deco: dimMark });
          return;
        }

        const cls = INLINE_CLASS[node.name];
        if (cls && node.to > node.from) {
          ranges.push({ from: node.from, to: node.to, deco: Decoration.mark({ class: cls }) });
        }
      },
    });
  }

  /* ── Colour ────────────────────────────────────────────────────────────────
     `==text==` is not part of the Markdown grammar, so there is no syntax node
     to hang this on: the visible lines are scanned directly. The markers are
     always hidden — a colour you asked for should look like a colour, not like
     a sentence with `==purple:` typed in front of it. */
  const collides = (from: number, to: number) =>
    replaced.some((range) => from < range.to && to > range.from);

  for (const { from, to } of view.visibleRanges) {
    const firstLine = doc.lineAt(from).number;
    const lastLine = doc.lineAt(to).number;
    for (let n = firstLine; n <= lastLine; n++) {
      const line = doc.line(n);
      if (!line.text.includes("==")) continue;
      COLOR_PATTERN.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = COLOR_PATTERN.exec(line.text)) !== null) {
        const color = match[1] ?? "yellow";
        const start = line.from + match.index;
        const end = start + match[0].length;
        if (collides(start, end)) continue;
        const openTo = start + 2 + (match[1] ? match[1].length + 1 : 0);
        const closeFrom = end - 2;
        if (closeFrom <= openTo) continue;

        ranges.push({ from: start, to: openTo, deco: hideMark });
        ranges.push({
          from: openTo,
          to: closeFrom,
          deco: Decoration.mark({ class: `cm-md-tint cm-md-tint-${color}` }),
        });
        ranges.push({ from: closeFrom, to: end, deco: hideMark });
      }
    }
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

/* ── Tables live in a state field ────────────────────────────────────────────
   A table is replaced by one block-level widget, and CodeMirror refuses block
   decorations from a view plugin — a plugin is recomputed from the viewport, and
   a decoration that changes line heights cannot depend on which lines happen to
   be measured. So tables are computed from the document instead: every
   top-level Table node becomes a grid unless the selection is inside it, in
   which case its Markdown stands so it can be edited. */
function buildTables(state: EditorState): DecorationSet {
  const ranges: { from: number; to: number; deco: Decoration }[] = [];
  const selection = state.selection.main;

  for (let node = syntaxTree(state).topNode.firstChild; node; node = node.nextSibling) {
    if (node.name !== "Table") continue;
    if (selection.from <= node.to && selection.to >= node.from) continue;
    const spec = readTable(state, node);
    if (!spec) continue;
    ranges.push({
      from: node.from,
      to: node.to,
      deco: Decoration.replace({
        widget: new TableWidget(spec, state.doc.sliceString(node.from, node.to)),
        block: true,
      }),
    });
  }

  return Decoration.set(
    ranges.map((r) => r.deco.range(r.from, r.to)),
    true,
  );
}

const tableField = StateField.define<DecorationSet>({
  create: (state) => buildTables(state),
  update(value, transaction) {
    if (!transaction.docChanged && !transaction.selection) return value;
    return buildTables(transaction.state);
  },
  provide: (field) => EditorView.decorations.from(field),
});

/* An arrow key steps over a picture or a table, and one backspace deletes it.
   The storage reference (or a legacy base64 payload) is never exposed character
   by character. */
const atomicImages = EditorView.atomicRanges.of(
  (view) => view.plugin(richMarkdown)?.images ?? Decoration.none,
);

const atomicTables = EditorView.atomicRanges.of((view) => view.state.field(tableField));

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

export const TEXT_COLORS = ["yellow", "purple", "pink", "orange", "mint", "blue"] as const;
export type TextColor = (typeof TEXT_COLORS)[number];

export type FormatAction =
  | "bold"
  | "italic"
  | "strike"
  | "code"
  | "body"
  | "heading-1"
  | "heading-2"
  | "heading-3"
  | "checklist"
  | "bullet-list"
  | "ordered-list"
  | "quote"
  | "link"
  | "divider"
  | "table-2"
  | "table-3"
  | "table-4"
  | `color-${TextColor}`
  | "color-clear";

export interface MarkdownEditorHandle {
  format: (action: FormatAction) => void;
  getSelectedText: () => string;
  insertLink: (label: string, url: string) => void;
  insertText: (text: string) => void;
  insertImage: (src: string, alt: string) => void;
  insertAttachment: (label: string, reference: string) => void;
  setSearch: (query: string) => SearchStatus;
  findNext: () => SearchStatus;
  findPrevious: () => SearchStatus;
  closeSearch: () => void;
  focus: () => void;
}

export interface SearchStatus {
  current: number;
  total: number;
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
  resolveFile?: ImageResolver;
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

function searchStatus(view: EditorView, query: string): SearchStatus {
  if (!query) return { current: 0, total: 0 };
  const matches = [
    ...new SearchCursor(view.state.doc, query, 0, view.state.doc.length, (text) =>
      text.toLocaleLowerCase(),
    ),
  ];
  const selection = view.state.selection.main;
  const current = matches.findIndex(
    (match) => match.from === selection.from && match.to === selection.to,
  );
  return { current: current >= 0 ? current + 1 : 0, total: matches.length };
}

/**
 * Puts `text` in the document as a block of its own.
 *
 * The old code inserted a table straight at the caret, which is how a table
 * ended up welded to the end of a sentence. A block needs a blank line in front
 * of it and a paragraph behind it to be a block at all, and how many newlines
 * that takes depends on what is already there.
 */
function insertBlock(editor: EditorView, text: string, selectFrom = 0, selectTo = 0): void {
  const { from, to } = editor.state.selection.main;
  const doc = editor.state.doc;
  const before = doc.sliceString(0, from);
  const after = doc.sliceString(to, doc.length);

  let lead = "";
  if (from > 0) {
    if (before.endsWith("\n\n")) lead = "";
    else if (before.endsWith("\n")) lead = "\n";
    else lead = "\n\n";
  }
  const trail = after.startsWith("\n\n") ? "" : after.startsWith("\n") ? "\n" : "\n\n";

  const insert = `${lead}${text}${trail}`;
  const anchor = from + lead.length + selectFrom;
  editor.dispatch({
    changes: { from, to, insert },
    selection: { anchor, head: from + lead.length + selectTo },
    scrollIntoView: true,
  });
  editor.focus();
}

function insertImage(editor: EditorView, src: string, alt: string): void {
  insertBlock(editor, `![${alt}](${src})`);
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

const COLOR_ACTION = /^color-(.+)$/;

/** `**` around the selection, or off again when it is already there. */
function toggleWrap(editor: EditorView, before: string, after: string, fallback: string): void {
  const { from, to } = editor.state.selection.main;
  const doc = editor.state.doc;
  const selected = doc.sliceString(from, to);

  // Already wrapped, either inside the selection or immediately around it.
  if (selected.length >= before.length + after.length) {
    if (selected.startsWith(before) && selected.endsWith(after)) {
      const inner = selected.slice(before.length, selected.length - after.length);
      editor.dispatch({
        changes: { from, to, insert: inner },
        selection: { anchor: from, head: from + inner.length },
        scrollIntoView: true,
      });
      editor.focus();
      return;
    }
  }
  const outerFrom = Math.max(0, from - before.length);
  const outerTo = Math.min(doc.length, to + after.length);
  if (
    doc.sliceString(outerFrom, from) === before &&
    doc.sliceString(to, outerTo) === after &&
    selected.length > 0
  ) {
    editor.dispatch({
      changes: { from: outerFrom, to: outerTo, insert: selected },
      selection: { anchor: outerFrom, head: outerFrom + selected.length },
      scrollIntoView: true,
    });
    editor.focus();
    return;
  }

  const content = selected || fallback;
  replaceSelection(
    editor,
    `${before}${content}${after}`,
    before.length,
    before.length + content.length,
  );
}

function stripColor(text: string): string {
  COLOR_STRIP.lastIndex = 0;
  return text.replace(COLOR_STRIP, "$1");
}

/** Strips every colour marker found inside the selection. */
function clearColor(editor: EditorView): void {
  const { from, to } = editor.state.selection.main;
  if (from === to) return;
  const selected = editor.state.doc.sliceString(from, to);
  const cleaned = stripColor(selected);
  if (cleaned === selected) return;
  editor.dispatch({
    changes: { from, to, insert: cleaned },
    selection: { anchor: from, head: from + cleaned.length },
    scrollIntoView: true,
  });
  editor.focus();
}

/**
 * Colours the selection.
 *
 * The marker syntax cannot cross a newline — nothing in Markdown's inline
 * grammar can — so a selection spanning paragraphs is coloured a line at a
 * time. The old code wrapped the whole span in one pair of markers, which
 * matched nothing when it was read back: the markers stayed on screen as text
 * and the "colour" never arrived. Block markers are stepped over too, so
 * colouring a heading colours the heading rather than dismantling it.
 */
function applyColor(editor: EditorView, color: TextColor): void {
  const { from, to } = editor.state.selection.main;
  if (from === to) return;
  const opening = color === "yellow" ? "==" : `==${color}:`;
  const selected = editor.state.doc.sliceString(from, to);

  const coloured = stripColor(selected)
    .split("\n")
    .map((line) => {
      const mark = ANY_BLOCK_MARK.exec(line)?.[0] ?? "";
      const rest = line.slice(mark.length);
      const body = rest.trim();
      if (!body) return line;
      const lead = rest.slice(0, rest.length - rest.trimStart().length);
      const tail = rest.slice(rest.trimEnd().length);
      return `${mark}${lead}${opening}${body}==${tail}`;
    })
    .join("\n");

  if (coloured === selected) return;
  editor.dispatch({
    changes: { from, to, insert: coloured },
    selection: { anchor: from, head: from + coloured.length },
    scrollIntoView: true,
  });
  editor.focus();
}

const BLOCK_PREFIX: Record<string, string> = {
  "bullet-list": "- ",
  "ordered-list": "1. ",
  checklist: "- [ ] ",
  quote: "> ",
  "heading-1": "# ",
  "heading-2": "## ",
  "heading-3": "### ",
};

/** Every list, quote and heading marker a line can already be carrying. */
const ANY_BLOCK_MARK = /^(\s*)(?:#{1,6}\s+|>\s?|[-*+]\s\[[ xX]\]\s|[-*+]\s|\d+[.)]\s)?/;

function table(columns: number): string {
  const header = Array.from({ length: columns }, (_, i) => ` Column ${i + 1} `).join("|");
  const rule = Array.from({ length: columns }, () => " --- ").join("|");
  const row = Array.from({ length: columns }, () => " Value ").join("|");
  return `|${header}|\n|${rule}|\n|${row}|\n|${row}|`;
}

/**
 * Applies a block marker to the lines the selection covers.
 *
 * With nothing selected it converts the line the caret is on. The old rule was
 * the opposite — an empty selection opened a *new* line below — which is why
 * choosing Subheading or Quote appeared to do nothing at all to the paragraph
 * that was obviously being pointed at. Choosing the marker a line already
 * carries takes it off again, so every entry in the menu is a toggle.
 */
function applyBlock(editor: EditorView, action: FormatAction): void {
  const prefix = BLOCK_PREFIX[action] ?? "";
  const selection = editor.state.selection.main;
  const doc = editor.state.doc;
  const firstLine = doc.lineAt(selection.from);
  const lastLine = doc.lineAt(selection.to);

  const lines: string[] = [];
  for (let n = firstLine.number; n <= lastLine.number; n++) lines.push(doc.line(n).text);

  const written = lines.filter((line) => line.trim() !== "");
  const carries = (line: string) => {
    const body = line.trimStart();
    if (action === "ordered-list") return /^\d+[.)]\s/.test(body);
    if (action === "checklist") return /^[-*+]\s\[[ xX]\]\s/.test(body);
    if (action === "bullet-list") return /^[-*+]\s(?!\[[ xX]\]\s)/.test(body);
    if (action === "quote") return body.startsWith(">");
    return body.startsWith(prefix);
  };

  // "Body" only ever removes; every other marker toggles.
  const strip = action === "body" || (written.length > 0 && written.every(carries));

  let counter = 0;
  const transformed = lines
    .map((line) => {
      const existing = ANY_BLOCK_MARK.exec(line)?.[0] ?? "";
      const indent = /^\s*/.exec(line)?.[0] ?? "";
      const body = line.slice(existing.length);
      if (strip) return `${indent}${body}`;
      if (line.trim() === "" && written.length > 0) return line;
      if (action === "ordered-list") {
        counter += 1;
        return `${indent}${counter}. ${body}`;
      }
      return `${indent}${prefix}${body}`;
    })
    .join("\n");

  if (transformed === lines.join("\n")) return;

  /* Keep the caret over the same word. Only the first line's marker can move
     it, and only by the difference between what was there and what is now. */
  const oldMark = (ANY_BLOCK_MARK.exec(lines[0])?.[0] ?? "").length;
  const indent = (/^\s*/.exec(lines[0])?.[0] ?? "").length;
  const newMark = strip ? indent : indent + (action === "ordered-list" ? 3 : prefix.length);
  const shift = newMark - oldMark;
  const to = firstLine.from + transformed.length;

  editor.dispatch({
    changes: { from: firstLine.from, to: lastLine.to, insert: transformed },
    selection: selection.empty
      ? { anchor: Math.max(firstLine.from, Math.min(to, selection.from + shift)) }
      : {
          anchor: firstLine.from,
          head: to,
        },
    scrollIntoView: true,
  });
  editor.focus();
}

function formatSelection(editor: EditorView, action: FormatAction): void {
  const selected = editor.state.doc.sliceString(
    editor.state.selection.main.from,
    editor.state.selection.main.to,
  );

  if (action === "bold") return toggleWrap(editor, "**", "**", "bold text");
  if (action === "italic") return toggleWrap(editor, "_", "_", "italic text");
  if (action === "strike") return toggleWrap(editor, "~~", "~~", "strikethrough");
  if (action === "code") return toggleWrap(editor, "`", "`", "code");
  if (action === "color-clear") return clearColor(editor);

  const color = COLOR_ACTION.exec(action)?.[1] as TextColor | undefined;
  if (color) return applyColor(editor, color);

  if (action === "link") {
    const label = selected || "link text";
    const insert = `[${label}](https://)`;
    const urlStart = label.length + 3;
    return replaceSelection(editor, insert, urlStart, urlStart + 8);
  }
  if (action === "divider") return insertBlock(editor, "---");
  if (action === "table-2") return insertBlock(editor, table(2), 2, 10);
  if (action === "table-3") return insertBlock(editor, table(3), 2, 10);
  if (action === "table-4") return insertBlock(editor, table(4), 2, 10);

  applyBlock(editor, action);
}

/* ── Leaving a quote ─────────────────────────────────────────────────────────
   Return on an empty quoted line ends the quote.

   CodeMirror's own rule needs two of them, because it looks for a pair of
   aligned empty quoted lines before it will dedent. That was survivable while
   the `>` was on screen; with the marker drawn as a rule down the margin and
   nothing else, a writer who pressed Return twice and carried on typing had no
   way to know their next three paragraphs were still inside the quotation.
   Lists keep CodeMirror's behaviour, which already ends on one empty item and
   understands nesting. ────────────────────────────────────────────────────── */
const EMPTY_QUOTE_LINE = /^\s*>[\s>]*$/;

function endQuoteOnEmptyLine(view: EditorView): boolean {
  const range = view.state.selection.main;
  if (!range.empty) return false;
  const line = view.state.doc.lineAt(range.head);
  if (!EMPTY_QUOTE_LINE.test(line.text)) return false;
  view.dispatch({
    changes: { from: line.from, to: line.to, insert: "" },
    selection: { anchor: line.from },
    scrollIntoView: true,
  });
  return true;
}

export const MarkdownEditor = forwardRef<MarkdownEditorHandle, Props>(function MarkdownEditor(
  {
    value,
    readOnly,
    placeholder,
    docKey,
    revision = 0,
    onChange,
    onPasteImage,
    resolveImage,
    resolveFile,
  },
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
  const activeSearch = useRef("");

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
    insertAttachment(label, reference) {
      if (readOnly || !view.current) return;
      const clean = label.replaceAll("[", "").replaceAll("]", "").trim() || "Attachment";
      insertBlock(view.current, `[${clean}](${reference})`);
    },
    setSearch(query) {
      const editor = view.current;
      if (!editor) return { current: 0, total: 0 };
      activeSearch.current = query;
      editor.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: query })) });
      if (query) findNext(editor);
      return searchStatus(editor, query);
    },
    findNext() {
      const editor = view.current;
      if (!editor) return { current: 0, total: 0 };
      findNext(editor);
      return searchStatus(editor, activeSearch.current);
    },
    findPrevious() {
      const editor = view.current;
      if (!editor) return { current: 0, total: 0 };
      findPrevious(editor);
      return searchStatus(editor, activeSearch.current);
    },
    closeSearch() {
      const editor = view.current;
      if (!editor) return;
      activeSearch.current = "";
      editor.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: "" })) });
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
          search({ top: true }),
          EditorView.lineWrapping,
          markdown({ base: markdownLanguage }),
          imageResolver.of(resolveImage),
          fileResolver.of(resolveFile),
          richMarkdown,
          tableField,
          atomicImages,
          atomicTables,
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
            { key: "Enter", run: endQuoteOnEmptyLine },
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
      <div ref={host} lang="it" className="h-full" />
      {preview && <ImageLightbox preview={preview} onClose={() => setPreview(null)} />}
    </>
  );
});
