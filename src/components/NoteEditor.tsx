import {
  Bold,
  ChevronDown,
  Code2,
  FileUp,
  Heading2,
  ImagePlus,
  Italic,
  Link,
  List,
  ListOrdered,
  Minus,
  Pin,
  Plus,
  Quote,
  Strikethrough,
  Type,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Meta, Tag } from "@/lib/types";
import type { NoteEntry } from "@/lib/entries";
import { countChars, countWords, formatCount, formatStamp } from "@/lib/format";
import { extractPdfText } from "@/lib/pdf";
import { imageAltFromFilename, prepareImageForNote } from "@/lib/image";
import { TagBadge } from "./TagBadge";
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
  draft: { title: string; body: string } | null;
  canEdit: boolean;
  viewingAsPartner: boolean;
  partnerName: string;
  titleRef: React.RefObject<HTMLTextAreaElement | null>;
  onChange: (title: string, body: string) => void;
  onTagsChange: (noteId: string, tagIds: string[]) => void;
  pinned: boolean;
  onTogglePin: () => void;
  onNew: () => void;
}

/* The page. Title, measurements and body all sit inside one column whose width
   is the reading measure, so the display line is set over the exact text it
   introduces — the specimen's core arrangement, and the reason the title is
   not a full-bleed input bar. */

