import {
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  Link2,
  Lock,
  LockOpen,
  ListTree,
  MessageSquare,
  Search,
  X,
} from "lucide-react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { BotanicalFlower, FLOWER_HEAD_BOX } from "@/components/BotanicalFlowers";
import { flowerFor } from "@/lib/botanical";
import type { NoteEntry } from "@/lib/entries";
import type { NoteLock } from "@/lib/types";
import { formatStamp } from "@/lib/format";
import { editBody, readDraft } from "@/features/editor/lib/draft";
import { extractPdfText } from "@/features/editor/lib/pdf";
import { assertAttachable, attachmentLabel } from "@/features/editor/lib/attachments";
import { imageAltFromFilename } from "@/lib/image";
import { proofreadText } from "@/features/editor/lib/proofread";
import { translateText, type TranslationLanguage } from "@/features/editor/lib/translation";
import { COVER_PRESETS } from "@/lib/pageProperties";
import type { AppSession } from "@/lib/session";
import { NoteComments, type CommentAuthor } from "./NoteComments";
import { NoteOutline } from "./NoteOutline";
import { EditorToolbar } from "./EditorToolbar";
import { useDock } from "./useDock";
import { TitleField } from "./TitleField";
import { RichTextEditor, type RichTextEditorHandle } from "./RichTextEditor";
import { PageCover, PageIdentity, type PagePropertyValues } from "./PageProperties";
import { TITLE_TEXT } from "@/features/editor/lib/ydoc";
import type { HocuspocusProvider } from "@hocuspocus/provider";
import type * as Y from "yjs";

interface Props {
  mobile?: boolean;
  entry: NoteEntry | null;
  /** Raised when the draft store carries text pulled from the other device. */
  syncRevision: number;
  canEdit: boolean;
  /** Who has taken this note back, and whether it was you.
   *
   *  `holderName` empty means nobody has: the note is the archive's, the way
   *  every note is by default. Absent altogether means locking is not on offer
   *  here at all — Trash, the preview, a reader who may not write. */
  lock?: NoteLock;
  /** Whether this browser offers the on-device proofreader at all. */
  proofreaderEnabled: boolean;
  viewingAsPartner: boolean;
  partnerName: string;
  titleRef: React.RefObject<HTMLTextAreaElement | null>;
  /** The draft store already holds the words; this only asks for a save. */
  onEdited: () => void;
  /** Who the archive holds, so a remark can be signed. Absent means comments
   *  are unavailable, which is how the preview and Trash opt out. */
  commentAuthors?: Map<string, CommentAuthor>;
  session?: AppSession;
  /** The server has synced this note, as opposed to it being drawn from the
   *  local store while the socket is still on its way. */
  synced?: boolean;
  onNew: () => void;
  onImportMarkdown: () => void;
  onUploadImage: (file: File) => Promise<string>;
  onUploadFile: (file: File) => Promise<string>;
  resolveImage: (imageId: string) => Promise<Blob>;
  resolveFile: (objectId: string) => Promise<Blob>;
  navigationAction?: ReactNode;
  /** What the header says about the note — the save readout, the faces of who
   *  else is on it. It stands beside the controls rather than inside them: a
   *  dock magnifies what a pointer can press, and neither of these is a
   *  button. */
  headerStatus?: ReactNode;
  headerActions?: ReactNode;
  /** Right-click on the page, but never on the words themselves. */
  onContextMenu?: (event: MouseEvent) => void;
  onUpdatePageProperties?: (values: PagePropertyValues) => Promise<void>;
  collaboration?: { document: Y.Doc; provider: HocuspocusProvider | null } | null;
  /** Every note `[[` can reach from this one, and the notes that reach this
   *  one. Both absent where there is no archive behind the page. */
  linkable?: { id: string; title: string }[];
  backlinks?: { id: string; title: string }[];
  onOpenNote?: (noteId: string) => void;
}

/* The toolbar's three groups — the mode label, the format cluster, the save
   readout and its actions — need about this much room side by side. Under it
   the cluster takes a row of its own, the way the phone already gives it one.
   Measured, not guessed: the cluster is 210px and the actions 184px, and a
   desktop window of 1024px leaves the editor 334px to hold both. */
const TOOLBAR_ROOM = 550;

export interface NoteEditorHandle {
  openFind: (query?: string) => void;
  openLink: () => void;
  focus: () => void;
}

/* The page. Title, measurements and body all sit inside one column whose width
   is the reading measure, so the display line is set over the exact text it
   introduces — the specimen's core arrangement, and the reason the title is
   not a full-bleed input bar. */

