import { Extension, mergeAttributes, Node, type JSONContent } from "@tiptap/core";
import DragHandle from "@tiptap/extension-drag-handle-react";
import { FindAndReplace } from "@tiptap/extension-find-and-replace";
import Placeholder from "@tiptap/extension-placeholder";
import Typography from "@tiptap/extension-typography";
import Suggestion, { type SuggestionProps } from "@tiptap/suggestion";
import { NodeSelection, Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import {
  EditorContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditor,
  type NodeViewProps,
} from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import {
  Check,
  Download,
  Eraser,
  ExternalLink,
  GripVertical,
  Highlighter,
  Lock,
  MessageSquarePlus,
  Pencil,
  Trash2,
  Undo2,
} from "lucide-react";
import { createPortal } from "react-dom";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  BASE_EXTENSIONS,
  DRAWING_BOX,
  DRAWING_INKS,
  Drawing,
  PrivateFile,
  PrivateImage,
  TEXT_COLOR_VALUE,
  WRITE_LOCK_MARK,
  type DrawingStroke,
  type TextColor,
  drawingStrokes,
  drawingSurface,
  straightenStroke,
  strokePoints,
  richTextToPlainText,
} from "@/features/editor/lib/content";
import { attachmentExtension } from "@/features/editor/lib/attachments";
import { takeAutocorrection } from "@/features/editor/lib/autocorrect";
import { commentQuotes } from "@/features/editor/lib/commentAnchors";
import { BODY_FRAGMENT } from "@/features/editor/lib/ydoc";
import { platform } from "@/platform";
import type { HocuspocusProvider } from "@hocuspocus/provider";
import { ySyncPluginKey } from "y-prosemirror";
import type * as Y from "yjs";

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
  | "table-delete-column"
  | "table-delete-row"
  | "table-delete"
  | `color-${TextColor}`
  | "color-clear"
  | "drawing"
  | "drawing-page";

export interface SearchStatus {
  current: number;
  total: number;
}

export interface RichTextEditorHandle {
  format: (action: FormatAction) => void;
  getSelectedText: () => string;
  replaceSelectedText: (text: string) => void;
  insertLink: (label: string, url: string) => void;
  insertText: (text: string) => void;
  insertImage: (objectId: string, alt: string) => void;
  insertAttachment: (label: string, objectId: string) => void;
  /** Mark the current selection as a commented passage and hand back its
   *  thread id, or `null` when there is nothing selected to comment on. */
  commentSelection: (threadId: string) => { threadId: string; quote: string } | null;
  /** Put the caret in a commented passage, and scroll it into view. */
  revealComment: (threadId: string) => boolean;
  /** The passage each open thread is attached to, read from the live document
   *  in one pass — a comment without the words it is about is a note nobody
   *  can place. */
  commentQuotes: () => Map<string, string>;
  /** Collapse a passage selection when the comments UI no longer needs to
   *  point at it. The comment mark remains; only the editor selection goes. */
  clearCommentSelection: () => void;
  /** Keep the anchor in the shared document so its quote remains available,
   *  while letting resolved passages return to ordinary text visually. */
  setCommentResolved: (threadId: string, resolved: boolean) => void;
  /** Take the anchor away — used when a thread is deleted, so no passage is
   *  left underlined with nothing behind it. */
  removeComment: (threadId: string) => void;
  setSearch: (query: string) => SearchStatus;
  findNext: () => SearchStatus;
  findPrevious: () => SearchStatus;
  closeSearch: () => void;
  focus: () => void;
}

interface Props {
  value: JSONContent;
  readOnly: boolean;
  placeholder: string;
  revision?: number;
  onChange: (document: JSONContent, plainText: string) => void;
  /** Raised on a document change this browser made, never on one that arrived
   *  from the other reader. Yjs is the writer; this is only who is writing. */
  onLocalEdit?: () => void;
  onPasteImage?: (file: File) => Promise<{ objectId: string; alt: string } | null>;
  onOpenLink: () => void;
  /** Every note `[[` can reach, and what to do when one is clicked. Absent in
   *  the preview and anywhere else without an archive behind it. */
  notes?: { id: string; title: string }[];
  onOpenNote?: (noteId: string) => void;
  /** Clicking the underlined passage opens the conversation about it. */
  onOpenComment?: (threadId: string) => void;
  /** Open a comment on whatever is selected. Absent when the note cannot be
   *  commented on — Trash, or a reader who may not write. */
  onComment?: () => void;
  /** The account a passage lock is stamped with, and the one it is judged
   *  against. Null where locking is not on offer — Trash, the preview, a note
   *  somebody else has taken back whole. */
  writeLockOwner?: string | null;
  mobile?: boolean;
  resolveImage: (objectId: string) => Promise<Blob>;
  resolveFile: (objectId: string) => Promise<Blob>;
  collaboration?: { document: Y.Doc; provider: HocuspocusProvider | null } | null;
}

interface ImagePreview {
  src: string;
  alt: string;
}

type Resolver = (objectId: string) => Promise<Blob>;

interface PrivateImageOptions {
  resolve: Resolver;
  open: (src: string, alt: string) => void;
}

interface PrivateFileOptions {
  resolve: Resolver;
}

interface SlashCommand {
  label: string;
  detail?: string;
  action: FormatAction | "link";
}

const SLASH_COMMANDS: SlashCommand[] = [
  { label: "Heading 1", detail: "Large section title", action: "heading-1" },
  { label: "Heading 2", detail: "Section heading", action: "heading-2" },
  { label: "Heading 3", detail: "Small heading", action: "heading-3" },
  { label: "Body", detail: "Plain paragraph", action: "body" },
  { label: "Bullet list", action: "bullet-list" },
  { label: "Numbered list", action: "ordered-list" },
  { label: "Checklist", action: "checklist" },
  { label: "Quote", action: "quote" },
  { label: "Divider", action: "divider" },
  { label: "Table · 2 columns", action: "table-2" },
  { label: "Table · 3 columns", action: "table-3" },
  { label: "Table · 4 columns", action: "table-4" },
  { label: "Link", action: "link" },
  { label: "Drawing board", detail: "A sheet to sketch on", action: "drawing" },
  { label: "Draw on the page", detail: "Ink on the note itself", action: "drawing-page" },
  ...(["yellow", "purple", "pink", "orange", "mint", "blue"] as TextColor[]).map((color) => ({
    label: `${color[0].toUpperCase()}${color.slice(1)} text`,
    action: `color-${color}` as FormatAction,
  })),
];

