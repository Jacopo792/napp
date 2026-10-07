import {
  ChevronDown,
  ChevronUp,
  History,
  Link2,
  Copy,
  ListTree,
  MessageSquare,
  MessageSquarePlus,
  NotebookPen,
  Search,
  X,
} from "@/components/icons";
import { keyName } from "@/lib/shortcuts";
import { PointMenu } from "@/components/ContextMenu";
import type { MenuPoint } from "@/lib/contextMenu";
import type { MenuItem } from "@/lib/menuShape";
import type { WritingFocusSettings } from "../lib/writingFocus";
import { useWritingPreferences } from "@/lib/writingPreferences";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { BotanicalFlower } from "@/components/BotanicalFlowers";
import { flowerFor } from "@/lib/botanical";
import type { NoteEntry } from "@/lib/entries";
import type { NoteLock } from "@/lib/types";
import { editBody, readDraft } from "@/features/editor/lib/draft";
import { extractPdfText } from "@/features/editor/lib/pdf";
import { assertAttachable, attachmentLabel } from "@/features/editor/lib/attachments";
import { loadPastedImage } from "@/features/editor/lib/pastedImage";
import { imageAltFromFilename, type AvatarCrop } from "@/lib/image";
import { proofreadText } from "@/features/editor/lib/proofread";
import type { AppSession } from "@/lib/session";
import { NoteComments, type CommentAuthor } from "./NoteComments";
import { NoteHistory } from "./NoteHistory";
import { NoteOutline } from "./NoteOutline";
import { EditorToolbar } from "./EditorToolbar";
import { ManuscriptToolbar } from "./ManuscriptToolbar";
import { TitleField } from "./TitleField";
import { RichTextEditor, type RichTextEditorHandle } from "./RichTextEditor";
import { PageCover, PageIdentity, type PagePropertyValues } from "./PageProperties";
import { TITLE_TEXT } from "@/features/editor/lib/ydoc";
import type { HocuspocusProvider } from "@hocuspocus/provider";
import type * as Y from "yjs";
import type { Editor } from "@tiptap/core";
import { pageStyle, type PageSetup } from "@/lib/spaceShape";
import { setLiveTargets, useReferences, type Place } from "@/lib/documentContents";
import { adoptionsFor, sheetCounters } from "@/lib/references";

/** What a chapter of a document is framed by instead of a note's header:
 *  the page it is set on, the line over its title, and what comes after it. */
type InspectorTab = "headings" | "comments" | "versions";

export interface ManuscriptFrame {
  page: PageSetup;
  /** "Chapter 3", "Part II · Chapter 3". */
  eyebrow?: string;
  /** Previous and next chapter, under the last line. */
  footer?: ReactNode;
  /** The chapter's number when the document numbers its headings: they are
   *  drawn as 2.1, 2.1.1 by the stylesheet's counters, starting from it. */
  numbered?: number | null;
  /** The heading level the chapter's sections are written in. */
  topLevel?: number;
  /** Focus mode and typewriter scrolling, as the reader set them. */
  writing?: WritingFocusSettings;
  /** The document has footnotes on: Insert and ⌥⌘F offer one. */
  footnotes?: boolean;
}

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
  /** Open the conversation with the note. True when the note was reached from
   *  Remarks, where the remark is the reason you are here at all. */
  startWithComments?: boolean;
  /** Whether this browser offers the on-device proofreader at all. */
  proofreaderEnabled: boolean;
  /** Whether the accent-and-apostrophe correction runs while you type. */
  autocorrectEnabled: boolean;
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
  /** What the header says about the note — the save readout. It stands beside
   *  the controls rather than inside them: a dock magnifies what a pointer can
   *  press, and this is not a button. */
  headerStatus?: ReactNode;
  /** Who else is in the note. It belongs at the header's leading edge, with
   *  the window navigation rather than either group of note actions. */
  headerPresence?: ReactNode;
  headerActions?: ReactNode;
  /** A document's bar only: what stands before the formatting — the way back
   *  to the structure, where a hand looks for it first. */
  headerLead?: ReactNode;
  /** Right-click on the page, but never on the words themselves. */
  onContextMenu?: (event: MouseEvent) => void;
  onUpdatePageProperties?: (values: PagePropertyValues) => Promise<void>;
  /** The note's photo, set, re-cut or (null) taken off — as the row menu does. */
  onSetPhoto?: (noteId: string, file: File | null, crop?: AvatarCrop) => void;
  collaboration?: { document: Y.Doc; provider: HocuspocusProvider | null } | null;
  /** Every note `[[` can reach from this one, and the notes that reach this
   *  one. Both absent where there is no archive behind the page. */
  linkable?: { id: string; title: string }[];
  backlinks?: { id: string; title: string }[];
  onOpenNote?: (noteId: string, passage?: string) => void;
  /** Start a note from the chosen words of this chapter. Book only. */
  onContinueAsNote?: (quote: string) => void;
  /** A remark was added, resolved or deleted here. */
  onRemarksChanged?: () => void;
  /** A chapter of a document rather than a note: a page and a writing bar
   *  instead of a cover, a header and a foot of links. */
  manuscript?: ManuscriptFrame;
}

