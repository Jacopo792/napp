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
  Download,
  Eraser,
  ExternalLink,
  GripVertical,
  Lock,
  MessageSquarePlus,
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
  richTextToPlainText,
} from "@/features/editor/lib/content";
import { attachmentExtension } from "@/features/editor/lib/attachments";
import { takeAutocorrection } from "@/features/editor/lib/autocorrect";
import { commentQuotes } from "@/features/editor/lib/commentAnchors";
import { BODY_FRAGMENT } from "@/features/editor/lib/ydoc";
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
  | "drawing";

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
  { label: "Drawing", detail: "Sketch by hand", action: "drawing" },
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

function PrivateImageView({ node, extension, deleteNode, editor }: NodeViewProps) {
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
      {src ? (
        <button
          type="button"
          className="rich-media-image-open"
          onClick={() => options.open(src, alt || "Image")}
          contentEditable={false}
        >
          <img src={src} alt={alt || "Image"} draggable={false} />
        </button>
      ) : (
        <div className="rich-media-loading" contentEditable={false}>
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
        </div>
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
    const openedTab = window.open("", "_blank");
    setStatus("Opening…");
    void resolve()
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        if (openedTab) {
          openedTab.location.replace(url);
          openedTab.opener = null;
        }
        setStatus(
          openedTab
            ? "Private attachment · opens in a new tab"
            : "Allow pop-ups to open this attachment",
        );
        window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
      })
      .catch(() => openedTab?.close());
  }

  function download() {
    setStatus("Preparing download…");
    void resolve()
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = label;
        anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
        setStatus("Private attachment · opens in a new tab");
      })
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
 * A stroke is gathered in local state while the pointer is down and written to
 * the document once, on release. Writing per pointer event would be a Yjs
 * update per pixel of a gesture, sent to the other member and persisted, for a
 * line nobody has finished drawing yet.
 *
 * The pointer is followed with `window` listeners rather than
 * `setPointerCapture`, for the reason the cover learned the hard way: a
 * captured pointer retargets the click that follows to the capturing element,
 * and every control sitting on this surface would go dead the moment somebody
 * drew on it. */
function DrawingView({ node, updateAttributes, deleteNode, editor }: NodeViewProps) {
  const strokes = useMemo(() => drawingStrokes(node.attrs.strokes as string), [node.attrs.strokes]);
  const [ink, setInk] = useState<string>(DRAWING_INKS[0]);
  const [drawing, setDrawing] = useState<string>("");
  const surface = useRef<SVGSVGElement>(null);
  const path = useRef<string>("");

  const write = useCallback(
    (next: DrawingStroke[]) => updateAttributes({ strokes: JSON.stringify(next) }),
    [updateAttributes],
  );

  const at = useCallback((event: { clientX: number; clientY: number }) => {
    const box = surface.current?.getBoundingClientRect();
    if (!box || box.width === 0) return null;
    const x = Math.round(((event.clientX - box.left) / box.width) * DRAWING_BOX.width);
    const y = Math.round(((event.clientY - box.top) / box.height) * DRAWING_BOX.height);
    return `${x},${y}`;
  }, []);

  function start(event: React.PointerEvent) {
    if (!editor.isEditable || event.button !== 0) return;
    const point = at(event);
    if (!point) return;
    event.preventDefault();
    path.current = `M${point}`;
    setDrawing(path.current);

    const move = (next: PointerEvent) => {
      const step = at(next);
      if (!step) return;
      path.current = `${path.current}L${step}`;
      setDrawing(path.current);
    };
    const finish = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      /* A tap that never moved is a dot, and a dot is a stroke of one point —
         which draws nothing without a second. Give it one. */
      const committed = path.current.includes("L")
        ? path.current
        : `${path.current}L${path.current.slice(1)}`;
      setDrawing("");
      path.current = "";
      void write([...strokes, { d: committed, color: ink, width: 5 }]);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  }

  return (
    <NodeViewWrapper className="rich-media-drawing">
      <span className="rich-media-drawing-sheet" contentEditable={false}>
        <svg
          ref={surface}
          className="rich-media-drawing-surface"
          viewBox={`0 0 ${DRAWING_BOX.width} ${DRAWING_BOX.height}`}
          preserveAspectRatio="none"
          onPointerDown={start}
        >
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
          {drawing && (
            <path
              d={drawing}
              fill="none"
              stroke={ink}
              strokeWidth={5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </svg>
      </span>
      {editor.isEditable && (
        <span className="rich-media-drawing-tools" contentEditable={false}>
          {DRAWING_INKS.map((colour) => (
            <button
              key={colour}
              type="button"
              className={`drawing-ink ${colour === ink ? "is-chosen" : ""}`}
              style={{ background: colour }}
              aria-label={`Draw in ${colour}`}
              aria-pressed={colour === ink}
              onClick={() => setInk(colour)}
            />
          ))}
          <button
            type="button"
            className="rich-media-file-action"
            aria-label="Undo the last stroke"
            title="Undo the last stroke"
            disabled={strokes.length === 0}
            onClick={() => void write(strokes.slice(0, -1))}
          >
            <Undo2 size={15} />
          </button>
          <button
            type="button"
            className="rich-media-file-action"
            aria-label="Clear the drawing"
            title="Clear the drawing"
            disabled={strokes.length === 0}
            onClick={() => void write([])}
          >
            <Eraser size={15} />
          </button>
          <button
            type="button"
            className="rich-media-file-action is-danger"
            aria-label="Remove drawing"
            title="Remove drawing"
            onClick={deleteNode}
          >
            <Trash2 size={15} />
          </button>
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
        chain.insertContent({ type: "drawing", attrs: { strokes: "[]" } }).run();
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
                ["privateImage", "privateFile"].includes(selection.node.type.name)
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