function capitalizeSentences(text: string): string {
  return text.replace(/(^\s*[a-zà-ÿ])|([.!?]\s+[a-zà-ÿ])/g, (m) => m.toUpperCase());
}

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
function writeLockGuardExtension(owner: { current: string | null }) {
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

function sentenceCapitalizeExtension() {
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

/** A small, local counterpart to the familiar phone-style correction. It acts
 * only when a word is completed, never rewrites a sentence while its meaning
 * is still changing, and gives the writer the last word after two attempts. */
function autocorrectExtension() {
  return Extension.create({
    name: "autocorrect",
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: new PluginKey("autocorrect"),
          props: {
            handleTextInput(view, from, to, text) {
              if (!/^[\s.,!?;:]$/.test(text)) return false;
              const $from = view.state.doc.resolve(from);
              const before = $from.parent.textBetween(0, $from.parentOffset, " ", " ");
              const match = /([A-Za-z]+)$/.exec(before);
              if (!match) return false;
              const corrected = takeAutocorrection(match[1]);
              if (!corrected) return false;
              view.dispatch(
                view.state.tr.insertText(`${corrected}${text}`, from - match[1].length, to),
              );
              return true;
            },
          },
        }),
      ];
    },
  });
}

/* `[[` opens the archive, the way `/` opens the commands — the same Suggestion
   plugin, the same popover, the same keys. The list of notes is read through a
   ref rather than closed over, so a note written a moment ago is offered
   without the editor being rebuilt: rebuilding it would destroy the ProseMirror
   instance the whole collaborative path exists to mount exactly once. */
function noteLinkExtension(notes: React.RefObject<{ id: string; title: string }[]>, limit = 8) {
  return Extension.create({
    name: "noteLink",
    addProseMirrorPlugins() {
      return [
        Suggestion<{ id: string; title: string }>({
          editor: this.editor,
          /* Its own key. ProseMirror refuses two plugins that share one, and
             `Suggestion` defaults every instance to `suggestion$` — so the
             slash menu and this one cannot both be nameless. */
          pluginKey: new PluginKey("noteLinkSuggestion"),
          char: "[[",
          allowedPrefixes: null,
          items: ({ query }) => {
            const q = query.toLowerCase();
            return notes.current
              .filter((note) => (note.title || "Untitled").toLowerCase().includes(q))
              .slice(0, limit);
          },
          command: ({ editor, range, props }) => {
            const title = props.title || "Untitled";
            editor
              .chain()
              .focus()
              .deleteRange(range)
              .insertContent([
                {
                  type: "text",
                  marks: [{ type: "noteLink", attrs: { noteId: props.id } }],
                  text: title,
                },
                /* A space outside the mark, so the sentence carries on next to
                   the link instead of inside it. `inclusive: false` is what
                   makes the space land outside. */
                { type: "text", text: " " },
              ])
              .run();
          },
          render: () => {
            let element: HTMLDivElement | null = null;
            let selected = 0;
            let props: SuggestionProps<{ id: string; title: string }> | null = null;
            let unmount: (() => void) | undefined;
            const render = () => {
              if (!element || !props) return;
              selected = Math.min(selected, Math.max(0, props.items.length - 1));
              element.replaceChildren(
                ...(props.items.length
                  ? props.items.map((item, index) => {
                      const button = document.createElement("button");
                      button.type = "button";
                      button.className = `menu-row text-ink-2 ${index === selected ? "is-selected" : ""}`;
                      button.textContent = item.title || "Untitled";
                      button.addEventListener("mousedown", (event) => event.preventDefault());
                      button.addEventListener("click", () => props?.command(item));
                      return button;
                    })
                  : [
                      (() => {
                        const empty = document.createElement("p");
                        empty.className = "menu-note";
                        empty.textContent = "No note by that name.";
                        return empty;
                      })(),
                    ]),
              );
            };
            return {
              onStart(next) {
                props = next;
                selected = 0;
                element = document.createElement("div");
                element.className = "popover menu-popover slash-menu p-1.5";
                element.setAttribute("role", "menu");
                unmount = next.mount(element);
                render();
              },
              onUpdate(next) {
                props = next;
                render();
              },
              onKeyDown({ event }) {
                if (!props || !props.items.length) return event.key === "Escape";
                if (event.key === "ArrowDown") {
                  selected = (selected + 1) % props.items.length;
                  render();
                  return true;
                }
                if (event.key === "ArrowUp") {
                  selected = (selected - 1 + props.items.length) % props.items.length;
                  render();
                  return true;
                }
                if (event.key === "Enter") {
                  props.command(props.items[selected]);
                  return true;
                }
                return event.key === "Escape";
              },
              onExit() {
                unmount?.();
                element = null;
                props = null;
              },
            };
          },
        }),
      ];
    },
  });
}

function slashMenuExtension(run: (action: SlashCommand["action"]) => void) {
  return Extension.create({
    name: "slashMenu",
    addProseMirrorPlugins() {
      return [
        Suggestion<SlashCommand>({
          editor: this.editor,
          char: "/",
          allowedPrefixes: [" ", ""],
          items: ({ query }) =>
            SLASH_COMMANDS.filter((item) => item.label.toLowerCase().includes(query.toLowerCase())),
          command: ({ editor, range, props }) => {
            editor.chain().focus().deleteRange(range).run();
            run(props.action);
          },
          render: () => {
            let element: HTMLDivElement | null = null;
            let selected = 0;
            let props: SuggestionProps<SlashCommand> | null = null;
            let unmount: (() => void) | undefined;
            const render = () => {
              if (!element || !props) return;
              selected = Math.min(selected, Math.max(0, props.items.length - 1));
              element.replaceChildren(
                ...props.items.map((item, index) => {
                  const button = document.createElement("button");
                  button.type = "button";
                  button.className = `menu-row text-ink-2 ${index === selected ? "is-selected" : ""}`;
                  button.textContent = item.detail ? `${item.label} · ${item.detail}` : item.label;
                  button.addEventListener("mousedown", (event) => event.preventDefault());
                  button.addEventListener("click", () => props?.command(item));
                  return button;
                }),
              );
            };
            return {
              onStart(next) {
                props = next;
                selected = 0;
                element = document.createElement("div");
                element.className = "popover menu-popover slash-menu p-1.5";
                element.setAttribute("role", "menu");
                unmount = next.mount(element);
                render();
              },
              onUpdate(next) {
                props = next;
                render();
              },
              onKeyDown({ event }) {
                if (!props || !props.items.length) return event.key === "Escape";
                if (event.key === "ArrowDown") {
                  selected = (selected + 1) % props.items.length;
                  render();
                  return true;
                }
                if (event.key === "ArrowUp") {
                  selected = (selected - 1 + props.items.length) % props.items.length;
                  render();
                  return true;
                }
                if (event.key === "Enter") {
                  props.command(props.items[selected]);
                  return true;
                }
                return event.key === "Escape";
              },
              onExit() {
                unmount?.();
                element = null;
                props = null;
              },
            };
          },
        }),
      ];
    },
  });
}