/* The toolbar's three groups — the mode label, the format cluster, the save
   readout and its actions — need about this much room side by side. Under it
   the cluster takes a row of its own, the way the phone already gives it one.
   Measured, not guessed: the cluster is 174px and the readout with the
   actions 233px — 455 on one strip with its padding — and centring the one needs that much on either side.
   It was 810 while the presence pill stood at the left of the strip; the
   faces moved to the sidebar's shelf and took that room back. */
const TOOLBAR_ROOM = 700;

/* Under TOOLBAR_ROOM the cluster can no longer be centred on the pane, but it
   still fits on the one strip beside the other two groups — and a strip that
   stays 52px is a hairline that stays level with the two columns beside it.
   A 1280px window with both navigation columns open leaves the editor about
   650px, which is here; a second row is kept for a pane narrower than any
   window with both columns open can make. */
const TOOLBAR_ROW_ROOM = 460;

export interface NoteEditorHandle {
  openFind: (query?: string) => void;
  savePdf: () => void;
  saveDocx: () => void;
  /** With a version id, that version is opened in the list. */
  openHistory: (versionId?: string) => void;
  openComments: () => void;
  openLink: () => void;
  drawOnPage: () => void;
  /** Go to the first place these words occur — once they are there, which
   *  for a note just opened is after its document has arrived. */
  reveal: (place: Place) => void;
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
    startWithComments = false,
    proofreaderEnabled,
    autocorrectEnabled,
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
    headerPresence,
    headerActions,
    headerLead,
    onContextMenu,
    onUpdatePageProperties,
    onSetPhoto,
    collaboration = null,
    linkable,
    backlinks,
    onOpenNote,
    onRemarksChanged,
    onContinueAsNote,
    manuscript,
  },
  ref,
) {
  const [instance, setInstance] = useState<Editor | null>(null);
  /** The colour of a document's sheet is the reader's, like the theme. */
  const sheet = useWritingPreferences();
  /** The inspector reopens on the tab it was closed on. */
  const lastTab = useRef<InspectorTab>("headings");
  /* ⌥⌘I, Pages' key for its inspector. Read by `code`, because ⌥I is a dead
     key on a Mac keyboard and `key` arrives as a circumflex. */
  const toggleInspector = useRef(() => {});
  const isManuscript = Boolean(manuscript);
  useEffect(() => {
    if (!isManuscript) return;
    const press = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.altKey && event.code === "KeyI") {
        event.preventDefault();
        toggleInspector.current();
      }
    };
    window.addEventListener("keydown", press);
    return () => window.removeEventListener("keydown", press);
  }, [isManuscript]);
  /* Words asked for from ⌘K. Held until the document holds them: a note just
     opened is an empty editor until its document syncs. Tried every 150 ms
     and given up on after a few seconds, so a passage deleted in the
     meantime does not pull the caret away later. */
  const revealing = useRef<Place | null>(null);
  const [revealAsked, setRevealAsked] = useState(0);
  useEffect(() => {
    const place = revealing.current;
    if (!place) return;
    let tries = 0;
    const timer = window.setInterval(() => {
      const found =
        typeof place === "string"
          ? editorRef.current?.reveal(place)
          : "passage" in place
            ? editorRef.current?.flashPassage(place.passage)
            : editorRef.current?.revealTarget(place);
      if (found || ++tries > 50) {
        revealing.current = null;
        window.clearInterval(timer);
      }
    }, 150);
    return () => window.clearInterval(timer);
  }, [revealAsked]);
  const [replaceTerm, setReplaceTerm] = useState("");
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkLabel, setLinkLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkError, setLinkError] = useState("");
  const [status, setStatus] = useState("");
  const [failure, setFailure] = useState("");
  const [commentsOpen, setCommentsOpen] = useState(startWithComments);
  const [outlineOpen, setOutlineOpen] = useState(false);
  /* The comments' column, not a second one beside it: one panel at a time. */
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyFocus, setHistoryFocus] = useState<string | null>(null);
  useEffect(() => {
    if (commentsOpen) setHistoryOpen(false);
  }, [commentsOpen]);
  /* The scrolling column, handed to the outline so it can ask both questions
     it has — what the headings say, and where they are — of one element. */
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  /* A passage the bubble menu has just anchored, waiting for its first remark.
     It exists in the document and not yet in the archive, which is why it is
     held here rather than being read back with the rest. */
  const [pendingThread, setPendingThread] = useState<string | null>(null);
  const [passageMenu, setPassageMenu] = useState<MenuPoint | null>(null);
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

  /* A document's references, counted across every chapter: where this
     sheet's counters start, the footnotes listed at its foot, and the ids
     references from other chapters are waiting for this one to give. */
  const references = useReferences();
  const noteId = entry?.note.id ?? "";
  const starts = sheetCounters(references.counted, noteId);
  const chapterFootnotes = isManuscript
    ? (references.counted.get(noteId)?.targets ?? []).filter((target) => target.kind === "footnote")
    : [];
  const adoptions =
    isManuscript && canEdit && synced
      ? adoptionsFor(references.chapters, references.counted, noteId)
      : [];
  const adoptionKey = adoptions.map((adoption) => adoption.id).join(" ");
  const adoptionsRef = useRef(adoptions);
  adoptionsRef.current = adoptions;
  useEffect(() => {
    if (adoptionKey) editorRef.current?.adopt(adoptionsRef.current);
  }, [adoptionKey]);
  useEffect(() => () => setLiveTargets(noteId, null), [noteId]);

  const [shellWidth, setShellWidth] = useState<number | null>(null);

  const shellRef = useCallback((node: HTMLElement | null) => {
    if (!node) return;
    setShellWidth(node.getBoundingClientRect().width);
    const observer = new ResizeObserver(([box]) => setShellWidth(box.contentRect.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const exportAs = async (format: "pdf" | "docx") => {
    if (!entry) return;
    setFailure("");
    setStatus("Exporting…");
    try {
      await editorRef.current?.exportNote(
        format,
        readDraft(entry.note.id)?.title ?? entry.note.title,
      );
      report("Note exported");
    } catch (error) {
      setStatus("");
      setFailure(error instanceof Error ? error.message : "Could not export note");
    }
  };

  useImperativeHandle(ref, () => ({
    savePdf() {
      void exportAs("pdf");
    },
    saveDocx() {
      void exportAs("docx");
    },
    openHistory(versionId) {
      setCommentsOpen(false);
      setHistoryFocus(versionId ?? null);
      setHistoryOpen(true);
    },
    openComments() {
      setQuotes(editorRef.current?.commentQuotes() ?? new Map());
      setCommentsOpen(true);
    },
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
    /* Taking up the pen without going to the menu for it. The command is the
       same one the menu runs, so there is one path in and one place it can be
       wrong. */
    drawOnPage() {
      editorRef.current?.format("drawing-page");
    },
    reveal(place) {
      revealing.current = place;
      setRevealAsked((count) => count + 1);
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
      setStatus("Attaching file…");
      const objectId = await onUploadFile(file);
      editorRef.current?.insertAttachment(attachmentLabel(file.name), objectId);
      report("File attached");
    } catch (error) {
      setStatus("");
      setFailure(error instanceof Error ? error.message : "Could not attach the file");
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
      onExport={(format) => void exportAs(format)}
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

  /* Centred over the pane while there is room for that, then on the one strip
     beside the other groups, and only then a row of its own — never two rows
     of its own: the save state stays on the first row and gives up letters
     rather than taking a third. A note with no toolbar is one row always. */
  const toolbarLayout: "centred" | "row" | "stacked" = !toolbar
    ? "row"
    : mobile
      ? "stacked"
      : shellWidth === null || shellWidth >= TOOLBAR_ROOM
        ? "centred"
        : shellWidth >= TOOLBAR_ROW_ROOM
          ? "row"
          : "stacked";

  const fileInputs = (
    <>
      <input
        ref={attachPdfRef}
        type="file"
        accept="application/pdf,video/mp4,video/webm,video/quicktime,.pdf,.mp4,.webm,.mov"
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
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif"
        className="hidden"
        onChange={(event) => void handleImage(event.target.files?.[0])}
      />
    </>
  );

  const syncCommentResolution = useCallback((threadId: string, resolved: boolean) => {
    editorRef.current?.setCommentResolved(threadId, resolved);
  }, []);

  /* A note opened from Remarks arrives with its conversation showing. This
     component is not rebuilt per note — only its `section` is keyed — so the
     initial state above answers for the first note only, and this answers for
     every one after it. */
  useEffect(() => {
    if (startWithComments) setCommentsOpen(true);
  }, [entry?.note.id, startWithComments]);

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
        {(navigationAction || headerStatus || headerPresence || headerActions) && (
          <header className="editor-toolbar flex h-13 shrink-0 items-center px-4">
            {navigationAction && (
              <span className="flex items-center gap-1">{navigationAction}</span>
            )}
            <span className="ml-auto flex items-center gap-1">
              {headerStatus}
              {headerPresence}
              {headerActions}
            </span>
          </header>
        )}
        {/* The plant off the door, grown to the height of the pane: the one
            authored drawing this app has, spent on the one surface that has
            nothing else to say. Behind the line and never over it, and turning
            with the day rather than with the note, so a page arrived at twice
            in a minute is the same page.

            It draws itself in every time, exactly as it does on the door —
            unlike the tailpiece, which is a mark at the end of something you
            were reading and would restage under your eyes. Here there is
            nothing to read, so the drawing is what there is to watch.

            The line is the command. A coloured button in the middle of an
            empty page reads as a form; a line reads as an invitation. */}
        <div className="editor-empty flex flex-1 items-center justify-center px-8">
          <BotanicalFlower
            flower={flowerFor(new Date().toDateString())}
            className="is-empty-page"
          />
          <button onClick={onNew} className="editor-empty-invite font-display">
            Write a new one · N
          </button>
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

  /* A right-click on words already chosen offers what can be done with them.
     Without a selection the system's own menu stays — spelling, paste —
     because there is nothing for a comment to be about. */
  const onPassageMenu = (event: ReactMouseEvent) => {
    if (!canComment && !onContinueAsNote) return;
    const chosen = window.getSelection();
    if (!chosen || chosen.isCollapsed || !chosen.toString().trim()) return;
    if (!(event.target as HTMLElement).closest(".rich-text-content")) return;
    event.preventDefault();
    setPassageMenu({ x: event.clientX, y: event.clientY });
  };
  const passageMenuItems: MenuItem[] = [
    ...(canComment
      ? [
          {
            kind: "item" as const,
            id: "comment",
            label: "Comment",
            icon: <MessageSquarePlus size={16} />,
            run: startComment,
          },
        ]
      : []),
    ...(onContinueAsNote
      ? [
          {
            kind: "item" as const,
            id: "continue",
            label: "Continue as note",
            icon: <NotebookPen size={16} />,
            run: () => {
              const quote = window.getSelection()?.toString().trim();
              if (quote) onContinueAsNote(quote);
            },
          },
        ]
      : []),
    { kind: "separator" },
    {
      kind: "item",
      id: "copy",
      label: "Copy",
      icon: <Copy size={16} />,
      run: () => void navigator.clipboard.writeText(window.getSelection()?.toString() ?? ""),
    },
  ];
  const passageMenuLayer = passageMenu && (
    <PointMenu point={passageMenu} items={passageMenuItems} close={() => setPassageMenu(null)} />
  );

  const updatePageProperties = (values: PagePropertyValues) => {
    void onUpdatePageProperties?.(values).catch((reason) =>
      setFailure(reason instanceof Error ? reason.message : "Could not update this page"),
    );
  };

  const findBar = findOpen && (
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
        onClick={() => setFindStatus(editorRef.current?.findPrevious() ?? { current: 0, total: 0 })}
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
      {manuscript && canEdit && instance && (
        <span className="find-replace">
          <input
            value={replaceTerm}
            onChange={(event) => {
              setReplaceTerm(event.target.value);
              instance.commands.setReplaceTerm(event.target.value);
            }}
            placeholder="Replace with"
            aria-label="Replace with"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-4"
          />
          <button
            type="button"
            className="menu-small-button"
            disabled={!findStatus.total}
            onClick={() => {
              instance.commands.replace();
              setFindStatus(editorRef.current?.setSearch(findQuery) ?? { current: 0, total: 0 });
            }}
          >
            Replace
          </button>
          <button
            type="button"
            className="menu-small-button"
            disabled={!findStatus.total}
            onClick={() => {
              instance.commands.replaceAll();
              setFindStatus(editorRef.current?.setSearch(findQuery) ?? { current: 0, total: 0 });
            }}
          >
            All
          </button>
        </span>
      )}
    </div>
  );

  /* In a book the inspector keeps all three mounted while it is open and only
     shows one: switching tabs used to unmount the others, so each switch read
     its comments or versions again and the column jumped from "Loading…" to
     the list every time. */
  const keepPanels = Boolean(manuscript && (outlineOpen || commentsOpen || historyOpen));
  const outlinePanel = (outlineOpen || keepPanels) && (
    <NoteOutline scroller={scroller} onClose={() => setOutlineOpen(false)} />
  );
  const historyPanel = (historyOpen || keepPanels) && session && (
    <NoteHistory
      key={`${entry.note.id}:${historyFocus ?? ""}`}
      initialOpenId={historyFocus}
      session={session}
      noteId={entry.note.id}
      canEdit={canEdit}
      authors={commentAuthors ?? new Map()}
      current={() => {
        const content = editorRef.current?.getContent();
        const title = collaboration?.document.getText(TITLE_TEXT).toString();
        return content && title !== undefined ? { title, content } : null;
      }}
      onRestore={({ title, content }) => {
        const yTitle = collaboration?.document.getText(TITLE_TEXT);
        if (yTitle && yTitle.toString() !== title)
          collaboration!.document.transact(() => {
            yTitle.delete(0, yTitle.length);
            yTitle.insert(0, title);
          });
        editorRef.current?.replaceContent(content);
        onEdited();
      }}
      onClose={() => setHistoryOpen(false)}
    />
  );
  const commentsPanel = (commentsOpen || keepPanels) && session && commentAuthors && (
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
      onChanged={onRemarksChanged}
    />
  );
  const sidePanels = (
    <>
      {outlinePanel}
      {historyPanel}
      {commentsPanel}
    </>
  );

  /* A document's inspector: the three panels as tabs of one column, as a
     long piece of writing keeps them — Word's navigation, comments and
     versions in one place, one press away, one at a time. A note keeps its
     separate panels. Which tab is open is simply which panel is: the handle's
     `openHistory` and `openComments` open their tab without knowing there is
     an inspector at all. */
  const inspectorTab: InspectorTab | null = historyOpen
    ? "versions"
    : commentsOpen
      ? "comments"
      : outlineOpen
        ? "headings"
        : null;
  const showTab = (tab: InspectorTab | null) => {
    if (tab) lastTab.current = tab;
    /* Closing the inspector cancels a note not yet written; looking at
       another tab only puts it aside. It used to cancel it too, so a glance
       at the headings meant choosing the words all over again. */
    if (!tab) closeComments();
    else if (tab !== "comments" && commentsOpen) setCommentsOpen(false);
    setOutlineOpen(tab === "headings");
    setHistoryOpen(tab === "versions");
    if (tab === "versions") setHistoryFocus(null);
    if (tab === "comments" && !commentsOpen) {
      setQuotes(editorRef.current?.commentQuotes() ?? new Map());
      setCommentsOpen(true);
    }
  };
  toggleInspector.current = () => showTab(inspectorTab ? null : lastTab.current);
  const inspectorTabs: { id: InspectorTab; name: string; shown: boolean }[] = [
    { id: "headings", name: "Headings", shown: true },
    {
      id: "comments",
      name: "Comments",
      shown: Boolean(session && commentAuthors),
    },
    { id: "versions", name: "Versions", shown: Boolean(session) },
  ];

  if (manuscript)
    return (
      <section
        key={entry.note.id}
        ref={shellRef}
        className={`editor-shell manuscript-shell flex min-w-0 flex-1 flex-col ${mobile ? "is-mobile" : ""}`}
      >
        <div className="manuscript-bar relative shrink-0">
          {headerLead}
          {canEdit ? (
            <ManuscriptToolbar
              editor={instance}
              noteId={entry.note.id}
              footnotes={Boolean(manuscript.footnotes)}
              page={manuscript.page}
              onLink={openLinkForm}
              onImage={() => imageRef.current?.click()}
            />
          ) : (
            <span className="manuscript-bar-quiet">{headerStatus}</span>
          )}
          {/* Finding, remarks and versions at the right: the formatting row
              is for the words. Nothing that reads as a status stands here —
              the bar is tools, and a line of text in it pushed the ribbon
              onto a second row. Headings are in the structure, and the whole
              inspector is still ⌥⌘I. */}
          <span className="manuscript-bar-end">
            <button
              type="button"
              className={`ribbon-tool press ${findOpen ? "is-active" : ""}`}
              aria-label="Find and replace"
              title={`Find and replace · ${keyName("⌘F")}`}
              onClick={() => {
                setFindOpen(true);
                window.setTimeout(() => findRef.current?.focus(), 0);
              }}
            >
              <Search size={16} />
            </button>
            {session && commentAuthors && (
              <button
                type="button"
                className={`ribbon-tool press ${inspectorTab === "comments" ? "is-active" : ""}`}
                aria-label="Comments"
                aria-pressed={inspectorTab === "comments"}
                title="Comments"
                onClick={() => showTab(inspectorTab === "comments" ? null : "comments")}
              >
                <MessageSquare size={16} />
              </button>
            )}
            {session && (
              <button
                type="button"
                className={`ribbon-tool press ${inspectorTab === "versions" ? "is-active" : ""}`}
                aria-label="Versions"
                aria-pressed={inspectorTab === "versions"}
                title="Versions"
                onClick={() => showTab(inspectorTab === "versions" ? null : "versions")}
              >
                <History size={16} />
              </button>
            )}
            {headerActions}
          </span>
          {linkOpen && <div className="manuscript-link">{linkForm}</div>}
        </div>

        {fileInputs}
        {findBar}
        {passageMenuLayer}

        <div className="editor-body flex min-h-0 flex-1">
          {/* The desk, and the sheet on it. The sheet is the page the
              document is set on — its width, its margins, its letter — so
              what is written here is what prints. */}
          <div
            ref={setScroller}
            className="manuscript-desk min-h-0 flex-1"
            onContextMenu={onPassageMenu}
          >
            <article
              className={`manuscript-sheet ${manuscript.numbered ? "is-numbered" : ""}`}
              data-top={manuscript.topLevel ?? 1}
              data-tone={sheet.sheetTone}
              data-ink={sheet.adaptInk ? "adapt" : "keep"}
              style={{
                ...pageStyle(manuscript.page),
                ...({
                  "--footnote-start": starts.footnote,
                  "--figure-start": starts.figure,
                  "--table-start": starts.table,
                } as CSSProperties),
                ...(manuscript.numbered
                  ? ({ "--chapter": manuscript.numbered } as CSSProperties)
                  : {}),
              }}
            >
              {manuscript.eyebrow && <p className="manuscript-eyebrow">{manuscript.eyebrow}</p>}
              <TitleField
                mobile={mobile}
                noteId={entry.note.id}
                canEdit={canEdit}
                titleRef={titleRef}
                onEdited={onEdited}
                onDone={() => editorRef.current?.focus()}
                yTitle={collaboration?.document.getText(TITLE_TEXT) ?? null}
                synced={synced}
              />
              {(status || failure) && (
                <p
                  role={failure ? "alert" : "status"}
                  className={`manuscript-status ${failure ? "text-danger" : ""}`}
                >
                  {failure || status}
                </p>
              )}
              {collaboration ? (
                <RichTextEditor
                  key={entry.note.id}
                  ref={editorRef}
                  manuscript
                  writing={manuscript.writing}
                  noteId={entry.note.id}
                  footnotes={manuscript.footnotes}
                  onTargets={(targets) => setLiveTargets(entry.note.id, targets)}
                  onEditor={setInstance}
                  value={readDraft(entry.note.id)?.content ?? entry.note.content}
                  revision={syncRevision}
                  readOnly={!canEdit}
                  placeholder="Begin the chapter…"
                  onChange={(content, body) => {
                    if (!canEdit) return;
                    editBody(entry.note.id, body, content);
                    onEdited();
                  }}
                  onLocalEdit={onEdited}
                  onPasteImage={handlePastedImage}
                  onPasteImageSource={async (src) =>
                    handlePastedImage(await loadPastedImage(src, entry.note.id))
                  }
                  onPasteError={setFailure}
                  onOpenLink={openLinkForm}
                  onComment={canComment ? startComment : undefined}
                  onContinueAsNote={onContinueAsNote}
                  writeLockOwner={canEdit && session ? session.userId : null}
                  mobile={mobile}
                  autocorrectOn={autocorrectEnabled}
                  resolveImage={resolveImage}
                  resolveFile={resolveFile}
                  collaboration={collaboration}
                  notes={linkable}
                  onOpenNote={onOpenNote}
                  onOpenComment={(threadId) => {
                    setQuotes(editorRef.current?.commentQuotes() ?? new Map());
                    setCommentsOpen(true);
                    setFocusThread(threadId);
                  }}
                />
              ) : (
                <div className="note-body-waiting" aria-hidden="true">
                  <div className="skeleton" style={{ width: "92%" }} />
                  <div className="skeleton" style={{ width: "78%" }} />
                  <div className="skeleton" style={{ width: "45%" }} />
                </div>
              )}
              {/* The chapter's footnotes, as Word's print layout puts them
                  at the foot of the page: a short rule, then each note. The
                  number is the one its mark in the text is drawn with. */}
              {chapterFootnotes.length > 0 && (
                <section className="sheet-footnotes" aria-label="Footnotes">
                  <ol>
                    {chapterFootnotes.map((note) => (
                      <li key={note.index}>
                        <button
                          type="button"
                          className="sheet-footnote"
                          onClick={() =>
                            editorRef.current?.revealTarget({
                              kind: "footnote",
                              id: note.id,
                              index: note.index,
                            })
                          }
                        >
                          <span className="sheet-footnote-number">{note.number}</span>
                          <span className={note.text ? "" : "is-empty"}>
                            {note.text || "Empty footnote"}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ol>
                </section>
              )}
            </article>
            {manuscript.footer}
          </div>
          {inspectorTab && (
            <aside className="manuscript-inspector" aria-label="Inspector">
              <div className="inspector-tabs" role="tablist">
                {inspectorTabs
                  .filter((tab) => tab.shown)
                  .map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={inspectorTab === tab.id}
                      className={`press ${inspectorTab === tab.id ? "is-active" : ""}`}
                      onClick={() => showTab(tab.id)}
                    >
                      {tab.name}
                    </button>
                  ))}
                <button
                  type="button"
                  className="inspector-close press"
                  aria-label="Close the inspector"
                  onClick={() => showTab(null)}
                >
                  <X size={16} />
                </button>
              </div>
              <div className="inspector-pane" hidden={inspectorTab !== "headings"}>
                {outlinePanel}
              </div>
              <div className="inspector-pane" hidden={inspectorTab !== "comments"}>
                {commentsPanel}
              </div>
              <div className="inspector-pane" hidden={inspectorTab !== "versions"}>
                {historyPanel}
              </div>
            </aside>
          )}
        </div>
      </section>
    );

  return (
    <section
      key={entry.note.id}
      ref={shellRef}
      onContextMenu={handlePageContextMenu}
      className={`editor-shell flex min-w-0 flex-1 flex-col ${mobile ? "mobile-editor h-full w-full border-0 bg-page" : "soft-pane pane-page"}`}
    >
      {/* Frontispiece — set over the measure the body will use. */}
      <div
        className={`editor-toolbar relative shrink-0 px-4 ${
          toolbarLayout === "centred"
            ? "grid h-13 grid-cols-[minmax(0,1fr)_auto_minmax(max-content,1fr)] items-center gap-2"
            : toolbarLayout === "row"
              ? "grid h-13 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2"
              : "editor-toolbar-stacked grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2"
        }`}
      >
        {/* What the window is doing, and nothing else. Add cover stood here
            too — an act on the note, labelled, as far from the ⋯ menu that
            carries the note's other acts as the window is wide — and it is in
            that menu now. */}
        <span className="flex min-w-0 items-center gap-2">
          {navigationAction && <span className="flex items-center gap-1">{navigationAction}</span>}
          {headerPresence}
        </span>

        {/* A wide enough editor keeps the cluster optically centred over the
            measure. A middle grid column centres it exactly as `position:
            absolute` used to, and unlike absolute it occupies room: centred
            over a 632px editor the cluster ran fifteen pixels underneath the
            save readout, and no width of readout could have avoided it. */}
        {toolbarLayout !== "stacked" &&
          (toolbar ? <div className="justify-self-center">{toolbar}</div> : <span />)}

        {/* In a narrow pane the writing controls have a centred row of their
            own, leaving the status and page actions unobstructed. */}
        {toolbarLayout === "stacked" && (
          <div className="editor-toolbar-compact-tools">{toolbar}</div>
        )}

        <span
          className={`flex min-w-0 items-center justify-end gap-2 justify-self-end ${
            toolbarLayout === "stacked" ? "w-full" : ""
          }`}
        >
          {/* Everything the note says about itself, in one place. It used to
              say it in two: whether you may write it at the far left of the
              strip, whether it is saved at the far right — one kind of thing,
              two corners. Who else is here starts the header beside the
              window navigation.

              No pill on any of it. The readout, the state and the faces are
              what the header says, not what it does, and a pill around
              something that never moves and cannot be pressed only offers to
              be pressed. They stay out of the dock beside them for the same
              reason: a dock carrying them would be moving its icons around
              three things that are not icons. */}
          <span className="flex min-w-0 items-center gap-2">{headerStatus}</span>
          <span
            className={`flex shrink-0 items-center justify-end gap-1 ${
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

      {fileInputs}

      {findBar}
      {passageMenuLayer}

      {/* The cover, the frontispiece and the text scroll as one column. The
          cover used to be pinned above the scrolling text, which on a laptop
          left the note itself a slot a few lines deep and no way to push the
          picture out of the way. */}
      {/* `page-in` belongs to the column, never to the pane. On the pane it was
          an `opacity: 0` on the one element carrying `background: var(--page)`,
          so the first frames of every note switch showed the reader's wallpaper
          through a hole where the page should be. */}
      <div className="editor-body flex min-h-0 flex-1">
        <div
          ref={setScroller}
          className="editor-scroll page-in min-h-0 flex-1"
          onContextMenu={onPassageMenu}
        >
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
                {/* The note's time used to stand here, centred over the title.
                    It was meant as the caption of the page and read as a line
                    with nothing under it — a date floating in the gap between
                    the toolbar and the words. It is in the editor header now,
                    in the slot that already reports on this note; see
                    `saveReadout` in `Notes.tsx`. */}
                <PageIdentity
                  photo={entry.note.photo}
                  cover={entry.note.cover}
                  resolveImage={resolveImage}
                  onSetPhoto={
                    canEdit && onSetPhoto
                      ? (file, crop) => onSetPhoto(entry.note.id, file, crop)
                      : undefined
                  }
                />
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
                  onDone={() => editorRef.current?.focus()}
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
                onPasteImageSource={async (src) =>
                  handlePastedImage(await loadPastedImage(src, entry.note.id))
                }
                onPasteError={setFailure}
                onOpenLink={openLinkForm}
                onComment={canComment ? startComment : undefined}
                onContinueAsNote={onContinueAsNote}
                /* Locking a passage is the smaller half of locking the note,
                   and it is offered on the same terms: only where this account
                   may write at all. */
                writeLockOwner={canEdit && session ? session.userId : null}
                mobile={mobile}
                autocorrectOn={autocorrectEnabled}
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
                      <Link2 size={12} />
                      {note.title || "Untitled"}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {collaboration && <NoteTailpiece noteId={entry.note.id} />}
          </div>
        </div>

        {sidePanels}
      </div>
    </section>
  );
});