/* Has the plate drawn itself yet on this visit? Module scope and not state,
   because the answer has to outlive every mount: the drawing is worth watching
   once, and a thing that redraws each time you change note is a thing you end
   up watching instead of reading. That is exactly why a plate was taken out of
   here before, and the flag is the whole of what makes putting one back safe. */
let tailpieceDrawn = false;

/** The mark at the end of a note, in the run-out the text already leaves below
 *  itself: a plate in the bottom margin, on the outer edge, the way a botanical
 *  book puts one there.
 *
 *  A sibling of the editor and never a node inside it — anything in the
 *  document would be editable, would serialise into Markdown, and would reach
 *  the other reader as content. Never interactive either: the padding beneath
 *  belongs to the editor, and clicking it should still put the caret at the end
 *  of the text.
 *
 *  Which flower it is, is seeded by the note's id, so a note keeps its own. */
function NoteTailpiece({ noteId }: { noteId: string }) {
  const [drawing] = useState(() => !tailpieceDrawn);
  useEffect(() => {
    tailpieceDrawn = true;
  }, []);
  return (
    <div className="note-tailpiece" aria-hidden="true">
      <BotanicalFlower
        flower={flowerFor(noteId)}
        viewBox={FLOWER_HEAD_BOX}
        className={`note-tailpiece-plate ${drawing ? "" : "is-drawn"}`}
      />
    </div>
  );
}