function PrivateImageView({
  node,
  extension,
  updateAttributes,
  deleteNode,
  editor,
}: NodeViewProps) {
  const { objectId, alt } = node.attrs as { objectId: string; alt: string };
  const options = extension.options as PrivateImageOptions;
  const resolveImage = options.resolve;
  const [src, setSrc] = useState("");
  const [error, setError] = useState("");
  /* A picture is fetched once, and one failed fetch used to be forever: a
     token that expired mid-session, or a peer whose upload had not landed in
     Storage yet, left a permanent "could not be displayed" in a note whose
     picture was perfectly fine. Bumping this re-runs the effect. */
  const [attempt, setAttempt] = useState(0);

  /* Ink over the picture. A photograph of a page of notes is the thing people
     most want to write on, and the layer is the same one the note itself
     takes — same hand, same box, measured against the picture's width. It is
     put down until it is picked up, so the picture still opens when clicked. */
  const strokes = useMemo(() => drawingStrokes(node.attrs.strokes as string), [node.attrs.strokes]);
  const writeInk = useCallback(
    (next: DrawingStroke[]) => updateAttributes({ strokes: JSON.stringify(next) }),
    [updateAttributes],
  );
  const [pen, setPen] = useState(false);
  const ink = useInk({
    strokes,
    write: writeInk,
    fit: "width",
    editable: editor.isEditable,
  });

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    setSrc("");
    setError("");
    void resolveImage(objectId)
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch((reason: unknown) => {
        if (active)
          setError(reason instanceof Error ? reason.message : "This image could not be displayed");
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectId, resolveImage, attempt]);

  return (
    <NodeViewWrapper className={`rich-media-image ${error ? "is-error" : ""}`}>
      {/* The frame is what the ink lies over, and it holds the picture alone:
          an overlay on the wrapper would reach down over the caption, and the
          caption is not part of the picture. */}
      <span className="rich-media-image-frame" contentEditable={false}>
        {src ? (
          <button
            type="button"
            className="rich-media-image-open"
            onClick={() => options.open(src, alt || "Image")}
          >
            <img src={src} alt={alt || "Image"} draggable={false} />
          </button>
        ) : (
          <span className="rich-media-loading">
            {error || "Loading image…"}
            {error && (
              <button
                type="button"
                className="rich-media-retry"
                onClick={() => setAttempt((count) => count + 1)}
              >
                Try again
              </button>
            )}
          </span>
        )}
        {/* Always mounted, even with nothing on it: the layer measures itself
            to know how tall it is in stroke units, and a layer that appears
            only once the pen is out has nothing to measure until too late. */}
        <svg
          ref={ink.surface}
          className={`rich-media-image-ink ${pen && !ink.erasing ? "is-drawing" : ""} ${
            pen && ink.erasing ? "is-erasing" : ""
          }`}
          viewBox={`0 0 ${ink.box.width} ${ink.box.height}`}
          /* See the page layer below: a surface measured against its width
             must never let its height stretch the ink. */
          preserveAspectRatio="xMinYMin meet"
          onPointerDown={ink.start}
        >
          {ink.inked}
        </svg>
      </span>
      {editor.isEditable && (
        <button
          type="button"
          className={`rich-media-remove is-ink ${pen ? "is-active" : ""}`}
          aria-label={pen ? "Put the pen down" : "Draw on this picture"}
          title={pen ? "Put the pen down" : "Draw on this picture"}
          aria-pressed={pen}
          onClick={() => setPen((on) => !on)}
          contentEditable={false}
        >
          {pen ? <Check size={15} /> : <Pencil size={15} />}
        </button>
      )}
      {editor.isEditable && (
        <button
          type="button"
          className="rich-media-remove"
          aria-label="Remove image"
          title="Remove image"
          onClick={deleteNode}
          contentEditable={false}
        >
          <Trash2 size={15} />
        </button>
      )}
      {editor.isEditable && pen && (
        <span className="rich-media-drawing-tools" contentEditable={false}>
          {ink.tools}
        </span>
      )}
      {alt && alt !== "Image" && <span className="rich-media-caption">{alt}</span>}
    </NodeViewWrapper>
  );
}

function PrivateFileView({ node, extension, deleteNode, editor }: NodeViewProps) {
  const { objectId, label } = node.attrs as { objectId: string; label: string };
  const options = extension.options as PrivateFileOptions;
  const [status, setStatus] = useState("Private attachment · opens in a new tab");
  const [error, setError] = useState(false);

  function resolve() {
    setError(false);
    return options.resolve(objectId).catch((reason: unknown) => {
      setError(true);
      setStatus(reason instanceof Error ? reason.message : "This attachment could not be opened");
      throw reason;
    });
  }

  function open() {
    setStatus("Opening…");
    /* `resolve` is passed rather than awaited: a browser has to claim the new
       tab inside this click, and only the shell knows whether it needs to. */
    void platform()
      .openFile(label, resolve)
      .then((hint) => setStatus(hint ?? "Private attachment · opens in a new tab"))
      .catch(() => undefined);
  }

  function download() {
    setStatus("Preparing download…");
    void resolve()
      .then((blob) => platform().saveFile(label, blob))
      .then(() => setStatus("Private attachment · opens in a new tab"))
      .catch(() => undefined);
  }

  return (
    <NodeViewWrapper className={`rich-media-file ${error ? "is-error" : ""}`}>
      <button type="button" className="rich-media-file-open" onClick={open} contentEditable={false}>
        <span className="rich-media-file-badge">{attachmentExtension(label)}</span>
        <span className="rich-media-file-text">
          <span className="rich-media-file-name">{label}</span>
          <span className="rich-media-file-hint">{status}</span>
        </span>
        <ExternalLink size={15} />
      </button>
      {editor.isEditable && (
        <span className="rich-media-file-actions" contentEditable={false}>
          <button
            type="button"
            className="rich-media-file-action"
            onClick={download}
            aria-label={`Download ${label}`}
          >
            <Download size={15} />
          </button>
          <button
            type="button"
            className="rich-media-file-action is-danger"
            onClick={deleteNode}
            aria-label={`Remove ${label}`}
          >
            <Trash2 size={15} />
          </button>
        </span>
      )}
    </NodeViewWrapper>
  );
}

/* A drawing surface, and what a browser can do that the schema cannot.
 *
 * Two surfaces, one node. A **board** is a sheet of its own, in the flow of
 * the note like a picture. A **page** drawing is the note marked up the way a
 * screenshot is: the strokes lie over the paragraphs and the headings, and the
 * layer is transparent to the pointer until the pen is picked up, so the text
 * underneath stays text.
 *
 * A stroke is gathered in local state while the pointer is down and written to
 * the document once, on release. Writing per pointer event would be a Yjs
 * update per pixel of a gesture, sent to the other member and persisted, for a
 * line nobody has finished drawing yet.
 *
 * The pointer is followed with `window` listeners rather than
 * `setPointerCapture`, for the reason the cover learned the hard way: a
 * captured pointer retargets the click that follows to the capturing element,
 * and every control sitting on this surface would go dead the moment somebody
 * drew on it.
 *
 * ponytail: a page stroke is placed against the width of the column, not
 * against the words under it — so a note read at another width keeps the shape
 * of the drawing and loses which paragraph it was pointing at. Anchoring ink
 * to text means a mark in the document, like `CommentAnchor`, and a drawing
 * that is a mark is a different feature.
 */

/** Asking for the pen again on a note that already has a drawing layer. */
const TAKE_UP_THE_PEN = "napp:take-up-the-pen";

