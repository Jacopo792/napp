import {
  Bold,
  ChevronDown,
  ChevronUp,
  Code2,
  FileUp,
  Heading2,
  ImagePlus,
  Italic,
  Link,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Paperclip,
  Plus,
  Quote,
  Strikethrough,
  Search,
  Table2,
  X,
} from "lucide-react";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Meta, Tag } from "@/lib/types";
import type { NoteEntry } from "@/lib/entries";
import { formatCount, formatStamp } from "@/lib/format";
import { editBody, readDraft, useDraftMetrics } from "@/lib/draft";
import { extractPdfText } from "@/lib/pdf";
import { imageAltFromFilename } from "@/lib/image";
import { TagBadge } from "./TagBadge";
import { TitleField } from "./TitleField";
import { MarkdownEditor, type FormatAction, type MarkdownEditorHandle } from "./MarkdownEditor";

const FORMAT_ITEMS: {
  action: FormatAction;
  label: string;
  shortcut?: string;
  icon: typeof Bold;
}[] = [
  { action: "bold", label: "Bold", shortcut: "⌘B", icon: Bold },
  { action: "italic", label: "Italic", shortcut: "⌘I", icon: Italic },
  { action: "strike", label: "Strikethrough", icon: Strikethrough },
  { action: "heading", label: "Heading", icon: Heading2 },
  { action: "checklist", label: "Checklist", icon: ListChecks },
  { action: "table", label: "Table", icon: Table2 },
  { action: "bullet-list", label: "Bulleted list", icon: List },
  { action: "ordered-list", label: "Numbered list", icon: ListOrdered },
  { action: "quote", label: "Quote", icon: Quote },
  { action: "link", label: "Link", icon: Link },
  { action: "code", label: "Inline code", icon: Code2 },
  { action: "divider", label: "Divider", icon: Minus },
];

interface Props {
  mobile?: boolean;
  entry: NoteEntry | null;
  meta: Meta;
  /** Raised when the draft store carries text pulled from the other device. */
  syncRevision: number;
  canEdit: boolean;
  viewingAsPartner: boolean;
  partnerName: string;
  titleRef: React.RefObject<HTMLTextAreaElement | null>;
  /** The draft store already holds the words; this only asks for a save. */
  onEdited: () => void;
  onTagsChange: (noteId: string, tagIds: string[]) => void;
  onNew: () => void;
  onUploadImage: (file: File) => Promise<string>;
  resolveImage: (imageId: string) => Promise<Blob>;
  headerActions?: ReactNode;
}

export interface NoteEditorHandle {
  openFind: (query?: string) => void;
  focus: () => void;
}

/* The page. Title, measurements and body all sit inside one column whose width
   is the reading measure, so the display line is set over the exact text it
   introduces — the specimen's core arrangement, and the reason the title is
   not a full-bleed input bar. */

