import {
  Check,
  ChevronLeft,
  Code2,
  Copy,
  GripVertical,
  Link,
  Lock,
  LockOpen,
  MessageSquarePlus,
  NotebookPen,
} from "@/components/icons";
import { commentQuotes } from "@/features/editor/lib/commentAnchors";
import {
  BASE_EXTENSIONS,
  TEXT_COLOR_VALUE,
  WRITE_LOCK_MARK,
  richTextToPlainText,
  type TextColor,
} from "@/features/editor/lib/content";
import { mediaPaste } from "@/features/editor/lib/paste";
import {
  UniqueReferenceTargets,
  adoptTargets,
  findTarget,
  footnoteKeys,
  openFootnoteAt,
} from "@/features/editor/lib/referenceMarks";
import { inlinePastedStyles, reflowPasted } from "@/features/editor/lib/reflow";
import { BODY_FRAGMENT } from "@/features/editor/lib/ydoc";
import { anchoredBlock, blockId } from "@/lib/blockLinks";
import { openPlace } from "@/lib/documentContents";
import { targetsOf } from "@/lib/references";
import { type FocusPosition, type JSONContent } from "@tiptap/core";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import DragHandle from "@tiptap/extension-drag-handle-react";
import { FindAndReplace } from "@tiptap/extension-find-and-replace";
import Placeholder from "@tiptap/extension-placeholder";
import Typography from "@tiptap/extension-typography";
import { NodeSelection } from "@tiptap/pm/state";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { ySyncPluginKey } from "y-prosemirror";
import { UniqueBlockAnchors } from "../lib/blockAnchors";
import { suggestionsExtension, type SuggestionMode } from "../lib/suggestions";
import { TAKE_UP_THE_PEN, requestDrawing } from "./drawingRequests";
import { noteLinkExtension, slashMenuExtension } from "./editorSuggestions";
import { ImageLightbox, ImagePreview } from "./ImageLightbox";
import {
  BibliographyWithView,
  CitationWithView,
  ContentsWithView,
  FootnoteWithView,
  VIEWED_ELSEWHERE,
  crossReferenceExtension,
  drawingExtension,
  privateFileExtension,
  privateImageExtension,
} from "./nodeViewExtensions";
import {
  PassageFlash,
  findPassage,
  passageFlashKey,
  unsaidCommentsExtension,
  unsaidKey,
  writeLockGuardExtension,
} from "./passageExtensions";
import {
  FormatAction,
  RichTextEditorHandle,
  RichTextEditorProps,
  SearchStatus,
} from "./RichTextEditor.types";
import {
  ManuscriptKeys,
  autocorrectExtension,
  capitalizeSentences,
  sentenceCapitalizeExtension,
} from "./textEditingExtensions";

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