/** Set for the one layer being created right now, and read once by the view
 *  that mounts for it.
 *
 *  The pen is in hand because it was just asked for, and that is a fact about
 *  the moment rather than about the note — which is exactly what the layer's
 *  own mount cannot tell. A view that picked the pen up whenever it mounted
 *  picked it up again on every return to the note, so somebody who came back
 *  to write drew instead. It cannot be an attribute either: an attribute is
 *  the document, and the document is the other member's too. */
let penWanted = false;

/** The ink and the nib outlive the drawing they were chosen on: picking red
 *  once should not have to be done again on the next sketch, on the next
 *  picture, or on the other surface. Module-level because it is a fact about
 *  the hand, not about any document — nothing here is ever written to a note. */
let lastInk: string = DRAWING_INKS[0];
let lastNib = 5;
let lastMarker = false;

/** Three nibs. A slider offers a hundred widths nobody wants to choose
 *  between; these are a fine line, a line, and a marker. */
const DRAWING_NIBS = [3, 6, 13];

/** The highlighter: one wide nib, and the chosen ink with an alpha on the end
 *  so the words underneath are still readable through it. Translucency is a
 *  property of the colour rather than a field of its own, so nothing that
 *  reads a stroke has to learn about highlighters. */
const MARKER_NIB = 30;
const MARKER_ALPHA = "59";

/** How long the pointer has to hold still at the end of a stroke before the
 *  stroke becomes the shape it was aiming at. */
const STRAIGHTEN_AFTER_MS = 450;

/* ── One hand, three surfaces ────────────────────────────────────────────────
   A board, the page itself, and a picture in the note all take the same ink in
   the same way, so they take it from here. What differs is only the box the
   strokes are measured in: a board is always 1000 × 560, and everything else
   measures both axes against its own width — which is what keeps a drawing the
   shape it was drawn as when the column it is read in is narrower.

   A stroke is gathered in local state while the pointer is down and written to
   the document once, on release. Writing per pointer event would be a Yjs
   update per pixel of a gesture, sent to the other member and persisted, for a
   line nobody has finished drawing yet.

   The pointer is followed with `window` listeners rather than
   `setPointerCapture`, for the reason the cover learned the hard way: a
   captured pointer retargets the click that follows to the capturing element,
   and every control sitting on this surface would go dead the moment somebody
   drew on it.

   ponytail: a stroke is placed against the width it was drawn on, not against
   the words under it — so a note read at another width keeps the shape of the
   drawing and loses which paragraph it was pointing at. Anchoring ink to text
   means a mark in the document, like `CommentAnchor`, and a drawing that is a
   mark is a different feature. ──────────────────────────────────────────── */