export const NoteEditor = forwardRef<NoteEditorHandle, Props>(function NoteEditor(
  {
    mobile = false,
    entry,
    meta,
    syncRevision,
    canEdit,
    viewingAsPartner,
    partnerName,
    titleRef,
    onEdited,
    onTagsChange,
    onNew,
    onUploadImage,
    resolveImage,
    headerActions,
  },
  ref,
) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [formatOpen, setFormatOpen] = useState(false);
  const [attachmentOpen, setAttachmentOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkLabel, setLinkLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkError, setLinkError] = useState("");
  const [pdfStatus, setPdfStatus] = useState("");
  const [pdfError, setPdfError] = useState("");
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [findStatus, setFindStatus] = useState({ current: 0, total: 0 });
  const pickerRef = useRef<HTMLDivElement>(null);
  const formatRef = useRef<HTMLDivElement>(null);
  const attachmentRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const linkUrlRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<MarkdownEditorHandle>(null);
  const findRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    openFind(query = "") {
      setFindOpen(true);
      if (query) {
        setFindQuery(query);
        setFindStatus(editorRef.current?.setSearch(query) ?? { current: 0, total: 0 });
      }
      window.setTimeout(() => {
        findRef.current?.focus();
        findRef.current?.select();
      }, 0);
    },
    focus() {
      editorRef.current?.focus();
    },
  }));

  function closeFind() {
    setFindOpen(false);
    setFindQuery("");
    setFindStatus({ current: 0, total: 0 });
    editorRef.current?.closeSearch();
  }

  useEffect(() => {
    if (!pickerOpen && !formatOpen && !linkOpen && !attachmentOpen) return;
    function onDown(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
      if (formatRef.current && !formatRef.current.contains(e.target as Node)) {
        setFormatOpen(false);
        setLinkOpen(false);
      }
      if (attachmentRef.current && !attachmentRef.current.contains(e.target as Node)) {
        setAttachmentOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [pickerOpen, formatOpen, linkOpen, attachmentOpen]);

  /* Subscribed, not computed: the body is not React state, and this readout is
     the only thing in the page that tracks it while the words are being typed. */
  const { words, chars } = useDraftMetrics(entry?.note.id ?? null);

  const assignedIds = useMemo(
    () => (entry ? (meta.notes.find((n) => n.id === entry.note.id)?.tagIds ?? []) : []),
    [meta, entry],
  );
  const assigned = assignedIds
    .map((id) => meta.tags.find((t) => t.id === id))
    .filter(Boolean) as Tag[];
  const available = meta.tags.filter((t) => !assignedIds.includes(t.id));

  async function handlePdf(file: File | undefined) {
    if (!file || !entry || !canEdit) return;
    setPdfError("");
    setPdfStatus("Reading PDF…");
    setFormatOpen(false);
    try {
      const text = await extractPdfText(file, (page, total) => {
        setPdfStatus(`Reading page ${page} of ${total}…`);
      });
      editorRef.current?.insertText(text);
      setPdfStatus("PDF imported locally");
      window.setTimeout(() => setPdfStatus(""), 2400);
    } catch (error) {
      setPdfStatus("");
      setPdfError(error instanceof Error ? error.message : "Could not read PDF");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleImage(file: File | undefined) {
    if (!file || !entry || !canEdit) return;
    setPdfError("");
    setPdfStatus("Preparing image…");
    setFormatOpen(false);
    try {
      const src = await onUploadImage(file);
      editorRef.current?.insertImage(src, imageAltFromFilename(file.name));
      setPdfStatus("Image inserted and encrypted with this note");
      window.setTimeout(() => setPdfStatus(""), 2600);
    } catch (error) {
      setPdfStatus("");
      setPdfError(error instanceof Error ? error.message : "Could not insert image");
    } finally {
      if (imageRef.current) imageRef.current.value = "";
    }
  }

  async function handlePastedImage(file: File): Promise<{ src: string; alt: string } | null> {
    if (!entry || !canEdit) return null;
    setPdfError("");
    setPdfStatus("Preparing pasted image…");
    try {
      const src = await onUploadImage(file);
      setPdfStatus("Image pasted and encrypted with this note");
      window.setTimeout(() => setPdfStatus(""), 2600);
      return { src, alt: file.name ? imageAltFromFilename(file.name) : "Pasted image" };
    } catch (error) {
      setPdfStatus("");
      setPdfError(error instanceof Error ? error.message : "Could not paste image");
      return null;
    }
  }

  function openLinkForm() {
    setLinkLabel(editorRef.current?.getSelectedText() ?? "");
    setLinkUrl("");
    setLinkError("");
    setFormatOpen(false);
    setLinkOpen(true);
    window.setTimeout(() => linkUrlRef.current?.focus(), 0);
  }

  function handleInsertLink() {
    let url = linkUrl.trim();
    if (!url) {
      setLinkError("Enter a URL");
      return;
    }
    if (!/^[a-z][a-z\d+.-]*:/i.test(url)) url = `https://${url}`;
    try {
      const parsed = new URL(url);
      if (!["http:", "https:", "mailto:"].includes(parsed.protocol)) throw new Error();
      url = parsed.href;
    } catch {
      setLinkError("Enter a valid web address");
      return;
    }

    editorRef.current?.insertLink(linkLabel, url);
    setLinkOpen(false);
  }

  if (!entry) {
    return (
      <section
        className={`editor-shell flex min-w-0 flex-1 flex-col ${mobile ? "mobile-editor h-full w-full border-0 bg-page" : "soft-pane pane-page"}`}
      >
        <div className="flex flex-1 items-center justify-center px-8">
          <div className="measure px-8 py-12 text-center font-sans">
            <p
              className="font-display text-ink-4"
              style={{ fontSize: "clamp(2rem, 5vw, 3.25rem)", fontVariationSettings: '"wght" 300' }}
            >
              Aa
            </p>
            <p className="mt-4 text-sm font-medium text-ink-2">No note open</p>
            <button
              onClick={onNew}
              className="label mt-4 rounded-lg bg-accent px-4 py-2 text-on-accent transition-opacity hover:opacity-90"
            >
              Write a new one · N
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      key={entry.note.id}
      className={`editor-shell page-in flex min-w-0 flex-1 flex-col ${mobile ? "mobile-editor h-full w-full border-0 bg-page" : "soft-pane pane-page"}`}
    >
      {/* Frontispiece — set over the measure the body will use. */}
      <div className="editor-toolbar relative flex h-13 shrink-0 items-center border-b border-rule px-4">
        <span className="label text-ink-4">{canEdit ? "Editing" : "Read only"}</span>

        {!mobile && canEdit && (
          <div className="editor-tool-cluster glass-toolbar absolute left-1/2 flex -translate-x-1/2 items-center p-1">
            <div className="relative" ref={formatRef}>
              <button
                type="button"
                aria-label="Formatting"
                aria-expanded={formatOpen}
                className={`editor-tool-button ${formatOpen ? "is-active" : ""}`}
                onClick={() => {
                  setAttachmentOpen(false);
                  setFormatOpen((value) => !value);
                }}
              >
                <span className="font-display text-[17px]">Aa</span>
              </button>
              {formatOpen && (
                <div
                  role="menu"
                  aria-label="Formatting"
                  className="popover menu-popover absolute top-full left-0 z-40 mt-2 w-60 p-1.5"
                >
                  {FORMAT_ITEMS.map(({ action, label, shortcut, icon: Icon }) => (
                    <button
                      key={action}
                      role="menuitem"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        if (action === "link") openLinkForm();
                        else {
                          editorRef.current?.format(action);
                          setFormatOpen(false);
                        }
                      }}
                      className="menu-row"
                    >
                      <Icon size={15} strokeWidth={1.8} className="text-ink-3" />
                      <span>{label}</span>
                      {shortcut && <span className="readout ml-auto text-ink-4">{shortcut}</span>}
                    </button>
                  ))}
                </div>
              )}
              {linkOpen && (
                <div className="popover absolute top-full left-0 z-40 mt-2 w-72 p-3">
                  <p className="label mb-2 text-ink-2">Insert link</p>
                  <label className="mb-2 block">
                    <span className="label mb-1 block text-ink-4">Text</span>
                    <input
                      value={linkLabel}
                      onChange={(event) => setLinkLabel(event.target.value)}
                      placeholder="Link text (optional)"
                      className="soft-control w-full px-3 py-2 text-xs text-ink outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className="label mb-1 block text-ink-4">URL</span>
                    <input
                      ref={linkUrlRef}
                      value={linkUrl}
                      onChange={(event) => {
                        setLinkUrl(event.target.value);
                        setLinkError("");
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          handleInsertLink();
                        } else if (event.key === "Escape") setLinkOpen(false);
                      }}
                      placeholder="https://example.com"
                      aria-invalid={linkError ? true : undefined}
                      className="soft-control w-full px-3 py-2 text-xs text-ink outline-none"
                    />
                  </label>
                  {linkError && (
                    <p role="alert" className="mt-1.5 text-[11px] text-danger">
                      {linkError}
                    </p>
                  )}
                  <div className="mt-3 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setLinkOpen(false)}
                      className="menu-small-button"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleInsertLink}
                      className="menu-small-button is-primary"
                    >
                      Insert
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              aria-label="Insert checklist"
              className="editor-tool-button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => editorRef.current?.format("checklist")}
            >
              <ListChecks size={17} />
            </button>
            <button
              type="button"
              aria-label="Insert table"
              className="editor-tool-button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => editorRef.current?.format("table")}
            >
              <Table2 size={17} />
            </button>

            <div className="relative" ref={attachmentRef}>
              <button
                type="button"
                aria-label="Attachments"
                aria-expanded={attachmentOpen}
                className={`editor-tool-button ${attachmentOpen ? "is-active" : ""}`}
                onClick={() => {
                  setFormatOpen(false);
                  setAttachmentOpen((value) => !value);
                }}
              >
                <Paperclip size={17} />
              </button>
              {attachmentOpen && (
                <div
                  role="menu"
                  aria-label="Attachments"
                  className="popover menu-popover absolute top-full right-0 z-40 mt-2 w-56 p-1.5"
                >
                  <button
                    role="menuitem"
                    className="menu-row"
                    onClick={() => {
                      setAttachmentOpen(false);
                      imageRef.current?.click();
                    }}
                  >
                    <ImagePlus size={16} />
                    Choose photo
                  </button>
                  <button
                    role="menuitem"
                    className="menu-row"
                    onClick={() => {
                      setAttachmentOpen(false);
                      fileRef.current?.click();
                    }}
                  >
                    <FileUp size={16} />
                    Import PDF as text
                  </button>
                  <p className="px-3 py-2 text-[10px] leading-relaxed text-ink-4">
                    Images are encrypted. PDFs are converted locally into editable text.
                  </p>
                </div>
              )}
            </div>

            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(event) => void handlePdf(event.target.files?.[0])}
            />
            <input
              ref={imageRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
              className="hidden"
              onChange={(event) => void handleImage(event.target.files?.[0])}
            />
          </div>
        )}
        <span className="ml-auto flex items-center gap-1">{headerActions}</span>
      </div>

      {findOpen && (
        <div className="find-bar glass-toolbar mx-auto mt-3 flex w-[min(34rem,calc(100%_-_2rem))] shrink-0 items-center gap-2 px-3 py-2">
          <Search size={15} className="shrink-0 text-ink-4" />
          <input
            ref={findRef}
            value={findQuery}
            onChange={(event) => {
              const next = event.target.value;
              setFindQuery(next);
              setFindStatus(editorRef.current?.setSearch(next) ?? { current: 0, total: 0 });
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                setFindStatus(
                  event.shiftKey
                    ? (editorRef.current?.findPrevious() ?? { current: 0, total: 0 })
                    : (editorRef.current?.findNext() ?? { current: 0, total: 0 }),
                );
              } else if (event.key === "Escape") closeFind();
            }}
            placeholder="Find in note"
            aria-label="Find in note"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-4"
          />
          <span className="readout min-w-12 text-right text-ink-4">
            {findStatus.total ? `${findStatus.current}/${findStatus.total}` : "0/0"}
          </span>
          <button
            type="button"
            aria-label="Previous result"
            className="icon-button h-8 w-8 text-ink-3"
            onClick={() =>
              setFindStatus(editorRef.current?.findPrevious() ?? { current: 0, total: 0 })
            }
          >
            <ChevronUp size={15} />
          </button>
          <button
            type="button"
            aria-label="Next result"
            className="icon-button h-8 w-8 text-ink-3"
            onClick={() => setFindStatus(editorRef.current?.findNext() ?? { current: 0, total: 0 })}
          >
            <ChevronDown size={15} />
          </button>
          <button
            type="button"
            aria-label="Close find"
            className="icon-button h-8 w-8 text-ink-3"
            onClick={closeFind}
          >
            <X size={15} />
          </button>
        </div>
      )}

      <header className={`shrink-0 ${mobile ? "px-5 pt-6 pb-3" : "px-10 pt-8 pb-5"}`}>
        <div className="measure">
          <div className="font-sans text-base">
            {viewingAsPartner && (
              <p className="label mb-3 text-ink-3">
                {partnerName}&apos;s archive{!canEdit && " · read only"}
              </p>
            )}

            <TitleField
              mobile={mobile}
              noteId={entry.note.id}
              canEdit={canEdit}
              titleRef={titleRef}
              onEdited={onEdited}
            />

            {/* Measurements. Every value right of its own label, tabular. */}
            <div
              className={`flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-rule-soft pt-3 ${mobile ? "mobile-editor-meta mt-4" : "mt-5"}`}
            >
              <span className="readout text-ink-3">
                Created <span className="text-ink-2">{formatStamp(entry.note.createdAt)}</span>
              </span>
              <span className="readout text-ink-3">
                Edited <span className="text-ink-2">{formatStamp(entry.note.updatedAt)}</span>
              </span>
              <span className="readout text-ink-3">
                Words <span className="text-ink-2">{formatCount(words)}</span>
              </span>
              <span className="readout text-ink-3">
                Chars <span className="text-ink-2">{formatCount(chars)}</span>
              </span>

              {assigned.length > 0 && (
                <span className="flex flex-wrap items-center gap-3">
                  {assigned.map((tag) => (
                    <TagBadge
                      key={tag.id}
                      tag={tag}
                      onRemove={
                        canEdit
                          ? () =>
                              onTagsChange(
                                entry.note.id,
                                assignedIds.filter((t) => t !== tag.id),
                              )
                          : undefined
                      }
                    />
                  ))}
                </span>
              )}

              {canEdit && available.length > 0 && (
                <div className="relative" ref={pickerRef}>
                  <button
                    onClick={() => setPickerOpen((v) => !v)}
                    aria-expanded={pickerOpen}
                    className="label flex items-center gap-1 text-ink-3 transition-colors hover:text-accent"
                  >
                    <Plus size={10} strokeWidth={2.5} />
                    Tag
                  </button>
                  {pickerOpen && (
                    <div className="popover absolute top-full left-0 z-20 mt-2 min-w-40 p-1">
                      {available.map((tag) => (
                        <button
                          key={tag.id}
                          onClick={() => {
                            onTagsChange(entry.note.id, [...assignedIds, tag.id]);
                            setPickerOpen(false);
                          }}
                          className="flex w-full items-center rounded-lg px-3 py-2 text-left transition-colors hover:bg-surface"
                        >
                          <TagBadge tag={tag} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {(pdfStatus || pdfError) && (
              <p
                role={pdfError ? "alert" : "status"}
                className={`mt-2 text-[11px] ${pdfError ? "text-danger" : "text-accent"}`}
              >
                {pdfError || pdfStatus}
              </p>
            )}
          </div>
        </div>
      </header>

      {/* The text itself. */}
      <div className={`min-h-0 flex-1 ${mobile ? "px-5" : "px-10"}`}>
        <MarkdownEditor
          key={entry.note.id}
          ref={editorRef}
          value={readDraft(entry.note.id)?.body ?? ""}
          docKey={entry.note.id}
          revision={syncRevision}
          readOnly={!canEdit}
          placeholder="Start writing. Markdown formats itself as you type."
          onChange={(body) => {
            if (!canEdit) return;
            editBody(entry.note.id, body);
            onEdited();
          }}
          onPasteImage={handlePastedImage}
          resolveImage={resolveImage}
        />
      </div>
    </section>
  );
});