export const NoteEditor = forwardRef<NoteEditorHandle, Props>(function NoteEditor(
  {
    mobile = false,
    entry,
    syncRevision,
    canEdit,
    lock,
    proofreaderEnabled,
    viewingAsPartner,
    partnerName,
    titleRef,
    onEdited,
    commentAuthors,
    session,
    synced = false,
    onNew,
    onImportMarkdown,
    onUploadImage,
    onUploadFile,
    resolveImage,
    resolveFile,
    navigationAction,
    headerStatus,
    headerActions,
    onContextMenu,
    onUpdatePageProperties,
    collaboration = null,
    linkable,
    backlinks,
    onOpenNote,
  },
  ref,
) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkLabel, setLinkLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkError, setLinkError] = useState("");
  const [status, setStatus] = useState("");
  const [failure, setFailure] = useState("");
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [outlineOpen, setOutlineOpen] = useState(false);
  /* The scrolling column, handed to the outline so it can ask both questions
     it has — what the headings say, and where they are — of one element. */
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  /* A passage the bubble menu has just anchored, waiting for its first remark.
     It exists in the document and not yet in the archive, which is why it is
     held here rather than being read back with the rest. */
  const [pendingThread, setPendingThread] = useState<string | null>(null);
  /* The thread the panel should scroll to and outline, set by clicking the
     underlined passage it belongs to. Not the same thing as `pendingThread`,
     which is a thread that has been anchored and not yet said anything in. */
  const [focusThread, setFocusThread] = useState<string | null>(null);
  const [quotes, setQuotes] = useState<Map<string, string>>(() => new Map());
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [findStatus, setFindStatus] = useState({ current: 0, total: 0 });
  const attachPdfRef = useRef<HTMLInputElement>(null);
  const importPdfRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const linkUrlRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<RichTextEditorHandle>(null);
  const findRef = useRef<HTMLInputElement>(null);

  /* The header's controls are a dock like the formatting cluster: the same
     pill and the same magnification, so the two read as one thing. The state
     it reports — the readout, the faces — gets the pill without the dock, and
     the left of the header keeps neither: "Editing" and Add cover were there
     before any of this and stay as they were. The phone gets none of it, its
     header being one tight row already. */
  const rightDock = useDock<HTMLSpanElement>(mobile);
  const [shellWidth, setShellWidth] = useState<number | null>(null);

  const shellRef = useCallback((node: HTMLElement | null) => {
    if (!node) return;
    setShellWidth(node.getBoundingClientRect().width);
    const observer = new ResizeObserver(([box]) => setShellWidth(box.contentRect.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

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
    openLink() {
      openLinkForm();
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
   * note gains one structured attachment node that the editor renders as a card.
   */
  async function handleAttachPdf(file: File | undefined) {
    if (!file || !entry || !canEdit) return;
    setFailure("");
    try {
      assertAttachable(file);
      setStatus("Attaching PDF…");
      const objectId = await onUploadFile(file);
      editorRef.current?.insertAttachment(attachmentLabel(file.name), objectId);
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

  async function handlePastedImage(file: File): Promise<{ objectId: string; alt: string } | null> {
    if (!entry || !canEdit) return null;
    setFailure("");
    setStatus("Preparing pasted image…");
    try {
      const objectId = await onUploadImage(file);
      report("Image pasted", 2600);
      return { objectId, alt: file.name ? imageAltFromFilename(file.name) : "Pasted image" };
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

  async function handleProofread() {
    const selected = editorRef.current?.getSelectedText() ?? "";
    if (!selected.trim()) {
      setFailure("Select the text you want to proofread first");
      return;
    }
    setFailure("");
    setStatus("Detecting language…");
    try {
      const { corrected, count } = await proofreadText(selected, (progress) => {
        setStatus(`Downloading the proofreading model… ${progress}%`);
      });
      /* Nothing to change is not a correction of zero words: leaving the
         document alone keeps a pointless step out of the undo stack and the
         draft undirtied. */
      if (count === 0) {
        report("No corrections needed");
        return;
      }
      editorRef.current?.replaceSelectedText(corrected);
      report(count === 1 ? "1 correction applied" : `${count} corrections applied`);
    } catch (error) {
      setStatus("");
      setFailure(error instanceof Error ? error.message : "Could not proofread the selection");
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
      onImportMarkdown={onImportMarkdown}
      onImportPdfText={() => importPdfRef.current?.click()}
      onChoosePhoto={() => imageRef.current?.click()}
      onTranslate={(language) => void handleTranslate(language)}
      proofreaderEnabled={proofreaderEnabled}
      onProofread={() => void handleProofread()}
      linkForm={linkForm}
      linkOpen={linkOpen}
      onCloseLink={closeLink}
    />
  ) : null;

  /* The page's own menu, and only where the page has one to give. Inside the
     words the browser's menu is worth more than anything we could put there:
     spelling suggestions, Look Up, and a paste that needs no permission. So a
     right-click on the text, the title or any other field is left alone. */
  function handlePageContextMenu(event: MouseEvent) {
    if (!onContextMenu) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest(".rich-text-content, input, textarea, [contenteditable='true']")) return;
    event.preventDefault();
    /* The menu that is about to mount listens on the document for the next
       right-click, so this one must not be allowed to reach it. */
    event.stopPropagation();
    onContextMenu(event);
  }

  /* Inline while there is room for it; on its own row otherwise. */
  const inlineToolbar =
    !mobile && Boolean(toolbar) && (shellWidth === null || shellWidth >= TOOLBAR_ROOM);

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

  const syncCommentResolution = useCallback((threadId: string, resolved: boolean) => {
    editorRef.current?.setCommentResolved(threadId, resolved);
  }, []);

  const closeComments = useCallback(() => {
    /* A pending thread exists only as a mark in the document. Closing without
       saying anything cancels it, so it must not leave an orphan highlight. */
    if (pendingThread) editorRef.current?.removeComment(pendingThread);
    editorRef.current?.clearCommentSelection();
    setQuotes(editorRef.current?.commentQuotes() ?? new Map());
    setCommentsOpen(false);
    setPendingThread(null);
    setFocusThread(null);
  }, [pendingThread]);

  if (!entry) {
    return (
      <section
        className={`editor-shell flex min-w-0 flex-1 flex-col ${mobile ? "mobile-editor h-full w-full border-0 bg-page" : "soft-pane pane-page"}`}
      >
        {(navigationAction || headerStatus || headerActions) && (
          <header className="editor-toolbar has-rule flex h-13 shrink-0 items-center px-4">
            {navigationAction && (
              <span className="flex items-center gap-1">{navigationAction}</span>
            )}
            <span className="ml-auto flex items-center gap-1">
              {headerStatus}
              {headerActions}
            </span>
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

  const canComment = Boolean(session && commentAuthors && canEdit);

  function startComment() {
    const threadId = crypto.randomUUID();
    const anchored = editorRef.current?.commentSelection(threadId);
    if (!anchored) return;
    setQuotes(editorRef.current?.commentQuotes() ?? new Map());
    setPendingThread(threadId);
    setCommentsOpen(true);
  }

  const updatePageProperties = (values: PagePropertyValues) => {
    void onUpdatePageProperties?.(values).catch((reason) =>
      setFailure(reason instanceof Error ? reason.message : "Could not update this page"),
    );
  };

  return (
    <section
      key={entry.note.id}
      ref={shellRef}
      onContextMenu={handlePageContextMenu}
      className={`editor-shell flex min-w-0 flex-1 flex-col ${mobile ? "mobile-editor h-full w-full border-0 bg-page" : "soft-pane pane-page"}`}
    >
      {/* Frontispiece — set over the measure the body will use. */}
      <div
        className={`editor-toolbar relative h-13 shrink-0 px-4 ${
          inlineToolbar
            ? "grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2"
            : "flex items-center gap-2"
        }`}
      >
        <span className="flex min-w-0 items-center gap-2">
          {navigationAction && <span className="flex items-center gap-1">{navigationAction}</span>}
          {!mobile && (
            <span className="label truncate text-ink-4">
              {canEdit
                ? "Editing"
                : lock?.holderName
                  ? `Locked by ${lock.holderName}`
                  : "Read only"}
            </span>
          )}
          {/* Setting a cover is something you do to the page, so it belongs
              with the page's own controls rather than standing in the reading
              column above the title — where it was the one thing in that column
              that was not the note. It appears only while there is no cover;
              once there is one, the cover carries its own Change and Remove. */}
          {/* Locking is a thing you do to this note, so it lives where the
              note's other controls do — and it is offered only to somebody
              who could lift it again: while the other member holds it there
              is nothing here to press, only the readout above saying so. */}
          {lock && (lock.mine || !lock.holderName) && (
            <button type="button" className="note-add-property" onClick={lock.onToggle}>
              {lock.mine ? <LockOpen size={15} /> : <Lock size={15} />}
              {lock.mine ? "Unlock" : "Lock"}
            </button>
          )}
          {canEdit && !entry.note.cover && (
            <button
              type="button"
              className="note-add-property"
              onClick={() =>
                updatePageProperties({
                  photo: entry.note.photo,
                  cover: { kind: "preset", id: COVER_PRESETS[0].id, position: 0.5 },
                })
              }
            >
              <ImageIcon size={15} />
              Add cover
            </button>
          )}
        </span>

        {/* A wide enough editor keeps the cluster optically centred over the
            measure. A middle grid column centres it exactly as `position:
            absolute` used to, and unlike absolute it occupies room: centred
            over a 632px editor the cluster ran fifteen pixels underneath the
            save readout, and no width of readout could have avoided it. */}
        {inlineToolbar && <div className="justify-self-center">{toolbar}</div>}

        <span
          className={`flex min-w-0 items-center justify-end gap-2 justify-self-end ${
            inlineToolbar ? "" : "ml-auto"
          }`}
        >
          {/* The readout and the faces get a pill of their own rather than a
              seat in the dock: they are what the header says, not what it
              does, and a dock that carried them would be moving its icons
              around two things that never move. */}
          <span
            className={`flex min-w-0 items-center gap-2 ${
              mobile ? "" : "editor-tool-group glass-toolbar"
            }`}
          >
            {headerStatus}
          </span>
          <span
            ref={rightDock.ref}
            {...rightDock.handlers}
            className={`flex min-w-0 items-center justify-end gap-1 ${
              mobile ? "gap-1" : "editor-tool-group glass-toolbar"
            }`}
          >
            <button
              type="button"
              className={`toolbar-button press ${outlineOpen ? "is-active" : ""}`}
              aria-label="Outline"
              aria-pressed={outlineOpen}
              title="Outline"
              onClick={() => setOutlineOpen((open) => !open)}
            >
              <ListTree size={16} />
            </button>
            {session && commentAuthors && (
              <button
                type="button"
                className={`toolbar-button press ${commentsOpen ? "is-active" : ""}`}
                aria-label="Comments"
                aria-pressed={commentsOpen}
                title="Comments"
                onClick={() => {
                  if (commentsOpen) {
                    closeComments();
                    return;
                  }
                  setQuotes(editorRef.current?.commentQuotes() ?? new Map());
                  setCommentsOpen(true);
                }}
              >
                <MessageSquare size={16} />
              </button>
            )}
            {headerActions}
          </span>
        </span>
      </div>

      {!inlineToolbar && toolbar && (
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

      {/* The cover, the frontispiece and the text scroll as one column. The
          cover used to be pinned above the scrolling text, which on a laptop
          left the note itself a slot a few lines deep and no way to push the
          picture out of the way. */}
      {/* `page-in` belongs to the column, never to the pane. On the pane it was
          an `opacity: 0` on the one element carrying `background: var(--page)`,
          so the first frames of every note switch showed the reader's wallpaper
          through a hole where the page should be. */}
      <div className="editor-body flex min-h-0 flex-1">
        <div ref={setScroller} className="editor-scroll page-in min-h-0 flex-1">
          <PageCover
            cover={entry.note.cover}
            photo={entry.note.photo}
            canEdit={canEdit}
            resolveImage={resolveImage}
            uploadImage={onUploadImage}
            onChange={updatePageProperties}
            onError={setFailure}
          />

          <header className={mobile ? "px-5 pt-5 pb-3" : "px-10 pt-8 pb-5"}>
            <div className="measure note-frontispiece-measure">
              <div className="font-sans text-base">
                <PageIdentity
                  photo={entry.note.photo}
                  cover={entry.note.cover}
                  canEdit={canEdit}
                  resolveImage={resolveImage}
                  onChange={updatePageProperties}
                />
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
                  yTitle={collaboration?.document.getText(TITLE_TEXT) ?? null}
                  synced={synced}
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

          {/* The text itself, and not before the server has said so. Building an
            editor from the projection first and rebuilding it against the Yjs
            fragment on `onSynced` painted the note twice, and the second paint
            is the bounce. One document, one instance, mounted once. */}
          <div className={mobile ? "px-5" : "px-10"}>
            {collaboration && (
              <RichTextEditor
                key={entry.note.id}
                ref={editorRef}
                value={readDraft(entry.note.id)?.content ?? entry.note.content}
                revision={syncRevision}
                readOnly={!canEdit}
                placeholder="Start writing…"
                onChange={(content, body) => {
                  if (!canEdit) return;
                  editBody(entry.note.id, body, content);
                  onEdited();
                }}
                /* Typing in the body is what the other reader's caret is about,
                 and Yjs carries the words, so this is the only thing the page
                 still needs to hear about a keystroke. */
                onLocalEdit={onEdited}
                onPasteImage={handlePastedImage}
                onOpenLink={openLinkForm}
                onComment={canComment ? startComment : undefined}
                mobile={mobile}
                resolveImage={resolveImage}
                resolveFile={resolveFile}
                collaboration={collaboration}
                notes={linkable}
                onOpenNote={onOpenNote}
                /* Clicking the underline opens the conversation about that
                   passage. The quotes are re-read first for the same reason
                   the ⋯ button re-reads them: they come from the live
                   document, which has been edited since the panel last
                   looked. */
                onOpenComment={(threadId) => {
                  setQuotes(editorRef.current?.commentQuotes() ?? new Map());
                  setCommentsOpen(true);
                  setFocusThread(threadId);
                }}
              />
            )}

            {/* The title paints from the draft store the moment you click, and
              the body cannot: it waits for the server to authorise and sync.
              That asymmetry is what made the wait read as broken rather than
              slow — a title over nothing at all. Three bars on the measure the
              text is about to use say the same thing honestly, and the
              toolbar's "Connecting" says why. */}
            {!collaboration && (
              <div className="note-body-waiting" aria-hidden="true">
                <div className="skeleton" style={{ width: "92%" }} />
                <div className="skeleton" style={{ width: "78%" }} />
                <div className="skeleton" style={{ width: "45%" }} />
              </div>
            )}
            {/* What points here. A note is not only what it says; the notes
                that reached for it are part of what it is, and they are the
                one thing about a note it cannot state itself. Only when there
                are some — an empty "Linked from" under every note teaches the
                reader to stop looking at the foot of the page. */}
            {backlinks && backlinks.length > 0 && (
              <div className={`note-backlinks ${mobile ? "px-0" : ""}`}>
                <p className="note-backlinks-label">Linked from</p>
                <div className="note-backlinks-list">
                  {backlinks.map((note) => (
                    <button
                      key={note.id}
                      type="button"
                      className="note-backlink press"
                      onClick={() => onOpenNote?.(note.id)}
                    >
                      <Link2 size={13} />
                      {note.title || "Untitled"}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {collaboration && <NoteTailpiece noteId={entry.note.id} />}
          </div>
        </div>

        {outlineOpen && <NoteOutline scroller={scroller} onClose={() => setOutlineOpen(false)} />}

        {commentsOpen && session && commentAuthors && (
          <NoteComments
            key={entry.note.id}
            session={session}
            noteId={entry.note.id}
            canEdit={canEdit}
            authors={commentAuthors}
            quotes={quotes}
            pendingThread={pendingThread}
            onPendingHandled={() => setPendingThread(null)}
            focusThread={focusThread}
            onFocusHandled={() => setFocusThread(null)}
            onClose={closeComments}
            onReveal={(threadId) => editorRef.current?.revealComment(threadId)}
            onRemoveAnchor={(threadId) => {
              editorRef.current?.removeComment(threadId);
              setQuotes(editorRef.current?.commentQuotes() ?? new Map());
            }}
            onResolveAnchor={syncCommentResolution}
          />
        )}
      </div>
    </section>
  );
});
