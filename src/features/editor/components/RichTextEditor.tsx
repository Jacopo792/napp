import { Extension, mergeAttributes, Node, type JSONContent } from "@tiptap/core";
import DragHandle from "@tiptap/extension-drag-handle-react";
import { FindAndReplace } from "@tiptap/extension-find-and-replace";
import Placeholder from "@tiptap/extension-placeholder";
import Typography from "@tiptap/extension-typography";
import Suggestion, { type SuggestionProps } from "@tiptap/suggestion";
import { NodeSelection, Plugin, PluginKey } from "@tiptap/pm/state";
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
import { Download, ExternalLink, GripVertical, Trash2 } from "lucide-react";
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
  PrivateFile,
  PrivateImage,
  TEXT_COLOR_VALUE,
  type TextColor,
  richTextToPlainText,
} from "@/features/editor/lib/content";
import { attachmentExtension } from "@/features/editor/lib/attachments";
import { takeAutocorrection } from "@/features/editor/lib/autocorrect";
import { BODY_FRAGMENT } from "@/features/editor/lib/ydoc";
import type { HocuspocusProvider } from "@hocuspocus/provider";
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
  | "color-clear";

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
  onPasteImage?: (file: File) => Promise<{ objectId: string; alt: string } | null>;
  onOpenLink: () => void;
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
  ...(["yellow", "purple", "pink", "orange", "mint", "blue"] as TextColor[]).map((color) => ({
    label: `${color[0].toUpperCase()}${color.slice(1)} text`,
    action: `color-${color}` as FormatAction,
  })),
];

function capitalizeSentences(text: string): string {
  return text.replace(/(^\s*[a-zà-ÿ])|([.!?]\s+[a-zà-ÿ])/g, (m) => m.toUpperCase());
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
  }, [objectId, resolveImage]);

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
    onPasteImage,
    onOpenLink,
    mobile = false,
    resolveImage,
    resolveFile,
    collaboration = null,
  },
  ref,
) {
  const [preview, setPreview] = useState<ImagePreview | null>(null);
  const onChangeRef = useRef(onChange);
  const onPasteImageRef = useRef(onPasteImage);
  const appliedRevision = useRef(revision);
  const formatRef = useRef<(action: FormatAction) => void>(() => undefined);
  onChangeRef.current = onChange;
  onPasteImageRef.current = onPasteImage;

  const mediaExtensions = useMemo(
    () => [
      privateImageExtension(resolveImage, (src, alt) => setPreview({ src, alt })),
      privateFileExtension(resolveFile),
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
        }
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
      <EditorContent editor={editor} className="rich-text-editor h-full" />
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
