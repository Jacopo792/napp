import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { NoteEntry } from "@/lib/entries";
import { formatStamp } from "@/lib/format";
import { editBody, readDraft } from "@/lib/draft";
import { extractPdfText } from "@/lib/pdf";
import { assertAttachable, attachmentLabel, attachmentReference } from "@/lib/attachments";
import { imageAltFromFilename } from "@/lib/image";
import { translateText, type TranslationLanguage } from "@/lib/translation";
import { EditorToolbar } from "./EditorToolbar";
import { TitleField } from "./TitleField";
import { MarkdownEditor, type MarkdownEditorHandle } from "./MarkdownEditor";

interface Props {
  mobile?: boolean;
  entry: NoteEntry | null;
  /** Raised when the draft store carries text pulled from the other device. */
  syncRevision: number;
  canEdit: boolean;
  viewingAsPartner: boolean;
  partnerName: string;
  titleRef: React.RefObject<HTMLTextAreaElement | null>;
  /** The draft store already holds the words; this only asks for a save. */
  onEdited: () => void;
  onNew: () => void;
  onUploadImage: (file: File) => Promise<string>;
  onUploadFile: (file: File) => Promise<string>;
  resolveImage: (imageId: string) => Promise<Blob>;
  resolveFile: (objectId: string) => Promise<Blob>;
  navigationAction?: ReactNode;
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
    syncRevision,
    canEdit,
    viewingAsPartner,
    partnerName,
    titleRef,
    onEdited,
    onNew,
    onUploadImage,
    onUploadFile,
    resolveImage,
    resolveFile,
    navigationAction,
    headerActions,
  },
  ref,
) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkLabel, setLinkLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkError, setLinkError] = useState("");
  const [status, setStatus] = useState("");
  const [failure, setFailure] = useState("");
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [findStatus, setFindStatus] = useState({ current: 0, total: 0 });
  const attachPdfRef = useRef<HTMLInputElement>(null);
  const importPdfRef = useRef<HTMLInputElement>(null);
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

  /** A transient line under the measurements: what the last action did. */
  const report = useCallback((message: string, ms = 2400) => {
    setStatus(message);
    window.setTimeout(() => setStatus((current) => (current === message ? "" : current)), ms);
  }, []);

  /**
   * A PDF kept as a PDF. The bytes are uploaded whole; the
   * note gains one link that the editor renders as a card.
   */
  async function handleAttachPdf(file: File | undefined) {
    if (!file || !entry || !canEdit) return;
    setFailure("");
    try {
      assertAttachable(file);
      setStatus("Attaching PDF…");
      const objectId = await onUploadFile(file);
      editorRef.current?.insertAttachment(
        attachmentLabel(file.name),
        attachmentReference(objectId),
      );
      report("PDF attached");
    } catch (error) {
      setStatus("");
      setFailure(error instanceof Error ? error.message : "Could not attach the PDF");
    } finally {
      if (attachPdfRef.current) attachPdfRef.current.value = "";
    }
  }

  async function handleImportPdfText(file: File | undefined) {
    if (!file || !entry || !canEdit) return;
    setFailure("");
    setStatus("Reading PDF…");
    try {
      const text = await extractPdfText(file, (page, total) => {
        setStatus(`Reading page ${page} of ${total}…`);
      });
      editorRef.current?.insertText(text);
      report("PDF imported as text");
    } catch (error) {
      setStatus("");
      setFailure(error instanceof Error ? error.message : "Could not read PDF");
    } finally {
      if (importPdfRef.current) importPdfRef.current.value = "";
    }
  }

  async function handleImage(file: File | undefined) {
    if (!file || !entry || !canEdit) return;
    setFailure("");
    setStatus("Preparing image…");
    try {
      const src = await onUploadImage(file);
      editorRef.current?.insertImage(src, imageAltFromFilename(file.name));
      report("Image inserted", 2600);
    } catch (error) {
      setStatus("");
      setFailure(error instanceof Error ? error.message : "Could not insert image");
    } finally {
      if (imageRef.current) imageRef.current.value = "";
    }
  }

  async function handlePastedImage(file: File): Promise<{ src: string; alt: string } | null> {
    if (!entry || !canEdit) return null;
    setFailure("");
    setStatus("Preparing pasted image…");
    try {
      const src = await onUploadImage(file);
      report("Image pasted", 2600);
      return { src, alt: file.name ? imageAltFromFilename(file.name) : "Pasted image" };
    } catch (error) {
      setStatus("");
      setFailure(error instanceof Error ? error.message : "Could not paste image");
      return null;
    }
  }

  function openLinkForm() {
    setLinkLabel(editorRef.current?.getSelectedText() ?? "");
    setLinkUrl("");
    setLinkError("");
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

  const closeLink = useCallback(() => setLinkOpen(false), []);

  async function handleTranslate(language: TranslationLanguage) {
    const selected = editorRef.current?.getSelectedText() ?? "";
    if (!selected.trim()) {
      setFailure("Select the text you want to translate first");
      return;
    }
    setFailure("");
    setStatus("Detecting language…");
    try {
      const translated = await translateText(selected, language, (progress) => {
        setStatus(`Downloading language pack… ${progress}%`);
      });
      editorRef.current?.replaceSelectedText(translated);
      report("Translation inserted");
    } catch (error) {
      setStatus("");
      setFailure(error instanceof Error ? error.message : "Could not translate the selection");
    }
  }

  const linkForm = (
    <div className="popover editor-tool-menu absolute top-full left-0 z-40 mt-2 w-72 p-3">
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
        <button type="button" onClick={() => setLinkOpen(false)} className="menu-small-button">
          Cancel
        </button>
        <button type="button" onClick={handleInsertLink} className="menu-small-button is-primary">
          Insert
        </button>
      </div>
    </div>
  );

  const toolbar = canEdit ? (
    <EditorToolbar
      mobile={mobile}
      onFormat={(action) => editorRef.current?.format(action)}
      onLink={openLinkForm}
      onAttachPdf={() => attachPdfRef.current?.click()}
      onImportPdfText={() => importPdfRef.current?.click()}
      onChoosePhoto={() => imageRef.current?.click()}
      onTranslate={(language) => void handleTranslate(language)}
      linkForm={linkForm}
      linkOpen={linkOpen}
      onCloseLink={closeLink}
    />
  ) : null;

  const fileInputs = (
    <>
      <input
        ref={attachPdfRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(event) => void handleAttachPdf(event.target.files?.[0])}
      />
      <input
        ref={importPdfRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(event) => void handleImportPdfText(event.target.files?.[0])}
      />
      <input
        ref={imageRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
        className="hidden"
        onChange={(event) => void handleImage(event.target.files?.[0])}
      />
    </>
  );

  if (!entry) {
    return (
      <section
        className={`editor-shell flex min-w-0 flex-1 flex-col ${mobile ? "mobile-editor h-full w-full border-0 bg-page" : "soft-pane pane-page"}`}
      >
        {(navigationAction || headerActions) && (
          <header className="editor-toolbar flex h-13 shrink-0 items-center border-b border-rule px-4">
            {navigationAction && (
              <span className="flex items-center gap-1">{navigationAction}</span>
            )}
            <span className="ml-auto flex items-center gap-1">{headerActions}</span>
          </header>
        )}
        <div className="flex flex-1 items-center justify-center px-8">
          <div className="measure px-8 py-12 text-center font-sans">
            <p
              className="font-display text-ink-4"
              style={{ fontSize: "clamp(2rem, 5vw, 3.25rem)", fontWeight: 300 }}
            >
              Aa
            </p>
            <p className="mt-4 text-sm font-medium text-ink-2">No note open</p>
            <button
              onClick={onNew}
              className="label press mt-4 rounded-lg bg-accent px-4 py-2 text-on-accent transition-opacity hover:opacity-90"
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
      <div className="editor-toolbar relative flex h-13 shrink-0 items-center gap-2 px-4">
        {navigationAction && <span className="flex items-center gap-1">{navigationAction}</span>}
        {!mobile && <span className="label text-ink-4">{canEdit ? "Editing" : "Read only"}</span>}

        {/* Desktop keeps the cluster optically centred over the measure; the
            phone gives it a row of its own, below. */}
        {!mobile && toolbar && <div className="absolute left-1/2 -translate-x-1/2">{toolbar}</div>}

        <span className="ml-auto flex min-w-0 items-center gap-1">{headerActions}</span>
      </div>

      {mobile && toolbar && (
        <div className="editor-format-bar flex shrink-0 items-center justify-center px-3 py-2">
          {toolbar}
        </div>
      )}

      {fileInputs}

      {findOpen && (
        <div className="find-bar glass-toolbar mx-auto mt-3 flex w-[min(34rem,calc(100%_-_2rem))] shrink-0 items-center gap-2 px-3 py-2">
          <Search size={16} className="shrink-0 text-ink-4" />
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
            className="icon-button press h-8 w-8 text-ink-3"
            onClick={() =>
              setFindStatus(editorRef.current?.findPrevious() ?? { current: 0, total: 0 })
            }
          >
            <ChevronUp size={16} />
          </button>
          <button
            type="button"
            aria-label="Next result"
            className="icon-button press h-8 w-8 text-ink-3"
            onClick={() => setFindStatus(editorRef.current?.findNext() ?? { current: 0, total: 0 })}
          >
            <ChevronDown size={16} />
          </button>
          <button
            type="button"
            aria-label="Close find"
            className="icon-button press h-8 w-8 text-ink-3"
            onClick={closeFind}
          >
            <X size={16} />
          </button>
        </div>
      )}

      <header className={`shrink-0 ${mobile ? "px-5 pt-5 pb-3" : "px-10 pt-8 pb-5"}`}>
        <div className="measure">
          <div className="font-sans text-base">
            {viewingAsPartner && (
              <p className="label mb-3 text-ink-3">
                {partnerName}&apos;s archive{!canEdit && " · read only"}
              </p>
            )}

            <p className="note-date">{formatStamp(entry.note.updatedAt)}</p>

            <TitleField
              mobile={mobile}
              noteId={entry.note.id}
              canEdit={canEdit}
              titleRef={titleRef}
              onEdited={onEdited}
            />

            {(status || failure) && (
              <p
                role={failure ? "alert" : "status"}
                className={`mt-2 text-[11px] ${failure ? "text-danger" : "text-accent"}`}
              >
                {failure || status}
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
          value={readDraft(entry.note.id)?.body ?? entry.note.body}
          docKey={entry.note.id}
          revision={syncRevision}
          readOnly={!canEdit}
          placeholder="Start writing…"
          onChange={(body) => {
            if (!canEdit) return;
            editBody(entry.note.id, body);
            onEdited();
          }}
          onPasteImage={handlePastedImage}
          resolveImage={resolveImage}
          resolveFile={resolveFile}
        />
      </div>
    </section>
  );
});