export const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(
  function RichTextEditor(
    {
      value,
      readOnly,
      placeholder,
      revision = 0,
      onChange,
      onLocalEdit,
      onPasteImage,
      onPasteImageSource,
      onPasteError,
      onOpenLink,
      onComment,
      onContinueAsNote,
      writeLockOwner = null,
      saidThreads,
      notes,
      onOpenNote,
      onOpenComment,
      mobile = false,
      autocorrectOn = true,
      resolveImage,
      resolveFile,
      collaboration = null,
      onEditor,
      manuscript = false,
      noteId = "",
      footnotes = false,
      onTargets,
      suggesting,
    },
    ref,
  ) {
    const suggestingRef = useRef<SuggestionMode>({ on: false, author: "" });
    suggestingRef.current = suggesting ?? { on: false, author: "" };
    const suggestions = useMemo(() => suggestionsExtension(() => suggestingRef.current), []);
    const [preview, setPreview] = useState<ImagePreview | null>(null);
    const onChangeRef = useRef(onChange);
    const onLocalEditRef = useRef(onLocalEdit);
    const onPasteImageRef = useRef(onPasteImage);
    const pasteSourceRef = useRef(onPasteImageSource);
    pasteSourceRef.current = onPasteImageSource;
    const pasteErrorRef = useRef(onPasteError);
    pasteErrorRef.current = onPasteError;
    const appliedRevision = useRef(revision);
    const formatRef = useRef<(action: FormatAction) => void>(() => undefined);
    onChangeRef.current = onChange;
    onLocalEditRef.current = onLocalEdit;
    onPasteImageRef.current = onPasteImage;

    const noteIdRef = useRef(noteId);
    noteIdRef.current = noteId;
    const mediaExtensions = useMemo(
      () => [
        privateImageExtension(
          resolveImage,
          (src, alt) => setPreview({ src, alt }),
          () => noteIdRef.current,
        ),
        privateFileExtension(resolveFile),
        drawingExtension(() => noteIdRef.current),
        mediaPaste({
          upload: (file) => onPasteImageRef.current?.(file) ?? Promise.resolve(null),
          load: (src) => pasteSourceRef.current?.(src) ?? Promise.resolve(null),
          error: (message) => pasteErrorRef.current?.(message),
        }),
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
    const flashTimer = useRef<number | undefined>(undefined);
    const onOpenNoteRef = useRef(onOpenNote);
    onOpenNoteRef.current = onOpenNote;
    const onOpenCommentRef = useRef(onOpenComment);
    onOpenCommentRef.current = onOpenComment;
    const noteLinks = useMemo(() => noteLinkExtension(notesRef), []);

    const writeLockOwnerRef = useRef<string | null>(writeLockOwner);
    writeLockOwnerRef.current = writeLockOwner;
    const writeLockGuard = useMemo(() => writeLockGuardExtension(writeLockOwnerRef), []);
    const saidThreadsRef = useRef(saidThreads);
    saidThreadsRef.current = saidThreads;
    const unsaidComments = useMemo(() => unsaidCommentsExtension(saidThreadsRef), []);

    const crossReferences = useMemo(() => crossReferenceExtension(() => noteIdRef.current), []);
    const footnotesRef = useRef(footnotes);
    footnotesRef.current = footnotes;
    const footnoteShortcut = useMemo(() => footnoteKeys(() => footnotesRef.current), []);
    const onTargetsRef = useRef(onTargets);
    onTargetsRef.current = onTargets;

    const sentenceCapitalize = useMemo(() => sentenceCapitalizeExtension(), []);
    const autocorrectEnabled = useRef(autocorrectOn);
    autocorrectEnabled.current = autocorrectOn;
    const autocorrect = useMemo(() => autocorrectExtension(autocorrectEnabled), []);

    const editor = useEditor(
      {
        extensions: [
          ...BASE_EXTENSIONS.filter((extension) => !VIEWED_ELSEWHERE.has(extension.name)),
          ContentsWithView,
          FootnoteWithView,
          CitationWithView,
          BibliographyWithView,
          crossReferences,
          UniqueReferenceTargets,
          ...(collaboration
            ? [
                Collaboration.configure({ document: collaboration.document, field: BODY_FRAGMENT }),
                ...(collaboration.provider
                  ? [
                      CollaborationCaret.configure({
                        provider: collaboration.provider,
                        user: { name: "You", color: "var(--accent)" },
                        /* The extension's own caret, plus whose it is — what
                         Follow looks for to keep somebody's caret in view. */
                        render: (user: { name?: string; color?: string; userId?: string }) => {
                          const caret = document.createElement("span");
                          caret.classList.add("collaboration-carets__caret");
                          caret.style.borderColor = user.color ?? "";
                          caret.dataset.caretUser = user.userId ?? "";
                          const label = document.createElement("div");
                          label.classList.add("collaboration-carets__label");
                          label.style.backgroundColor = user.color ?? "";
                          label.textContent = user.name ?? "";
                          caret.append(label);
                          return caret;
                        },
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
          UniqueBlockAnchors,
          writeLockGuard,
          unsaidComments,
          PassageFlash,
          sentenceCapitalize,
          autocorrect,
          ...(manuscript ? [ManuscriptKeys, footnoteShortcut, suggestions] : []),
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
          transformPastedHTML(html) {
            return inlinePastedStyles(html);
          },
          transformPasted(slice) {
            return reflowPasted(slice, { dropFonts: manuscript });
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
              /* A link inside a quotation is Continue as note's way back: it
               goes to the words, not only to the chapter. */
              const targetBlock = blockId(anchor?.getAttribute("data-block-ref"));
              if (targetBlock) {
                openPlace({ noteId, blockId: targetBlock });
                return true;
              }
              onOpenNoteRef.current(
                noteId,
                anchor?.closest("blockquote") ? (anchor.textContent ?? undefined) : undefined,
              );
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
            if (
              threadId &&
              onOpenCommentRef.current &&
              !commented?.querySelector(".comment-unsaid")
            ) {
              onOpenCommentRef.current(threadId);
              return false;
            }

            return false;
          },
        },
        /* The caret was put there by a person. It is a ref rather than state
         because nothing renders on it, and it needs no reset: the editor is
         keyed by note id, so a different note is a different instance. */
        onFocus() {
          caretPlaced.current = true;
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
          if (!transaction.getMeta(ySyncPluginKey))
            queueMicrotask(() => onLocalEditRef.current?.());
        },
      },
      [collaboration?.document, collaboration?.provider],
    );

    /* The set arrived or changed: draw the anchors again against it. */
    useEffect(() => {
      if (editor && !editor.isDestroyed)
        editor.view.dispatch(
          editor.state.tr.setMeta(unsaidKey, true).setMeta("addToHistory", false),
        );
    }, [editor, saidThreads]);

    /* What the selection's passage lock is, so the bubble's padlock can say it.
     The editor does not re-render per transaction; this re-renders only when
     the answer changes, which is when the selection crosses a lock edge. */
    const passageLock = useEditorState({
      editor,
      selector: ({ editor: current }) =>
        !current || !writeLockOwner
          ? "none"
          : current.isActive(WRITE_LOCK_MARK, { owner: writeLockOwner })
            ? "mine"
            : current.isActive(WRITE_LOCK_MARK)
              ? "theirs"
              : "none",
    });
    /* Bumped by the press and nothing else, so the shackle moves when the hand
     moved it — not every time the bubble appears over a locked passage. */
    const [latched, setLatched] = useState(0);
    /* The bubble's colours stand behind one button; pressed, the bar turns into
     them in place, and any new selection turns it back. */
    const [colorsOpen, setColorsOpen] = useState(false);
    useEffect(() => {
      if (!editor) return;
      const shut = () => setColorsOpen(false);
      editor.on("selectionUpdate", shut);
      return () => {
        editor.off("selectionUpdate", shut);
      };
    }, [editor]);

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
            chain
              .insertTable({ rows: 2, cols: Number(action.slice(-1)), withHeaderRow: true })
              .run();
          else if (action === "table-delete-column") chain.deleteColumn().run();
          else if (action === "table-delete-row") chain.deleteRow().run();
          else if (action === "table-delete") chain.deleteTable().run();
        } else if (action === "drawing") {
          requestDrawing("board");
          chain
            .insertContent({ type: "drawing", attrs: { strokes: "[]", surface: "board" } })
            .run();
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
          if (existing) editor.view.dom.dispatchEvent(new Event(TAKE_UP_THE_PEN));
          else {
            /* The view for this layer has not mounted yet, so there is nothing
             to announce it to. It reads this instead, once. */
            requestDrawing("page");
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

    /* Where something chosen from a menu goes when nobody has said where.
     Opening a note leaves the focus on the row in the list beside it, so the
     editor has never held the caret, and Tiptap's `focus()` then restores the
     selection the document mounted with — position zero. A video chosen from
     the Attachments menu therefore landed above the first line of the note,
     which in a note of any length is above the fold, while the status line
     said "File attached" either way. That is the whole of "a note that already
     has text will not take a video, a brand new note will": in a new note the
     top of the document is where you were already looking.

     A file chosen from a menu is an act on the note, so with no caret it goes
     at the end, the way an attachment is appended. Once the caret has been put
     somewhere it is what was meant, and it wins. Either way the chain ends by
     scrolling to what it made: `focus()` scrolls to the selection it restores,
     which is the one from *before* the insert, so without this the note stayed
     exactly where it was and nothing on screen changed. */
    const caretPlaced = useRef(false);
    const insertionPoint = useCallback(
      (): FocusPosition => (caretPlaced.current ? null : "end"),
      [],
    );

    useEffect(() => {
      onEditor?.(editor);
      return () => onEditor?.(null);
    }, [editor, onEditor]);

    /* What this chapter can be cited by, read out of the live document a
     quarter of a second after it stops changing — the projection is a save
     behind, and a caption written a moment ago is already citable. */
    const reportsTargets = Boolean(onTargets);
    useEffect(() => {
      if (!editor || !reportsTargets) return;
      let timer = 0;
      const report = () => onTargetsRef.current?.(targetsOf(editor.getJSON()));
      const changed = ({ transaction }: { transaction: { docChanged: boolean } }) => {
        if (!transaction.docChanged) return;
        window.clearTimeout(timer);
        timer = window.setTimeout(report, 250);
      };
      report();
      editor.on("transaction", changed);
      return () => {
        window.clearTimeout(timer);
        editor.off("transaction", changed);
      };
    }, [editor, reportsTargets]);

    /* Light a range for a moment, the caret left at its end. */
    const lightPassage = useCallback(
      (range: { from: number; to: number }) => {
        if (!editor) return false;
        editor.chain().focus().setTextSelection(range.to).run();
        editor.view.dispatch(editor.state.tr.setMeta(passageFlashKey, range));
        const { node } = editor.view.domAtPos(range.from);
        (node instanceof Element ? node : node.parentElement)?.scrollIntoView({
          block: "center",
          behavior: "smooth",
        });
        window.clearTimeout(flashTimer.current);
        flashTimer.current = window.setTimeout(() => {
          if (!editor.isDestroyed)
            editor.view.dispatch(editor.state.tr.setMeta(passageFlashKey, null));
        }, 2600);
        return true;
      },
      [editor],
    );

    useImperativeHandle(
      ref,
      () => ({
        getContent() {
          return editor ? editor.getJSON() : null;
        },
        replaceContent(content) {
          if (!editor || readOnly) return;
          editor.chain().setContent(content, { emitUpdate: true }).run();
        },
        async exportNote(format, title) {
          if (!editor) return;
          const { saveNoteExport } = await import("@/features/editor/lib/exportNote");
          await saveNoteExport(format, title, editor.getJSON(), editor.view.dom, resolveImage);
        },
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
          editor
            .chain()
            .focus(insertionPoint())
            .insertContent(paragraphs(text))
            .scrollIntoView()
            .run();
        },
        insertImage(objectId, alt) {
          if (!editor || readOnly) return;
          editor
            .chain()
            .focus(insertionPoint())
            .insertContent({ type: "privateImage", attrs: { objectId, alt } })
            .scrollIntoView()
            .run();
        },
        insertAttachment(label, objectId) {
          if (!editor || readOnly) return;
          editor
            .chain()
            .focus(insertionPoint())
            .insertContent({ type: "privateFile", attrs: { objectId, label } })
            .scrollIntoView()
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
        flashBlock(id) {
          if (!editor) return false;
          const range = anchoredBlock(editor.state.doc, id);
          return range ? lightPassage(range) : false;
        },
        paragraphIdAt(coords) {
          if (!editor) return null;
          const hit = editor.view.posAtCoords(coords);
          if (!hit) return null;
          const position = editor.state.doc.resolve(hit.pos);
          if (
            !position.parent.isTextblock ||
            !Object.hasOwn(position.parent.attrs, "blockId") ||
            !position.parent.textContent.trim()
          )
            return null;
          const existing = blockId(position.parent.attrs.blockId);
          if (existing) return existing;
          if (readOnly) return null;
          const id = crypto.randomUUID();
          const pos = position.before();
          editor.view.dispatch(editor.state.tr.setNodeAttribute(pos, "blockId", id));
          return editor.state.doc.nodeAt(pos)?.attrs.blockId === id ? id : null;
        },
        flashPassage(text) {
          if (!editor) return false;
          const words = text.trim();
          /* The quote may have been edited since it was carried out; its
           opening is the likeliest part to have survived. */
          const range =
            findPassage(editor.state.doc, words) ??
            (words.length > 60 ? findPassage(editor.state.doc, words.slice(0, 60)) : null);
          if (!range) return false;
          return lightPassage(range);
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
        revealTarget(target) {
          if (!editor) return false;
          const found = findTarget(editor.state.doc, target);
          if (!found) return false;
          /* After a footnote's number, at the start of a heading or caption. */
          editor
            .chain()
            .focus(undefined, { scrollIntoView: false })
            .setTextSelection(found.pos + 1)
            .run();
          const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          (editor.view.nodeDOM(found.pos) as HTMLElement | null)?.scrollIntoView?.({
            block: "center",
            behavior: still ? "auto" : "smooth",
          });
          if (found.node.type.name === "footnote") openFootnoteAt(found.pos);
          return true;
        },
        adopt(adoptions) {
          if (editor) adoptTargets(editor, adoptions);
        },
        reveal(text) {
          if (!editor) return false;
          editor.commands.setSearchTerm(text);
          const found = editor.storage.findAndReplace.results.length > 0;
          if (found) editor.commands.goToNextResult();
          const { from, to } = editor.state.selection;
          editor.commands.clearSearch();
          const { node } = editor.view.domAtPos(from);
          const block = (node instanceof Element ? node : node.parentElement)?.closest(
            "h1, h2, h3, h4, p, li",
          );
          /* Words inside a passage are lit where they stand, the way a remark's
           passage is; a heading is a place, and only goes to the top. */
          if (found && block && !/^H\d$/.test(block.tagName)) return lightPassage({ from, to });
          if (found) {
            /* The caret at the start, not the words selected: a heading left
             highlighted reads as something about to be replaced. */
            editor.commands.setTextSelection(editor.state.selection.from);
            editor.commands.focus(undefined, { scrollIntoView: false });
            /* To the top of the page, not just inside it: a heading pulled
             only as far as the bottom edge reads as nothing having moved. */
            block?.scrollIntoView({ block: "start", behavior: "smooth" });
          }
          return found;
        },
        focus() {
          editor?.commands.focus();
        },
      }),
      [editor, format, insertionPoint, lightPassage, readOnly, resolveImage],
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

    /* Where a web link goes, at the window's foot while the pointer is on it —
     the browser's own status bubble, which a desktop window does not have. A
     browser already shows it, so only the desktop shell gets this one. */
    const [peek, setPeek] = useState<string | null>(null);
    useEffect(() => {
      if (!editor || !document.documentElement.dataset.shell) return;
      const dom = editor.view.dom;
      const over = (event: MouseEvent) => {
        const link = (event.target as Element).closest?.("a[href]:not(.note-link)");
        setPeek(link ? (link as HTMLAnchorElement).href : null);
      };
      const out = () => setPeek(null);
      dom.addEventListener("mouseover", over);
      dom.addEventListener("mouseleave", out);
      return () => {
        dom.removeEventListener("mouseover", over);
        dom.removeEventListener("mouseleave", out);
      };
    }, [editor]);

    /* A code block offers its text to copy from its top corner while the
     pointer is on it: code is the one thing in a note taken out whole. The
     button lives outside the document, so leaving the block for the button
     does not take the button away. */
    const [code, setCode] = useState<{ block: HTMLElement; top: number; right: number } | null>(
      null,
    );
    const [codeCopied, setCodeCopied] = useState(false);
    const copyButton = useRef<HTMLButtonElement>(null);
    useEffect(() => {
      if (!editor) return;
      const dom = editor.view.dom;
      const over = (event: MouseEvent) => {
        const block = (event.target as Element).closest?.("pre") as HTMLElement | null;
        if (!block) return;
        const box = block.getBoundingClientRect();
        setCode((now) =>
          now?.block === block
            ? now
            : { block, top: box.top, right: window.innerWidth - box.right },
        );
      };
      const out = (event: MouseEvent) => {
        const to = event.relatedTarget as Element | null;
        if (to && (copyButton.current?.contains(to) || to.closest?.("pre"))) return;
        setCode(null);
        setCodeCopied(false);
      };
      const away = () => setCode(null);
      dom.addEventListener("mouseover", over);
      dom.addEventListener("mouseout", out);
      window.addEventListener("scroll", away, true);
      return () => {
        dom.removeEventListener("mouseover", over);
        dom.removeEventListener("mouseout", out);
        window.removeEventListener("scroll", away, true);
      };
    }, [editor]);

    return (
      <>
        <EditorContent editor={editor} className="rich-text-editor" />
        {code &&
          createPortal(
            <button
              ref={copyButton}
              type="button"
              className="code-copy copy-swap press"
              aria-label="Copy code"
              data-copied={codeCopied || undefined}
              style={{ top: code.top + 6, right: code.right + 6 }}
              onMouseLeave={(event) => {
                if (!(event.relatedTarget as Element | null)?.closest?.("pre")) setCode(null);
              }}
              onClick={() => {
                void navigator.clipboard.writeText(code.block.textContent ?? "").then(() => {
                  setCodeCopied(true);
                  window.setTimeout(() => setCodeCopied(false), 1600);
                });
              }}
            >
              <Copy size={14} />
              <Check size={14} stroke={2.5} />
            </button>,
            document.body,
          )}
        {peek &&
          createPortal(
            <div className="link-peek" translate="no" aria-hidden="true">
              {peek}
            </div>,
            document.body,
          )}
        {editor && !readOnly && (
          <>
            <BubbleMenu
              editor={editor}
              className="popover menu-popover rich-bubble-menu flex items-center gap-1 p-1"
              shouldShow={({ state }) => {
                const { selection } = state;
                if (selection.empty) return false;
                /* A document formats from its bar, so the bubble keeps only
                 what the bar does not carry: the remark and the lock. */
                if (manuscript && !onComment && !onContinueAsNote && !writeLockOwner) return false;
                return !(
                  selection instanceof NodeSelection &&
                  ["privateImage", "privateFile", "drawing"].includes(selection.node.type.name)
                );
              }}
            >
              {colorsOpen ? (
                <>
                  <button
                    type="button"
                    className="toolbar-button press"
                    aria-label="Back"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => setColorsOpen(false)}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  {(["yellow", "purple", "pink", "orange", "mint", "blue"] as TextColor[]).map(
                    (color) => (
                      <button
                        key={color}
                        type="button"
                        className={`menu-swatch is-${color} ${
                          editor.isActive("textStyle", { color: TEXT_COLOR_VALUE[color] })
                            ? "is-on"
                            : ""
                        }`}
                        aria-label={`${color} text`}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          format(`color-${color}`);
                          setColorsOpen(false);
                        }}
                      >
                        A
                      </button>
                    ),
                  )}
                  <button
                    type="button"
                    className="menu-swatch is-none"
                    aria-label="No colour"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      format("color-clear");
                      setColorsOpen(false);
                    }}
                  >
                    A
                  </button>
                </>
              ) : (
                <>
                  {!manuscript &&
                    (["bold", "italic", "strike", "code"] as const).map((action) => (
                      <button
                        key={action}
                        type="button"
                        className="toolbar-button press"
                        aria-label={action}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => format(action)}
                      >
                        {action === "bold" ? (
                          "B"
                        ) : action === "italic" ? (
                          "I"
                        ) : action === "strike" ? (
                          "S"
                        ) : (
                          <Code2 size={16} />
                        )}
                      </button>
                    ))}
                  {!manuscript && (
                    <button
                      type="button"
                      className="toolbar-button press"
                      aria-label="Link"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={onOpenLink}
                    >
                      <Link size={16} />
                    </button>
                  )}
                  {!manuscript && (
                    <>
                      <span className="menu-separator rich-bubble-separator" />
                      {(() => {
                        const current = (Object.keys(TEXT_COLOR_VALUE) as TextColor[]).find(
                          (color) =>
                            editor.isActive("textStyle", { color: TEXT_COLOR_VALUE[color] }),
                        );
                        return (
                          <button
                            type="button"
                            className={`toolbar-button press rich-bubble-color ${
                              current ? `is-${current}` : ""
                            }`}
                            aria-label="Text colour"
                            title="Text colour"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => setColorsOpen(true)}
                          >
                            <span>A</span>
                            <i />
                          </button>
                        );
                      })()}
                    </>
                  )}
                  {!manuscript && (onComment || onContinueAsNote || writeLockOwner) && (
                    <span className="menu-separator rich-bubble-separator" />
                  )}
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
                      <MessageSquarePlus size={16} />
                    </button>
                  )}
                  {onContinueAsNote && (
                    <button
                      type="button"
                      className="toolbar-button press"
                      aria-label="Continue as note"
                      title="Continue as note"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        const { from, to } = editor.state.selection;
                        const quote = editor.state.doc.textBetween(from, to, " ").trim();
                        if (quote) onContinueAsNote(quote);
                      }}
                    >
                      <NotebookPen size={16} />
                    </button>
                  )}
                  {writeLockOwner && (
                    <button
                      type="button"
                      className={`toolbar-button press${passageLock === "mine" ? " is-active" : ""}`}
                      aria-pressed={passageLock === "mine"}
                      disabled={passageLock === "theirs"}
                      aria-label={
                        passageLock === "mine"
                          ? "Let them write this passage"
                          : "Only I may write this passage"
                      }
                      title={
                        passageLock === "mine"
                          ? "Let them write this passage"
                          : "Only I may write this passage"
                      }
                      onMouseDown={(event) => event.preventDefault()}
                      onAnimationEnd={() => setLatched(0)}
                      /* The padlock is the state, the way Bold is: shut over a
                   passage that is locked, open over one that is not. The other
                   member's lock is theirs to lift, so the press is refused. */
                      onClick={() => {
                        setLatched((count) => count + 1);
                        if (!editor) return;
                        const chain = editor.chain().focus();
                        if (editor.isActive(WRITE_LOCK_MARK, { owner: writeLockOwner })) {
                          chain.unsetMark(WRITE_LOCK_MARK).run();
                        } else if (!editor.isActive(WRITE_LOCK_MARK)) {
                          chain.setMark(WRITE_LOCK_MARK, { owner: writeLockOwner }).run();
                        }
                      }}
                    >
                      {passageLock === "none" ? (
                        <LockOpen
                          key={latched}
                          size={16}
                          className={latched ? "is-latching" : undefined}
                        />
                      ) : (
                        <Lock
                          key={latched}
                          size={16}
                          className={latched ? "is-latching" : undefined}
                        />
                      )}
                    </button>
                  )}
                </>
              )}
            </BubbleMenu>
            {!mobile && (
              <DragHandle editor={editor} className="rich-drag-handle">
                <GripVertical size={16} />
              </DragHandle>
            )}
          </>
        )}
        {preview && <ImageLightbox preview={preview} onClose={() => setPreview(null)} />}
      </>
    );
  },
);
export type { StagePhone } from "./DrawingStage";
export type { FormatAction, RichTextEditorHandle, SearchStatus } from "./RichTextEditor.types";
export { DRAW_HERE, STAGE_STATE } from "./useDrawingStage";
