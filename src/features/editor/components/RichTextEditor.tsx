import { mergeAttributes, Node, type JSONContent } from "@tiptap/core";
import { FindAndReplace } from "@tiptap/extension-find-and-replace";
import Placeholder from "@tiptap/extension-placeholder";
import {
  EditorContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditor,
  type NodeViewProps,
} from "@tiptap/react";
import { Download, ExternalLink, Trash2 } from "lucide-react";
import { createPortal } from "react-dom";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import {
  DOCUMENT_EXTENSIONS,
  TEXT_COLOR_VALUE,
  type TextColor,
  richTextToPlainText,
} from "@/features/editor/lib/content";
import { attachmentExtension } from "@/features/editor/lib/attachments";

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
  resolveImage: (objectId: string) => Promise<Blob>;
  resolveFile: (objectId: string) => Promise<Blob>;
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

function privateImageExtension(resolve: Resolver, open: PrivateImageOptions["open"]) {
  return Node.create<PrivateImageOptions>({
    name: "privateImage",
    group: "block",
    atom: true,
    draggable: true,
    addOptions: () => ({ resolve, open }),
    addAttributes() {
      return {
        objectId: { default: "" },
        alt: { default: "Image" },
      };
    },
    parseHTML: () => [{ tag: "napp-private-image" }],
    renderHTML({ HTMLAttributes }) {
      return ["napp-private-image", mergeAttributes(HTMLAttributes)];
    },
    addNodeView() {
      return ReactNodeViewRenderer(PrivateImageView);
    },
  });
}

function privateFileExtension(resolve: Resolver) {
  return Node.create<PrivateFileOptions>({
    name: "privateFile",
    group: "block",
    atom: true,
    draggable: true,
    addOptions: () => ({ resolve }),
    addAttributes() {
      return {
        objectId: { default: "" },
        label: { default: "Attachment" },
      };
    },
    parseHTML: () => [{ tag: "napp-private-file" }],
    renderHTML({ HTMLAttributes }) {
      return ["napp-private-file", mergeAttributes(HTMLAttributes)];
    },
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
  { value, readOnly, placeholder, revision = 0, onChange, onPasteImage, resolveImage, resolveFile },
  ref,
) {
  const [preview, setPreview] = useState<ImagePreview | null>(null);
  const onChangeRef = useRef(onChange);
  const onPasteImageRef = useRef(onPasteImage);
  const appliedRevision = useRef(revision);
  onChangeRef.current = onChange;
  onPasteImageRef.current = onPasteImage;

  const mediaExtensions = useMemo(
    () => [
      privateImageExtension(resolveImage, (src, alt) => setPreview({ src, alt })),
      privateFileExtension(resolveFile),
    ],
    [resolveFile, resolveImage],
  );

  const editor = useEditor({
    extensions: [
      ...DOCUMENT_EXTENSIONS,
      ...mediaExtensions,
      Placeholder.configure({ placeholder }),
      FindAndReplace.configure({ searchDebounceMs: 0 }),
    ],
    content: value,
    editable: !readOnly,
    immediatelyRender: true,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: { class: "rich-text-content", lang: "it" },
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
      const document = current.getJSON();
      onChangeRef.current(document, richTextToPlainText(document));
    },
  });

  useImperativeHandle(
    ref,
    () => ({
      format(action) {
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
            chain
              .insertTable({ rows: 2, cols: Number(action.slice(-1)), withHeaderRow: true })
              .run();
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
    [editor, readOnly],
  );

  useEffect(() => {
    if (editor && editor.isEditable !== !readOnly) editor.setEditable(!readOnly, false);
  }, [editor, readOnly]);

  useEffect(() => {
    if (!editor || appliedRevision.current === revision) return;
    appliedRevision.current = revision;
    editor.commands.setContent(value, { emitUpdate: false });
    // A revision bump, not a delayed render, authorises replacing the document.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, revision]);

  return (
    <>
      <EditorContent editor={editor} className="rich-text-editor h-full" />
      {preview && <ImageLightbox preview={preview} onClose={() => setPreview(null)} />}
    </>
  );
});