export function NoteEditor({
  mobile = false,
  entry,
  meta,
  draft,
  canEdit,
  viewingAsPartner,
  partnerName,
  titleRef,
  onChange,
  onTagsChange,
  pinned,
  onTogglePin,
  onNew,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [formatOpen, setFormatOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkLabel, setLinkLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkError, setLinkError] = useState("");
  const [pdfStatus, setPdfStatus] = useState("");
  const [pdfError, setPdfError] = useState("");
  const pickerRef = useRef<HTMLDivElement>(null);
  const formatRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const linkUrlRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<MarkdownEditorHandle>(null);

  useEffect(() => {
    if (!pickerOpen && !formatOpen && !linkOpen) return;
    function onDown(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
      if (formatRef.current && !formatRef.current.contains(e.target as Node)) {
        setFormatOpen(false);
        setLinkOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [pickerOpen, formatOpen, linkOpen]);

  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    const resize = () => {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(el.parentElement ?? el);
    return () => observer.disconnect();
  }, [entry?.note.id, draft?.title, titleRef]);

  const assignedIds = useMemo(
    () => (entry ? (meta.notes.find((n) => n.id === entry.note.id)?.tagIds ?? []) : []),
    [meta, entry],
  );
  const assigned = assignedIds
    .map((id) => meta.tags.find((t) => t.id === id))
    .filter(Boolean) as Tag[];
  const available = meta.tags.filter((t) => !assignedIds.includes(t.id));

  async function handlePdf(file: File | undefined) {
    if (!file || !draft || !canEdit) return;
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
    if (!file || !draft || !canEdit) return;
    setPdfError("");
    setPdfStatus("Preparing image…");
    setFormatOpen(false);
    try {
      const dataUrl = await prepareImageForNote(file);
      editorRef.current?.insertImage(dataUrl, imageAltFromFilename(file.name));
      setPdfStatus("Image inserted and encrypted with this note");
      window.setTimeout(() => setPdfStatus(""), 2600);
    } catch (error) {
      setPdfStatus("");
      setPdfError(error instanceof Error ? error.message : "Could not insert image");
    } finally {
      if (imageRef.current) imageRef.current.value = "";
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

  if (!entry || !draft) {
    return (
      <section
        className={`flex min-w-0 flex-1 flex-col bg-page ${mobile ? "mobile-editor border-0" : "soft-pane"}`}
      >
        <div className="flex flex-1 items-center justify-center px-8">
          <div
            className="w-full rounded-2xl border border-rule-soft bg-paper px-8 py-12 text-center"
            style={{ maxWidth: "var(--read-measure)" }}
          >
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

  const words = countWords(draft.body);
  const chars = countChars(draft.body);

  return (
    <section
      key={entry.note.id}
      className={`page-in flex min-w-0 flex-1 flex-col bg-page ${mobile ? "mobile-editor border-0" : "soft-pane"}`}
    >
      {/* Frontispiece — set over the measure the body will use. */}
      <header className={`shrink-0 ${mobile ? "px-5 pt-5 pb-3" : "px-10 pt-10 pb-5"}`}>
        <div className="w-full" style={{ maxWidth: "var(--read-measure)" }}>
          {viewingAsPartner && (
            <p className="label mb-3 text-ink-3">
              {partnerName}&apos;s archive{!canEdit && " · read only"}
            </p>
          )}

          <textarea
            ref={titleRef}
            rows={1}
            value={draft.title}
            onChange={(e) => canEdit && onChange(e.target.value, draft.body)}
            onInput={(e) => {
              e.currentTarget.style.height = "auto";
              e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
            placeholder="Untitled"
            readOnly={!canEdit}
            aria-label="Note title"
            className="font-display block w-full resize-none overflow-hidden bg-transparent text-ink outline-none placeholder:text-ink-4"
            style={{
              fontSize: "clamp(1.75rem, 2.6vw, 2.5rem)",
              lineHeight: 1.14,
              letterSpacing: "-0.028em",
              fontVariationSettings: '"wght" 620, "opsz" 42',
            }}
          />

          {/* Measurements. Every value right of its own label, tabular. */}
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-rule-soft pt-3">
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

            {canEdit && (
              <button
                onClick={onTogglePin}
                aria-pressed={pinned}
                title={pinned ? "Unpin note" : "Pin note to top"}
                className={`label soft-control ml-auto flex items-center gap-1.5 px-2.5 py-1.5 transition-colors ${
                  pinned
                    ? "border-accent text-accent"
                    : "text-ink-2 hover:border-accent hover:text-accent"
                }`}
              >
                <Pin
                  size={13}
                  strokeWidth={pinned ? 2.4 : 1.8}
                  fill={pinned ? "currentColor" : "none"}
                />
                {pinned ? "Pinned" : "Pin"}
              </button>
            )}

            {canEdit && (
              <div className="relative" ref={formatRef}>
                <button
                  onClick={() => setFormatOpen((value) => !value)}
                  aria-expanded={formatOpen}
                  aria-haspopup="menu"
                  className="label soft-control flex items-center gap-1.5 px-2.5 py-1.5 text-ink-2 transition-colors hover:border-accent hover:text-accent"
                >
                  <Type size={13} strokeWidth={2} />
                  Format
                  <ChevronDown
                    size={12}
                    className={`transition-transform ${formatOpen ? "rotate-180" : ""}`}
                  />
                </button>

                {formatOpen && (
                  <div
                    role="menu"
                    aria-label="Formatting"
                    className="popover absolute top-full right-0 z-30 mt-2 w-56 p-1.5"
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
                        className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12px] text-ink-2 transition-colors hover:bg-surface hover:text-ink"
                      >
                        <Icon size={14} strokeWidth={1.8} className="text-ink-3" />
                        <span>{label}</span>
                        {shortcut && <span className="readout ml-auto text-ink-4">{shortcut}</span>}
                      </button>
                    ))}

                    <div className="my-1 border-t border-rule-soft" />
                    <button
                      role="menuitem"
                      onClick={() => imageRef.current?.click()}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12px] text-ink-2 transition-colors hover:bg-surface hover:text-ink"
                    >
                      <ImagePlus size={14} strokeWidth={1.8} className="text-accent" />
                      <span>Insert image</span>
                    </button>
                    <button
                      role="menuitem"
                      onClick={() => fileRef.current?.click()}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12px] text-ink-2 transition-colors hover:bg-surface hover:text-ink"
                    >
                      <FileUp size={14} strokeWidth={1.8} className="text-accent" />
                      <span>Import PDF as text</span>
                    </button>
                    <p className="px-2.5 pt-1 pb-1.5 text-[10px] leading-relaxed text-ink-4">
                      Files are processed locally. JPG, PNG, WebP and text PDFs.
                    </p>
                  </div>
                )}

                {linkOpen && (
                  <div className="popover absolute top-full right-0 z-30 mt-2 w-72 p-3">
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
                          } else if (event.key === "Escape") {
                            setLinkOpen(false);
                          }
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
                        onClick={() => setLinkOpen(false)}
                        className="label rounded-lg px-3 py-2 text-ink-3 hover:bg-surface"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleInsertLink}
                        className="label rounded-lg bg-accent px-3 py-2 text-on-accent hover:bg-accent-strong"
                      >
                        Insert
                      </button>
                    </div>
                  </div>
                )}

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
      </header>

      {/* The text itself. */}
      <div className={`min-h-0 flex-1 ${mobile ? "px-5" : "px-10"}`}>
        <MarkdownEditor
          ref={editorRef}
          value={draft.body}
          docKey={entry.note.id}
          readOnly={!canEdit}
          placeholder="Start writing. Markdown formats itself as you type."
          onChange={(body) => canEdit && onChange(draft.title, body)}
        />
      </div>
    </section>
  );
}