function useInk({
  strokes,
  write,
  fit,
  editable,
}: {
  strokes: DrawingStroke[];
  write: (next: DrawingStroke[]) => void;
  fit: "board" | "width";
  editable: boolean;
}) {
  const [ink, setInk] = useState<string>(lastInk);
  const [nib, setNib] = useState<number>(lastNib);
  const [marker, setMarker] = useState<boolean>(lastMarker);
  const [erasing, setErasing] = useState(false);
  const surface = useRef<SVGSVGElement>(null);
  /* The line being drawn right now is written straight onto its own element.
     It was a piece of React state, which meant a render of the whole layer for
     every pointer event of a gesture — sixty a second, each one rebuilding
     every stroke already on the surface. Nothing else on the page depends on a
     line nobody has finished, so nothing else needs to hear about it. */
  const livePath = useRef<SVGPathElement>(null);
  const paint = (d: string) => livePath.current?.setAttribute("d", d);
  const path = useRef<string>("");
  const trail = useRef<{ x: number; y: number }[]>([]);
  const snapped = useRef<string | null>(null);
  const live = useRef(strokes);
  live.current = strokes;

  /* Cleared once the committed stroke is on screen, never before it: clearing
     it in the same breath as the write leaves a frame with neither, and a line
     that blinks out at the end of every gesture. */
  useEffect(() => {
    paint("");
  }, [strokes]);

  const width = marker ? MARKER_NIB : nib;
  const laid = marker ? `${ink}${MARKER_ALPHA}` : ink;

  /* What the surface is, in the units the strokes are stored in. A board is
     always the same box; anything measured against its width is as tall as
     whatever it is lying over, which nothing knows until it has been laid
     out. */
  const [aspect, setAspect] = useState(DRAWING_BOX.height / DRAWING_BOX.width);
  useEffect(() => {
    /* The element the layer is stretched over, not the layer: Chrome reports
       no resize at all for an `<svg>` sized entirely by its parent — no
       initial callback either — so a surface that measured itself stayed the
       shape of a board, and the ink landed a little below the hand. The parent
       is an ordinary box and is observed properly. */
    const element = surface.current?.parentElement;
    if (fit === "board" || !element) return;
    const measure = () => {
      const box = element.getBoundingClientRect();
      if (box.width > 0) setAspect(box.height / box.width);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [fit]);
  const box =
    fit === "board"
      ? DRAWING_BOX
      : { width: DRAWING_BOX.width, height: Math.max(1, Math.round(DRAWING_BOX.width * aspect)) };

  const choose = useCallback((colour: string) => {
    lastInk = colour;
    setInk(colour);
    setErasing(false);
  }, []);

  const at = useCallback(
    (event: { clientX: number; clientY: number }) => {
      const rect = surface.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return null;
      const scale = DRAWING_BOX.width / rect.width;
      const x = Math.round((event.clientX - rect.left) * scale);
      const y = Math.round(
        fit === "board"
          ? ((event.clientY - rect.top) / rect.height) * DRAWING_BOX.height
          : (event.clientY - rect.top) * scale,
      );
      return { x, y, at: `${x},${y}` };
    },
    [fit],
  );

  /** The eraser takes whole strokes, not pixels of them. Half a line left
   *  behind is a line somebody has to go back for. */
  const rub = useCallback(
    (point: { x: number; y: number }) => {
      const kept = live.current.filter(
        (stroke) =>
          !strokePoints(stroke.d).some(
            (p) => Math.hypot(p.x - point.x, p.y - point.y) < stroke.width / 2 + 10,
          ),
      );
      if (kept.length !== live.current.length) {
        live.current = kept;
        write(kept);
      }
    },
    [write],
  );

  function start(event: React.PointerEvent) {
    if (!editable || event.button !== 0) return;
    const point = at(event);
    if (!point) return;
    event.preventDefault();

    if (erasing) {
      rub(point);
      const move = (next: PointerEvent) => {
        const step = at(next);
        if (step) rub(step);
      };
      const finish = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", finish);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", finish);
      window.addEventListener("pointercancel", finish);
      return;
    }

    path.current = `M${point.at}`;
    trail.current = [point];
    snapped.current = null;
    paint(path.current);

    /* Hold still at the end of a stroke and it becomes the shape it was aiming
       at. The timer is restarted by every movement, so what it measures is a
       hand that has stopped — and moving away again from a snapped shape takes
       the scrawl back, because the alternative is a shape you cannot refuse. */
    let idle = 0;
    const rearm = () => {
      window.clearTimeout(idle);
      idle = window.setTimeout(() => {
        const shape = straightenStroke(trail.current);
        if (!shape) return;
        snapped.current = shape;
        paint(shape);
      }, STRAIGHTEN_AFTER_MS);
    };
    rearm();

    const move = (next: PointerEvent) => {
      const step = at(next);
      if (!step) return;
      const last = trail.current[trail.current.length - 1];
      if (snapped.current) {
        if (Math.hypot(step.x - last.x, step.y - last.y) < 25) return;
        snapped.current = null;
      }
      trail.current.push(step);
      path.current = `${path.current}L${step.at}`;
      paint(path.current);
      rearm();
    };
    const finish = () => {
      window.clearTimeout(idle);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      /* A tap that never moved is a dot, and a dot is a stroke of one point —
         which draws nothing without a second. Give it one. */
      const committed =
        snapped.current ??
        (path.current.includes("L") ? path.current : `${path.current}L${path.current.slice(1)}`);
      path.current = "";
      trail.current = [];
      snapped.current = null;
      write([...live.current, { d: committed, color: laid, width }]);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  }

  const inked = (
    <>
      {strokes.map((stroke, index) => (
        <path
          key={index}
          d={stroke.d}
          fill="none"
          stroke={stroke.color}
          strokeWidth={stroke.width}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      <path
        ref={livePath}
        d=""
        fill="none"
        stroke={laid}
        strokeWidth={width}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  );

  const custom = !DRAWING_INKS.includes(ink as (typeof DRAWING_INKS)[number]);
  const tools = (
    <>
      {DRAWING_INKS.map((colour) => (
        <button
          key={colour}
          type="button"
          className={`drawing-ink ${!erasing && colour === ink ? "is-chosen" : ""}`}
          style={{ background: colour }}
          aria-label={`Draw in ${colour}`}
          aria-pressed={!erasing && colour === ink}
          onClick={() => choose(colour)}
        />
      ))}
      {/* Every other colour, from the one picker the machine already has. The
          input itself is the whole control and is invisible: styling a
          `color` input means three vendor pseudo-elements and a focus ring
          nobody asked for, and one of them was drawing a blue halo round the
          swatch. A label with the input inside it is the same click. */}
      <label
        className={`drawing-ink is-any ${custom && !erasing ? "is-chosen" : ""}`}
        style={custom ? { background: ink } : undefined}
        title="Any colour"
      >
        <input
          type="color"
          value={ink}
          aria-label="Draw in any colour"
          onChange={(event) => choose(event.target.value)}
        />
      </label>

      <span className="drawing-tools-rule" />

      {DRAWING_NIBS.map((size) => (
        <button
          key={size}
          type="button"
          className={`drawing-nib ${!erasing && !marker && size === nib ? "is-chosen" : ""}`}
          aria-label={`Nib ${size}`}
          aria-pressed={!erasing && !marker && size === nib}
          onClick={() => {
            lastNib = size;
            lastMarker = false;
            setNib(size);
            setMarker(false);
            setErasing(false);
          }}
        >
          <span style={{ width: size + 2, height: size + 2 }} />
        </button>
      ))}
      <button
        type="button"
        className={`rich-media-file-action ${!erasing && marker ? "is-active" : ""}`}
        aria-label="Highlighter"
        aria-pressed={!erasing && marker}
        title="Highlighter"
        onClick={() => {
          lastMarker = !marker;
          setMarker((on) => !on);
          setErasing(false);
        }}
      >
        <Highlighter size={15} />
      </button>
      <button
        type="button"
        className={`rich-media-file-action ${erasing ? "is-active" : ""}`}
        aria-label="Erase strokes"
        aria-pressed={erasing}
        title="Erase strokes"
        onClick={() => setErasing((on) => !on)}
      >
        <Eraser size={15} />
      </button>
      <button
        type="button"
        className="rich-media-file-action"
        aria-label="Undo the last stroke"
        title="Undo the last stroke"
        disabled={strokes.length === 0}
        onClick={() => write(strokes.slice(0, -1))}
      >
        <Undo2 size={15} />
      </button>
    </>
  );

  return { surface, box, start, inked, tools, erasing };
}

function DrawingView({ node, updateAttributes, deleteNode, editor }: NodeViewProps) {
  const strokes = useMemo(() => drawingStrokes(node.attrs.strokes as string), [node.attrs.strokes]);
  const onPage = drawingSurface(node.attrs.surface) === "page";
  /* The pen is in hand only if this layer is the one that was just asked for.
     Coming back to a note is coming back to read or to write it; drawing on it
     again is a thing you ask for, from the ⋯ palette or from the pen in the
     corner. A board has no pen state at all: it is a sheet, and there is
     nothing on it to protect from the pointer. */
  const [pen, setPen] = useState(() => {
    if (!onPage || !penWanted) return false;
    penWanted = false;
    return true;
  });
  useEffect(() => {
    if (!onPage) return;
    const take = () => setPen(true);
    window.addEventListener(TAKE_UP_THE_PEN, take);
    return () => window.removeEventListener(TAKE_UP_THE_PEN, take);
  }, [onPage]);

  const write = useCallback(
    (next: DrawingStroke[]) => updateAttributes({ strokes: JSON.stringify(next) }),
    [updateAttributes],
  );
  const { surface, box, start, inked, tools, erasing } = useInk({
    strokes,
    write,
    fit: onPage ? "width" : "board",
    editable: editor.isEditable,
  });

  const remove = (
    <button
      type="button"
      className="rich-media-file-action is-danger"
      aria-label={onPage ? "Remove the drawing layer" : "Remove drawing"}
      title={onPage ? "Remove the drawing layer" : "Remove drawing"}
      onClick={deleteNode}
    >
      <Trash2 size={15} />
    </button>
  );

  if (onPage) {
    return (
      <NodeViewWrapper className="drawing-overlay" contentEditable={false}>
        <svg
          ref={surface}
          className={`drawing-overlay-surface ${pen && !erasing ? "is-drawing" : ""} ${
            pen && erasing ? "is-erasing" : ""
          }`}
          viewBox={`0 0 ${box.width} ${box.height}`}
          /* **`meet`, never `none`.** A page measures both axes against its
             width — that is the whole of the stored model — and `none` throws
             that away: it stretches the viewBox to whatever height the element
             happens to have, so the ink is only in the right place while the
             measured height is exactly right.
             It is not. The height is read by a `ResizeObserver` and the note
             it lies over grows every time somebody presses Return, so there is
             always a moment where a taller column is being filled by a shorter
             viewBox — and in that moment every stroke slides down the page and
             stretches, which is how ink drawn beside a paragraph ends up lying
             across it.
             `meet` scales by the smaller of the two ratios. When the measured
             height lags behind — which is the direction it always lags, since
             notes grow downwards — that is the width, which is the axis the
             strokes were stored against in the first place. The ink stays
             where it was put and keeps its shape, and the observer's answer
             only decides how far down the surface takes a pen. */
          preserveAspectRatio="xMinYMin meet"
          onPointerDown={start}
        >
          {inked}
        </svg>
        {editor.isEditable && (
          <span className={`drawing-overlay-tools ${pen ? "" : "is-put-away"}`}>
            {pen ? (
              <>
                {tools}
                {remove}
                <span className="drawing-tools-rule" />
                <button
                  type="button"
                  className="rich-media-file-action"
                  aria-label="Put the pen down"
                  title="Put the pen down"
                  onClick={() => setPen(false)}
                >
                  <Check size={15} />
                </button>
              </>
            ) : (
              <button
                type="button"
                className="rich-media-file-action"
                aria-label="Draw on the page"
                title="Draw on the page"
                onClick={() => setPen(true)}
              >
                <Pencil size={15} />
              </button>
            )}
          </span>
        )}
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper className="rich-media-drawing">
      <span className="rich-media-drawing-sheet" contentEditable={false}>
        <svg
          ref={surface}
          className={`rich-media-drawing-surface ${erasing ? "is-erasing" : ""}`}
          viewBox={`0 0 ${box.width} ${box.height}`}
          preserveAspectRatio="none"
          onPointerDown={start}
        >
          {inked}
        </svg>
      </span>
      {editor.isEditable && (
        <span className="rich-media-drawing-tools" contentEditable={false}>
          {tools}
          {remove}
        </span>
      )}
    </NodeViewWrapper>
  );
}

/* The schema lives in `content.ts`, where the collaboration server can read it
   without React. What is added here is only what a browser can do with it. */
function privateImageExtension(resolve: Resolver, open: PrivateImageOptions["open"]) {
  return PrivateImage.extend<PrivateImageOptions>({
    addOptions: () => ({ resolve, open }),
    addNodeView() {
      return ReactNodeViewRenderer(PrivateImageView);
    },
  });
}

function drawingExtension() {
  return Drawing.extend({
    addNodeView() {
      return ReactNodeViewRenderer(DrawingView);
    },
  });
}

function privateFileExtension(resolve: Resolver) {
  return PrivateFile.extend<PrivateFileOptions>({
    addOptions: () => ({ resolve }),
    addNodeView() {
      return ReactNodeViewRenderer(PrivateFileView);
    },
  });
}

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
        ×
      </button>
    </div>,
    document.body,
  );
}

function paragraphs(text: string): JSONContent[] {
  return text.split(/\n{2,}/).map((paragraph) => ({
    type: "paragraph",
    content: paragraph
      ? paragraph
          .split("\n")
          .flatMap((line, index) => [
            ...(index ? [{ type: "hardBreak" } satisfies JSONContent] : []),
            { type: "text", text: line } satisfies JSONContent,
          ])
      : undefined,
  }));
}

function searchStatus(editor: NonNullable<ReturnType<typeof useEditor>>): SearchStatus {
  const state = editor.storage.findAndReplace;
  return {
    current: state.currentIndex === null ? 0 : state.currentIndex + 1,
    total: state.results.length,
  };
}

export const RichTextEditor = forwardRef<RichTextEditorHandle, Props>(function RichTextEditor(
  {
    value,
    readOnly,
    placeholder,
    revision = 0,
    onChange,
    onLocalEdit,
    onPasteImage,
    onOpenLink,
    onComment,
    writeLockOwner = null,
    notes,
    onOpenNote,
    onOpenComment,
    mobile = false,
    resolveImage,
    resolveFile,
    collaboration = null,
  },
  ref,
) {
  const [preview, setPreview] = useState<ImagePreview | null>(null);
  const onChangeRef = useRef(onChange);
  const onLocalEditRef = useRef(onLocalEdit);
  const onPasteImageRef = useRef(onPasteImage);
  const appliedRevision = useRef(revision);
  const formatRef = useRef<(action: FormatAction) => void>(() => undefined);
  onChangeRef.current = onChange;
  onLocalEditRef.current = onLocalEdit;
  onPasteImageRef.current = onPasteImage;

  const mediaExtensions = useMemo(
    () => [
      privateImageExtension(resolveImage, (src, alt) => setPreview({ src, alt })),
      privateFileExtension(resolveFile),
      drawingExtension(),
    ],
    [resolveFile, resolveImage],
  );

  const slashMenu = useMemo(
    () =>
      slashMenuExtension((action) => {
        if (action === "link") onOpenLink();
        else formatRef.current(action);
      }),
    [onOpenLink],
  );

  /* Through a ref, never a dependency: the extension list is built once and a
     note added to the archive must not rebuild the editor. */
  const notesRef = useRef<{ id: string; title: string }[]>([]);
  notesRef.current = notes ?? [];
  const onOpenNoteRef = useRef(onOpenNote);
  onOpenNoteRef.current = onOpenNote;
  const onOpenCommentRef = useRef(onOpenComment);
  onOpenCommentRef.current = onOpenComment;
  const noteLinks = useMemo(() => noteLinkExtension(notesRef), []);

  const writeLockOwnerRef = useRef<string | null>(writeLockOwner);
  writeLockOwnerRef.current = writeLockOwner;
  const writeLockGuard = useMemo(() => writeLockGuardExtension(writeLockOwnerRef), []);

  const sentenceCapitalize = useMemo(() => sentenceCapitalizeExtension(), []);
  const autocorrect = useMemo(() => autocorrectExtension(), []);

  const editor = useEditor(
    {
      extensions: [
        ...BASE_EXTENSIONS,
        ...(collaboration
          ? [
              Collaboration.configure({ document: collaboration.document, field: BODY_FRAGMENT }),
              ...(collaboration.provider
                ? [
                    CollaborationCaret.configure({
                      provider: collaboration.provider,
                      user: { name: "You", color: "var(--accent)" },
                    }),
                  ]
                : []),
            ]
          : []),
        ...mediaExtensions,
        Placeholder.configure({ placeholder }),
        FindAndReplace.configure({ searchDebounceMs: 0 }),
        Typography.configure({
          oneHalf: false,
          oneQuarter: false,
          threeQuarters: false,
          plusMinus: false,
          notEqual: false,
          superscriptTwo: false,
          superscriptThree: false,
        }),
        slashMenu,
        noteLinks,
        writeLockGuard,
        sentenceCapitalize,
        autocorrect,
      ],
      content: collaboration ? undefined : value,
      editable: !readOnly,
      immediatelyRender: true,
      shouldRerenderOnTransaction: false,
      editorProps: {
        attributes: {
          class: "rich-text-content",
          lang: "it",
          autocapitalize: "sentences",
          autocorrect: "on",
          spellcheck: "true",
        },
        transformPastedText(text) {
          return capitalizeSentences(text);
        },
        /* A note link opens the note. Handled here rather than as an `href`,
           because there is no URL for a note: the window is one route and the
           note is state within it. Read through a ref for the same reason the
           list of notes is — the handler must never be a reason to rebuild the
           editor. */
        handleClickOn(_view, _pos, _node, _nodePos, event) {
          const target = event.target as HTMLElement | null;

          const anchor = target?.closest?.("a[data-note]");
          const noteId = anchor?.getAttribute("data-note");
          if (noteId && onOpenNoteRef.current) {
            event.preventDefault();
            onOpenNoteRef.current(noteId);
            return true;
          }

          /* The underline under a commented passage is the only sign that a
             conversation exists, so it has to be the way into it. Reading the
             thread id off the rendered mark rather than resolving the position
             back through the schema: the mark puts it in the DOM already, and
             a click lands on the span that carries it.

             Deliberately not `preventDefault()` — the caret still goes where
             you clicked, because clicking a word in your own paragraph must
             not stop being a way to start typing there. */
          const commented = target?.closest?.("span[data-comment-thread]");
          const threadId = commented?.getAttribute("data-comment-thread");
          if (threadId && onOpenCommentRef.current) {
            onOpenCommentRef.current(threadId);
            return false;
          }

          return false;
        },
        handlePaste(view, event) {
          const clipboard = event.clipboardData;
          const item = Array.from(clipboard?.items ?? []).find((candidate) =>
            candidate.type.startsWith("image/"),
          );
          const file =
            item?.getAsFile() ??
            Array.from(clipboard?.files ?? []).find((candidate) =>
              candidate.type.startsWith("image/"),
            );
          if (!file || !onPasteImageRef.current || !view.editable) return false;
          event.preventDefault();
          void onPasteImageRef.current(file).then((prepared) => {
            if (!prepared || view.isDestroyed) return;
            const node = view.state.schema.nodes.privateImage?.create({
              objectId: prepared.objectId,
              alt: prepared.alt,
            });
            if (node) view.dispatch(view.state.tr.replaceSelectionWith(node).scrollIntoView());
          });
          return true;
        },
      },
      onUpdate({ editor: current, transaction }) {
        if (!transaction.docChanged) return;
        if (!collaboration) {
          const document = current.getJSON();
          onChangeRef.current(document, richTextToPlainText(document));
          return;
        }
        /* Yjs writes the note, so nothing is serialised here — but somebody is
           still writing, and the flag that says so used to be raised inside the
           branch above. With collaboration on, which is always, it never fired:
           the caret in the other reader's header only ever appeared while the
           *title* was being typed.
           A remote update is a document change too, and it arrives carrying
           `ySyncPluginKey`. Announcing on those would tell the other person
           that you are writing because they are. */
        /* Deferred out of the transaction. Tiptap can run `onUpdate` inside a
           React render, and the page's own handler sets state — which React
           refuses mid-render ("cannot update a component while rendering a
           different component"). Nothing here is urgent: it says a person is
           typing, and it can say so on the next tick. */
        if (!transaction.getMeta(ySyncPluginKey)) queueMicrotask(() => onLocalEditRef.current?.());
      },
    },
    [collaboration?.document, collaboration?.provider],
  );

  const format = useCallback(
    (action: FormatAction) => {
      if (!editor || readOnly) return;
      const chain = editor.chain().focus();
      if (action === "bold") chain.toggleBold().run();
      else if (action === "italic") chain.toggleItalic().run();
      else if (action === "strike") chain.toggleStrike().run();
      else if (action === "code") chain.toggleCode().run();
      else if (action === "body") chain.setParagraph().run();
      else if (action === "heading-1") chain.toggleHeading({ level: 1 }).run();
      else if (action === "heading-2") chain.toggleHeading({ level: 2 }).run();
      else if (action === "heading-3") chain.toggleHeading({ level: 3 }).run();
      else if (action === "quote") chain.toggleBlockquote().run();
      else if (action === "bullet-list") chain.toggleBulletList().run();
      else if (action === "ordered-list") chain.toggleOrderedList().run();
      else if (action === "checklist") chain.toggleTaskList().run();
      else if (action === "divider") chain.setHorizontalRule().run();
      else if (action.startsWith("table-")) {
        if (/^table-[234]$/.test(action))
          chain.insertTable({ rows: 2, cols: Number(action.slice(-1)), withHeaderRow: true }).run();
        else if (action === "table-delete-column") chain.deleteColumn().run();
        else if (action === "table-delete-row") chain.deleteRow().run();
        else if (action === "table-delete") chain.deleteTable().run();
      } else if (action === "drawing") {
        chain.insertContent({ type: "drawing", attrs: { strokes: "[]", surface: "board" } }).run();
      } else if (action === "drawing-page") {
        /* One layer to a note. A second would be a second transparent sheet
           over the same words, and the only way to tell which one you were
           drawing on would be to draw on it. If there is one already, this is
           somebody asking for the pen back — which is a fact about the hand,
           not about the note, so it is announced rather than written. */
        let existing = false;
        editor.state.doc.descendants((child) => {
          if (child.type.name === "drawing" && child.attrs.surface === "page") existing = true;
          return !existing;
        });
        if (existing) window.dispatchEvent(new Event(TAKE_UP_THE_PEN));
        else {
          /* The view for this layer has not mounted yet, so there is nothing
             to announce it to. It reads this instead, once. */
          penWanted = true;
          chain
            .insertContentAt(0, { type: "drawing", attrs: { strokes: "[]", surface: "page" } })
            .run();
        }
      } else if (action === "color-clear") {
        chain.unsetColor().removeEmptyTextStyle().run();
      } else if (action.startsWith("color-")) {
        const color = action.slice("color-".length) as TextColor;
        const value = TEXT_COLOR_VALUE[color];
        if (editor.isActive("textStyle", { color: value }))
          chain.unsetColor().removeEmptyTextStyle().run();
        else chain.setColor(value).run();
      }
    },
    [editor, readOnly],
  );
  formatRef.current = format;

  useImperativeHandle(
    ref,
    () => ({
      format(action) {
        format(action);
      },
      getSelectedText() {
        if (!editor) return "";
        const { from, to } = editor.state.selection;
        return editor.state.doc.textBetween(from, to, "\n");
      },
      replaceSelectedText(text) {
        if (!editor || readOnly || editor.state.selection.empty) return;
        editor.chain().focus().deleteSelection().insertContent({ type: "text", text }).run();
      },
      insertLink(label, url) {
        if (!editor || readOnly) return;
        editor
          .chain()
          .focus()
          .insertContent({
            type: "text",
            text: label || url,
            marks: [{ type: "link", attrs: { href: url } }],
          })
          .run();
      },
      insertText(text) {
        if (!editor || readOnly) return;
        editor.chain().focus().insertContent(paragraphs(text)).run();
      },
      insertImage(objectId, alt) {
        if (!editor || readOnly) return;
        editor
          .chain()
          .focus()
          .insertContent({ type: "privateImage", attrs: { objectId, alt } })
          .run();
      },
      insertAttachment(label, objectId) {
        if (!editor || readOnly) return;
        editor
          .chain()
          .focus()
          .insertContent({ type: "privateFile", attrs: { objectId, label } })
          .run();
      },
      commentSelection(threadId) {
        if (!editor || readOnly) return null;
        const { state } = editor;
        const { from, to } = state.selection;
        if (from === to) return null;
        const quote = state.doc.textBetween(from, to, " ").trim();
        editor.chain().focus().setMark("comment", { threadId }).run();
        return { threadId, quote };
      },
      revealComment(threadId) {
        if (!editor) return false;
        let found: { from: number; to: number } | null = null;
        editor.state.doc.descendants((node, pos) => {
          if (found || !node.isText) return true;
          const mark = node.marks.find(
            (m) => m.type.name === "comment" && m.attrs.threadId === threadId,
          );
          if (mark) found = { from: pos, to: pos + node.nodeSize };
          return !found;
        });
        if (!found) return false;
        const { from, to } = found as { from: number; to: number };
        editor.chain().focus().setTextSelection({ from, to }).scrollIntoView().run();
        return true;
      },
      commentQuotes() {
        if (!editor) return new Map();
        return commentQuotes(editor.state.doc);
      },
      clearCommentSelection() {
        if (!editor) return;
        const { to } = editor.state.selection;
        editor.commands.setTextSelection(to);
      },
      setCommentResolved(threadId, resolved) {
        if (!editor || readOnly) return;
        const ranges: { from: number; to: number }[] = [];
        editor.state.doc.descendants((node, pos) => {
          if (!node.isText) return true;
          const mark = node.marks.find(
            (candidate) =>
              candidate.type.name === "comment" && candidate.attrs.threadId === threadId,
          );
          if (mark && Boolean(mark.attrs.resolved) !== resolved) {
            ranges.push({ from: pos, to: pos + node.nodeSize });
          }
          return true;
        });
        if (ranges.length === 0) return;
        const chain = editor.chain();
        for (const range of ranges.reverse()) {
          chain.setTextSelection(range).setMark("comment", { threadId, resolved });
        }
        chain.run();
        editor.commands.setTextSelection(ranges[0].to);
      },
      removeComment(threadId) {
        if (!editor || readOnly) return;
        const ranges: { from: number; to: number }[] = [];
        editor.state.doc.descendants((node, pos) => {
          if (!node.isText) return true;
          if (node.marks.some((m) => m.type.name === "comment" && m.attrs.threadId === threadId))
            ranges.push({ from: pos, to: pos + node.nodeSize });
          return true;
        });
        if (ranges.length === 0) return;
        const chain = editor.chain();
        /* Back to front: unsetting a range never shifts one that starts before
           it, and these are collected in document order. */
        for (const range of ranges.reverse()) chain.setTextSelection(range).unsetMark("comment");
        chain.run();
      },
      setSearch(query) {
        if (!editor) return { current: 0, total: 0 };
        editor.commands.setSearchTerm(query);
        if (query && editor.storage.findAndReplace.results.length > 0) {
          editor.commands.goToNextResult();
        }
        return searchStatus(editor);
      },
      findNext() {
        if (!editor) return { current: 0, total: 0 };
        editor.commands.goToNextResult();
        return searchStatus(editor);
      },
      findPrevious() {
        if (!editor) return { current: 0, total: 0 };
        editor.commands.goToPreviousResult();
        return searchStatus(editor);
      },
      closeSearch() {
        editor?.commands.clearSearch();
      },
      focus() {
        editor?.commands.focus();
      },
    }),
    [editor, format, readOnly],
  );

  useEffect(() => {
    if (editor && editor.isEditable !== !readOnly) editor.setEditable(!readOnly, false);
  }, [editor, readOnly]);

  useEffect(() => {
    if (!editor || collaboration || appliedRevision.current === revision) return;
    appliedRevision.current = revision;

    /* Replacing the document sends the caret to the top, which after a merge
       means being thrown to the start of the note mid-sentence. The offset is
       kept and restored, clamped to whatever the new document can hold: the
       merge puts your own blocks before the other person's, so the position
       you were typing at is still the position you were typing at. */
    const caret = editor.state.selection.from;
    const focused = editor.isFocused;
    editor.commands.setContent(value, { emitUpdate: false });
    if (focused) {
      const end = Math.max(1, editor.state.doc.content.size - 1);
      editor.commands.setTextSelection(Math.min(caret, end));
    }
    // A revision bump, not a delayed render, authorises replacing the document.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, revision, collaboration]);

  return (
    <>
      <EditorContent editor={editor} className="rich-text-editor" />
      {editor && !readOnly && (
        <>
          <BubbleMenu
            editor={editor}
            className="popover menu-popover rich-bubble-menu flex items-center gap-1 p-1"
            shouldShow={({ state }) => {
              const { selection } = state;
              if (selection.empty) return false;
              return !(
                selection instanceof NodeSelection &&
                ["privateImage", "privateFile", "drawing"].includes(selection.node.type.name)
              );
            }}
          >
            {(["bold", "italic", "strike", "code"] as const).map((action) => (
              <button
                key={action}
                type="button"
                className="toolbar-button press"
                aria-label={action}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => format(action)}
              >
                {action === "bold"
                  ? "B"
                  : action === "italic"
                    ? "I"
                    : action === "strike"
                      ? "S"
                      : "‹›"}
              </button>
            ))}
            <button
              type="button"
              className="toolbar-button press"
              aria-label="Link"
              onMouseDown={(event) => event.preventDefault()}
              onClick={onOpenLink}
            >
              ↗
            </button>
            {onComment && (
              <button
                type="button"
                className="toolbar-button press"
                aria-label="Comment on this passage"
                title="Comment on this passage"
                /* The selection must survive the click that acts on it: a
                   pressed button takes focus, and taking focus collapses the
                   very range being commented on. */
                onMouseDown={(event) => event.preventDefault()}
                onClick={onComment}
              >
                <MessageSquarePlus size={15} />
              </button>
            )}
            {writeLockOwner && (
              <button
                type="button"
                className="toolbar-button press"
                aria-label="Only I may write this passage"
                title="Only I may write this passage"
                onMouseDown={(event) => event.preventDefault()}
                /* Decided here rather than at render: the editor deliberately
                   does not re-render per transaction, so nothing drawn above
                   knows what the selection carries. A locked passage is tinted,
                   which is what says the state; this says what the press does
                   to it, and leaves the other member's lock alone. */
                onClick={() => {
                  if (!editor) return;
                  const chain = editor.chain().focus();
                  if (editor.isActive(WRITE_LOCK_MARK, { owner: writeLockOwner })) {
                    chain.unsetMark(WRITE_LOCK_MARK).run();
                  } else if (!editor.isActive(WRITE_LOCK_MARK)) {
                    chain.setMark(WRITE_LOCK_MARK, { owner: writeLockOwner }).run();
                  }
                }}
              >
                <Lock size={15} />
              </button>
            )}
            <span className="menu-separator rich-bubble-separator" />
            {(["yellow", "purple", "pink", "orange", "mint", "blue"] as TextColor[]).map(
              (color) => (
                <button
                  key={color}
                  type="button"
                  className={`menu-swatch is-${color}`}
                  aria-label={`${color} text`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => format(`color-${color}`)}
                >
                  A
                </button>
              ),
            )}
          </BubbleMenu>
          {!mobile && (
            <DragHandle editor={editor} className="rich-drag-handle">
              <GripVertical size={17} />
            </DragHandle>
          )}
        </>
      )}
      {preview && <ImageLightbox preview={preview} onClose={() => setPreview(null)} />}
    </>
  );
});
