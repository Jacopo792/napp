import { UniqueBlockAnchors } from "../lib/blockAnchors";
import { anchoredBlock, blockId, readBlockLink } from "@/lib/blockLinks";
import {
  Extension,
  InputRule,
  mergeAttributes,
  Node,
  type Editor,
  type FocusPosition,
  type JSONContent,
} from "@tiptap/core";
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
  useEditorState,
  type NodeViewProps,
} from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import {
  AlignJustify,
  ArrowUpRight,
  Check,
  ChevronLeft,
  Code2,
  Link,
  ChevronDown,
  Circle,
  Copy,
  Crop as CropIcon,
  Download,
  Eraser,
  ExternalLink,
  GripVertical,
  Highlighter,
  Lock,
  LockOpen,
  MessageSquarePlus,
  NotebookPen,
  Minus,
  Move,
  PaintBucket,
  Palette,
  Pencil,
  Redo2,
  RotateCw,
  Smartphone,
  Square,
  Trash2,
  Type,
  Undo2,
  X,
} from "@/components/icons";
import { createPortal } from "react-dom";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ContentsView } from "./ContentsView";
import { FootnoteView } from "./FootnoteView";
import { CrossReferenceView } from "./CrossReferenceView";
import { CitationView } from "./CitationView";
import { BibliographyView } from "./BibliographyView";
import {
  UniqueReferenceTargets,
  adoptTargets,
  findTarget,
  footnoteKeys,
  openFootnoteAt,
} from "@/features/editor/lib/referenceMarks";
import { targetsOf, type Adoption, type ChapterTargets } from "@/lib/references";
import { openPlace, type PlaceTarget } from "@/lib/documentContents";
import { WRITING_FOCUS, WritingFocus, type WritingFocusSettings } from "../lib/writingFocus";
import {
  BASE_EXTENSIONS,
  Bibliography,
  Citation,
  CrossReference,
  Footnote,
  DRAWING_BOX,
  DRAWING_INKS,
  Drawing,
  PrivateFile,
  PrivateImage,
  TableOfContents,
  TEXT_COLOR_VALUE,
  WRITE_LOCK_MARK,
  DRAWING_TEXT_FONT,
  type DrawingMark,
  type DrawingShape,
  type DrawingStroke,
  type TextColor,
  drawingMarks,
  drawingStrokes,
  drawingSurface,
  isDrawingText,
  shapeStroke,
  straightenStroke,
  strokePoints,
  translateStroke,
  richTextToPlainText,
} from "@/features/editor/lib/content";
import { attachmentType, attachmentExtension } from "@/features/editor/lib/attachments";
import { mediaPaste } from "@/features/editor/lib/paste";
import { inlinePastedStyles, reflowPasted } from "@/features/editor/lib/reflow";
import {
  WHOLE_CROP,
  isWholeView,
  planeFit,
  readView,
  turnRect,
  unturnRect,
  viewAspect,
  writeCrop,
  type Crop,
  type ImageView,
  splitMediaStroke,
} from "@/features/editor/lib/mediaInk";
import { rememberSpelling, takeAutocorrection } from "@/features/editor/lib/autocorrect";
import { commentQuotes } from "@/features/editor/lib/commentAnchors";
import { BODY_FRAGMENT } from "@/features/editor/lib/ydoc";
import { platform } from "@/platform";
import { emerge, leave } from "@/lib/motion";
import {
  drawKey,
  holdForDesk,
  lendToPhone,
  onPhonePresence,
  phonePresent,
  type DrawTarget,
} from "@/lib/drawHandoff";
import type { HocuspocusProvider } from "@hocuspocus/provider";
import { ySyncPluginKey } from "y-prosemirror";
import { suggestionsExtension, type SuggestionMode } from "../lib/suggestions";
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
  exportNote: (format: "pdf" | "docx", title: string) => Promise<void>;
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
  /** The body as it reads now, for a version somebody names or keeps. */
  getContent: () => JSONContent | null;
  /** Write an earlier version back, as one ordinary edit through the binding. */
  replaceContent: (content: JSONContent) => void;
  setSearch: (query: string) => SearchStatus;
  findNext: () => SearchStatus;
  findPrevious: () => SearchStatus;
  closeSearch: () => void;
  /** Select the first place these words occur and scroll to it, leaving no
   *  search behind. False when they are not (yet) in the document. */
  reveal: (text: string) => boolean;
  /** Go to a footnote, a caption or a heading; a footnote opens to be read. */
  revealTarget: (target: PlaceTarget) => boolean;
  /** Go to these words and light them for a moment — the caret is left at
   *  their end, not on them, so nothing stays selected. */
  flashPassage: (text: string) => boolean;
  flashBlock: (id: string) => boolean;
  paragraphIdAt: (coords: { left: number; top: number }) => string | null;
  /** Give this chapter's targets the ids references elsewhere cite them by. */
  adopt: (adoptions: Adoption[]) => void;
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
  onPasteImageSource?: (src: string) => Promise<{ objectId: string; alt: string } | null>;
  onPasteError?: (message: string) => void;
  onOpenLink: () => void;
  /** Every note `[[` can reach, and what to do when one is clicked. Absent in
   *  the preview and anywhere else without an archive behind it. */
  notes?: { id: string; title: string }[];
  /** A note link was pressed; `passage` is its words, for a link made by
   *  Continue as note, which goes back to them. */
  onOpenNote?: (noteId: string, passage?: string) => void;
  /** Offered on chosen words in a book: carry them into a new note. */
  onContinueAsNote?: (quote: string) => void;
  /** Clicking the underlined passage opens the conversation about it. */
  onOpenComment?: (threadId: string) => void;
  /** Open a comment on whatever is selected. Absent when the note cannot be
   *  commented on — Trash, or a reader who may not write. */
  onComment?: () => void;
  /** The account a passage lock is stamped with, and the one it is judged
   *  against. Null where locking is not on offer — Trash, the preview, a note
   *  somebody else has taken back whole. */
  writeLockOwner?: string | null;
  /** Every thread somebody has said something in. A passage anchored to any
   *  other thread is drawn as plain text: its comment was started and never
   *  written, and an underline with no conversation under it is a dead end.
   *  Absent while unknown, which draws every anchor. */
  saidThreads?: ReadonlySet<string> | null;
  mobile?: boolean;
  /** Whether the small accent-and-apostrophe correction runs while you type.
   *  A setting, so it arrives as a value and is read through a ref inside —
   *  changing it must never be a reason to rebuild the editor. */
  autocorrectOn?: boolean;
  resolveImage: (objectId: string) => Promise<Blob>;
  resolveFile: (objectId: string) => Promise<Blob>;
  collaboration?: { document: Y.Doc; provider: HocuspocusProvider | null } | null;
  /** The instance itself, for a toolbar that has to read what the selection
   *  is set in — a font menu that cannot say which font it is in is a guess. */
  onEditor?: (editor: Editor | null) => void;
  /** A chapter of a document: the paragraph keys Word has, which a note
   *  never needed and does not get. */
  manuscript?: boolean;
  /** Whether this writer's edits are proposals, and in whose name. Read on
   *  every transaction, so switching needs no new editor. */
  suggesting?: SuggestionMode;
  /** A document only: what focus mode leaves lit, and whether the line being
   *  written is kept mid-window. */
  writing?: WritingFocusSettings;
  /** The note this editor holds, for a cross-reference to say "in chapter 2"
   *  only of what is not in this one. */
  noteId?: string;
  /** A document with footnotes on: ⌥⌘F puts one in. */
  footnotes?: boolean;
  /** A document only: what this chapter can be cited by, as it is typed. */
  onTargets?: (targets: ChapterTargets) => void;
}

/* Word's paragraph keys, on the paragraphs and headings the selection
   touches. Only in a document — a note keeps every key it had. */
const ManuscriptKeys = Extension.create({
  name: "manuscriptKeys",
  addKeyboardShortcuts() {
    const align = (textAlign: string | null) => () =>
      this.editor
        .chain()
        .updateAttributes("paragraph", { textAlign })
        .updateAttributes("heading", { textAlign })
        .run();
    return {
      "Mod-Shift-l": align(null),
      "Mod-Shift-e": align("center"),
      "Mod-Shift-r": align("right"),
      "Mod-Shift-j": align("justify"),
      "Mod-Enter": () => this.editor.commands.insertContent({ type: "pageBreak" }),
    };
  },
});

interface ImagePreview {
  src: string;
  alt: string;
}

type Resolver = (objectId: string) => Promise<Blob>;

interface PrivateImageOptions {
  resolve: Resolver;
  /** The note this is in, for lending a picture to the phone. A video's
   *  view has none: a video is not drawn on. */
  noteId?: () => string | undefined;
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

/* A comment never written. A decoration rather than a write: the mark may be
   the other member's, who is still typing the first remark, and the document
   is theirs too. The class lands inside the anchor's span, so the stylesheet
   reaches the anchor with `:has`. */
const unsaidKey = new PluginKey("unsaidComments");
function unsaidCommentsExtension(said: { current: ReadonlySet<string> | null | undefined }) {
  return Extension.create({
    name: "unsaidComments",
    addProseMirrorPlugins() {
      return [
        new Plugin<DecorationSet>({
          key: unsaidKey,
          state: {
            init: () => DecorationSet.empty,
            apply(transaction, set, _old, state) {
              if (!transaction.docChanged && !transaction.getMeta(unsaidKey)) return set;
              const known = said.current;
              if (!known) return DecorationSet.empty;
              const found: Decoration[] = [];
              state.doc.descendants((node, pos) => {
                if (!node.isText) return true;
                const mark = node.marks.find((m) => m.type.name === "comment");
                if (mark?.attrs.threadId && !known.has(mark.attrs.threadId as string))
                  found.push(
                    Decoration.inline(pos, pos + node.nodeSize, { class: "comment-unsaid" }),
                  );
                return true;
              });
              return DecorationSet.create(state.doc, found);
            },
          },
          props: {
            decorations: (state) => unsaidKey.getState(state) as DecorationSet,
          },
        }),
      ];
    },
  });
}

/* A passage lit for a moment. A decoration, not a class on the DOM: the
   view redraws the spans it owns and a class written there is lost or left
   behind. The range follows edits until the light goes out. */
const passageFlashKey = new PluginKey<DecorationSet>("passageFlash");
const PassageFlash = Extension.create({
  name: "passageFlash",
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: passageFlashKey,
        state: {
          init: () => DecorationSet.empty,
          apply(transaction, set) {
            const meta = transaction.getMeta(passageFlashKey) as
              | { from: number; to: number }
              | null
              | undefined;
            if (meta === null) return DecorationSet.empty;
            if (meta)
              return DecorationSet.create(transaction.doc, [
                Decoration.inline(meta.from, meta.to, { class: "is-flashing" }),
              ]);
            return set.map(transaction.mapping, transaction.doc);
          },
        },
        props: {
          decorations: (state) => passageFlashKey.getState(state),
        },
      }),
    ];
  },
});

/** Where these words stand inside one block of text, or null. */
function findPassage(doc: ProseMirrorNode, text: string): { from: number; to: number } | null {
  let found: { from: number; to: number } | null = null;
  doc.descendants((node, pos) => {
    if (found) return false;
    if (!node.isTextblock) return true;
    const content = node.textContent;
    for (let at = content.indexOf(text); at >= 0 && !found; at = content.indexOf(text, at + 1)) {
      /* Text offset to document position: walk the inline children, since a
         footnote or a picture inside the block takes one position and no text. */
      let offset = 0;
      let from = -1;
      node.forEach((child, childOffset) => {
        const length = child.isText ? child.text!.length : 0;
        if (from < 0 && child.isText && at < offset + length)
          from = pos + 1 + childOffset + (at - offset);
        offset += length;
      });
      if (from >= 0) found = { from, to: from + text.length };
    }
    return false;
  });
  return found;
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

/** The word that has just been finished, read backwards from the caret.
 *
 *  Accented letters are in the class and an apostrophe may end it, and both
 *  are load-bearing for Italian: `perchè` is a word this corrects and `e'` is
 *  a word it corrects *into* something — neither of them is `[A-Za-z]+`, which
 *  is what the class was when the dictionary was sixteen English contractions.
 *  The apostrophe is allowed only at the end, so `l'accento` is read as
 *  `accento` and the article is left where it is. */
const FINISHED_WORD = /([A-Za-zÀ-ÖØ-öø-ÿ]+['’]?)$/;

/** How long after a correction an undo is still about that correction. Longer
 *  and a ⌘Z meant for something else teaches the dictionary a word nobody
 *  refused; shorter and the hand has not finished reacting. */
const UNDO_IS_A_REFUSAL_FOR_MS = 4000;

/** A small, local counterpart to the familiar phone-style correction. It acts
 * only when a word is completed and never rewrites a sentence while its
 * meaning is still changing.
 *
 * The last word is the writer's, and the way they get it is **undo**: a ⌘Z
 * arriving on the heels of a correction is that spelling being refused, and a
 * refused spelling is learned and never corrected again. That replaced a
 * counter which simply stopped correcting every word after its second
 * correction, for ever — see `autocorrect.ts`.
 *
 * Whether it runs at all is read through a **ref**. It is a setting, and a
 * setting that arrived as a prop would rebuild the editor when it changed —
 * which the whole collaborative path exists to do exactly once. */
function autocorrectExtension(enabled: React.RefObject<boolean>) {
  return Extension.create({
    name: "autocorrect",
    addProseMirrorPlugins() {
      /* What the last correction replaced, and when. Plugin-local rather than
         module-level: two editors are open in a split, and a refusal in one is
         not a refusal in the other's document. */
      let refusable: { word: string; at: number } | null = null;
      return [
        new Plugin({
          key: new PluginKey("autocorrect"),
          props: {
            /* The undo itself is still the history's to perform — this only
               listens. Returning true here would swallow ⌘Z. */
            handleKeyDown(_view, event) {
              if (!refusable) return false;
              if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z")
                return false;
              if (Date.now() - refusable.at < UNDO_IS_A_REFUSAL_FOR_MS)
                rememberSpelling(refusable.word);
              refusable = null;
              return false;
            },
            handleTextInput(view, from, to, text) {
              if (!enabled.current) return false;
              if (!/^[\s.,!?;:]$/.test(text)) return false;
              const $from = view.state.doc.resolve(from);
              const before = $from.parent.textBetween(0, $from.parentOffset, " ", " ");
              const match = FINISHED_WORD.exec(before);
              if (!match) return false;
              const corrected = takeAutocorrection(match[1]);
              if (!corrected) return false;
              view.dispatch(
                view.state.tr.insertText(`${corrected}${text}`, from - match[1].length, to),
              );
              refusable = { word: match[1], at: Date.now() };
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

    addInputRules() {
      return [
        new InputRule({
          find: /\[\[([^\]\n]+)#\^([A-Za-z0-9_-]{1,128})\]\]$/,
          handler: ({ range, match, chain }) => {
            const link = readBlockLink(match[0]);
            const found =
              link && notes.current.filter((note) => (note.title || "Untitled") === link.title);
            if (!link || !found || found.length !== 1) return null;
            chain()
              .deleteRange(range)
              .insertContent({
                type: "text",
                text: link.title,
                marks: [{ type: "noteLink", attrs: { noteId: found[0].id, blockId: link.id } }],
              })
              .run();
          },
        }),
      ];
    },
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: new PluginKey("blockLinkPaste"),
          props: {
            handlePaste(view, event) {
              const link = readBlockLink(event.clipboardData?.getData("text/plain") || "");
              const found =
                link && notes.current.filter((note) => (note.title || "Untitled") === link.title);
              if (!link || !found || found.length !== 1) return false;
              const mark = view.state.schema.marks.noteLink.create({
                noteId: found[0].id,
                blockId: link.id,
              });
              view.dispatch(
                view.state.tr.replaceSelectionWith(
                  view.state.schema.text(link.title, [mark]),
                  false,
                ),
              );
              return true;
            },
          },
        }),
        Suggestion<{ id: string; title: string; blockId?: string | null }>({
          editor: this.editor,
          /* Its own key. ProseMirror refuses two plugins that share one, and
             `Suggestion` defaults every instance to `suggestion$` — so the
             slash menu and this one cannot both be nameless. */
          pluginKey: new PluginKey("noteLinkSuggestion"),
          char: "[[",
          allowedPrefixes: null,
          items: ({ query }) => {
            const [title, target] = query.split("#^");
            const q = title.toLowerCase();
            return notes.current
              .filter((note) => (note.title || "Untitled").toLowerCase().includes(q))
              .slice(0, limit)
              .map((note) => ({ ...note, blockId: blockId(target) }));
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
                  marks: [
                    {
                      type: "noteLink",
                      attrs: { noteId: props.id, blockId: props.blockId ?? null },
                    },
                  ],
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
  const { objectId } = node.attrs as { objectId: string };
  const alt = String(node.attrs.alt ?? node.attrs.label ?? "Image");
  const video = node.type.name === "privateFile";
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
  const strokes = useMemo(() => drawingMarks(node.attrs.strokes as string), [node.attrs.strokes]);
  /* The picture's own size, learned when it decodes: a crop and a turn are
     laid out against it. */
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const view = useMemo(
    () => readView(node.attrs.crop, node.attrs.turns),
    [node.attrs.crop, node.attrs.turns],
  );
  const shaped = !isWholeView(view) && natural !== null && !video;
  const plane = shaped ? planeCss(view, natural, view.turns) : null;
  /* Marking up happens on a stage of its own, on a draft of the strokes: the
     note's document is written once, on Done, and not at all on Cancel. */
  const frame = useRef<HTMLSpanElement>(null);
  const stage = useStage(
    editor,
    () => {
      const noteId = options.noteId?.();
      return noteId && !video ? { noteId, objectId } : null;
    },
    () =>
      (frame.current?.querySelector(".rich-media-image-open") ?? frame.current)?.scrollIntoView({
        block: "center",
        behavior: "instant",
      }),
  );
  const ink = useInk({
    strokes,
    write: () => {},
    fit: "width",
    editable: false,
    turned: shaped,
  });

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    setSrc("");
    setError("");
    void resolveImage(objectId)
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(
          video ? new Blob([blob], { type: attachmentType(alt) }) : blob,
        );
        setSrc(objectUrl);
      })
      .catch((reason: unknown) => {
        if (active)
          setError(
            reason instanceof Error
              ? reason.message
              : video
                ? "This video could not be displayed"
                : "This image could not be displayed",
          );
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectId, resolveImage, attempt, video, alt]);

  /* Fades in once decoded rather than painting in as it arrives. */
  const pic = (
    <img
      src={src}
      alt={alt || "Image"}
      draggable={false}
      onLoad={(event) => {
        event.currentTarget.classList.add("is-arrived");
        setNatural({ w: event.currentTarget.naturalWidth, h: event.currentTarget.naturalHeight });
      }}
    />
  );
  /* Always mounted, even with nothing on it: the layer measures itself to
     know how tall it is in stroke units, and a layer that appears only once
     the pen is out has nothing to measure until too late. */
  const layer = (
    <svg
      ref={ink.surface}
      className="rich-media-image-ink"
      viewBox={`0 0 ${ink.box.width} ${ink.box.height}`}
      /* See the page layer below: a surface measured against its width must
         never let its height stretch the ink. */
      preserveAspectRatio="xMinYMin meet"
    >
      {ink.inked}
    </svg>
  );

  return (
    <NodeViewWrapper className={`rich-media-image ${error ? "is-error" : ""}`}>
      {/* The frame is what the ink lies over, and it holds the picture alone:
          an overlay on the wrapper would reach down over the caption, and the
          caption is not part of the picture. There is no caption under it
          any more: the alt was a file name or an object id, and a pasted
          picture arrived with a uuid printed beneath it. */}
      <span ref={frame} className="rich-media-image-frame" contentEditable={false}>
        {src && video ? (
          <video
            src={src}
            controls
            preload="metadata"
            onError={() => setError("This video could not be played")}
          />
        ) : src ? (
          <button
            type="button"
            className="rich-media-image-open"
            /* A cropped or turned picture is a box of its own proportions,
               as wide as an uncropped picture of that shape would be. */
            style={plane ? { width: `min(100%, ${34 * plane.aspect}rem)` } : undefined}
            onClick={() => options.open(src, alt || "Image")}
          >
            {plane ? (
              <div
                className="rich-media-image-view"
                data-crop={node.attrs.crop}
                data-turns={view.turns}
                data-strokes={node.attrs.strokes}
                style={{ aspectRatio: plane.aspect }}
              >
                <div className="media-plane" style={plane.style}>
                  {pic}
                  {layer}
                </div>
              </div>
            ) : (
              pic
            )}
          </button>
        ) : (
          <span className="rich-media-loading">
            {error || (video ? "Loading video…" : "Loading image…")}
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
        {!plane && layer}
      </span>
      {editor.isEditable && src && !video && (
        <button
          type="button"
          className="rich-media-remove is-ink"
          aria-label="Mark up this picture"
          title="Mark up this picture"
          onClick={() => stage.open("own")}
          contentEditable={false}
        >
          <Pencil size={16} />
        </button>
      )}
      {editor.isEditable && (
        <button
          type="button"
          className="rich-media-remove"
          aria-label={video ? "Remove video" : "Remove image"}
          title={video ? "Remove video" : "Remove image"}
          onClick={deleteNode}
          contentEditable={false}
        >
          <Trash2 size={16} />
        </button>
      )}
      {stage.mode && frame.current && natural && src && (
        <DrawingStage
          subject={{ kind: "image", src, alt, view, natural }}
          initial={strokes}
          live={strokes}
          anchor={
            frame.current.querySelector<HTMLElement>(".rich-media-image-open") ?? frame.current
          }
          phone={stage.phone}
          until={stage.until}
          onDraft={
            stage.mode === "lent"
              ? (next) => updateAttributes({ strokes: JSON.stringify(next) })
              : undefined
          }
          onKeep={(next) =>
            updateAttributes({
              strokes: JSON.stringify(next.strokes),
              ...(next.view ? { crop: writeCrop(next.view.crop), turns: next.view.turns } : {}),
            })
          }
          onClose={stage.close}
        />
      )}
    </NodeViewWrapper>
  );
}

/* ── Drawing on a stage ──────────────────────────────────────────────────────
   A picture or a board is drawn on full-bleed: it grows out of its place in
   the note onto a black ground that covers the whole window, the pens stand
   in a tray in the bottom-left corner, and the top edge holds nothing but
   Cancel, undo and redo, and Done. The same layout on a Mac, a PC and a phone,
   because the hand is the same hand. The strokes are a draft held here: Done
   writes them to the note once, Cancel and Escape leave the document exactly
   as it was. Lent to the phone, the draft is the document itself. */

/** A motion token as the stylesheet defines it, so the panel moves on the same
 *  curve as the rest of the app and not on a copy of it. */
function motionToken(name: string, fallback: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/** The style of a view's plane, in container units: the plane is the whole
 *  original laid out against the view box (`container-type: inline-size`, so
 *  `cqw` is the box's width) and moved, turned and scaled so that the crop is
 *  what the box shows. `spin` is the unwrapped turn count, so that turning
 *  again animates on through 360 instead of back round. */
function planeCss(
  view: ImageView,
  natural: { w: number; h: number },
  spin: number,
): { aspect: number; style: React.CSSProperties } {
  const fit = planeFit(view, natural.w, natural.h);
  const c = (n: number) => `${(n * 100).toFixed(4)}cqw`;
  return {
    aspect: fit.aspect,
    style: {
      width: c(fit.width),
      aspectRatio: `${natural.w} / ${natural.h}`,
      transform: `translate(${c(fit.centre.x)}, ${c(fit.centre.y)}) rotate(${spin * 90}deg) translate(${c(-fit.offset.x)}, ${c(-fit.offset.y)})`,
    },
  };
}

const MIN_CROP_SIZE = 0.06;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

type Hand = ReturnType<typeof useInk>["hand"];

/** Said on the editor's element by a host the desk asked to draw a block:
 *  `detail` is the `DrawTarget`, and the block it names opens its stage. */
export const DRAW_HERE = "napp:draw-here";
/** Said on the window while a stage is up, so a host can give it the screen. */
export const STAGE_STATE = "napp:stage";

function usePhonePresent() {
  const [present, setPresent] = useState(phonePresent);
  useEffect(() => onPhonePresence(setPresent), []);
  return present;
}

/** A block's stage: whether it is up, whose hand is on it, and the phone. */
function useStage(editor: Editor, target: () => DrawTarget | null, reveal: () => void) {
  const present = usePhonePresent();
  const [mode, setMode] = useState<"own" | "lent" | null>(null);
  const [hold, setHold] = useState<ReturnType<typeof holdForDesk> | null>(null);
  const targetRef = useRef(target);
  targetRef.current = target;
  const revealRef = useRef(reveal);
  revealRef.current = reveal;
  useEffect(() => {
    const dom = editor.view.dom;
    const heard = (event: Event) => {
      const asked = (event as CustomEvent<DrawTarget>).detail;
      const mine = targetRef.current();
      if (!mine || drawKey(asked) !== drawKey(mine)) return;
      event.preventDefault();
      revealRef.current();
      setHold(holdForDesk(mine));
      setMode("lent");
    };
    dom.addEventListener(DRAW_HERE, heard);
    return () => dom.removeEventListener(DRAW_HERE, heard);
  }, [editor]);
  const mine = mode === "own" && present ? target() : null;
  return {
    mode,
    open: (next: "own" | "lent") => {
      revealRef.current();
      setMode(next);
    },
    phone: mine ? { present, lend: () => lendToPhone(mine) } : null,
    until: hold?.cancelled,
    close: () => {
      hold?.finish();
      setHold(null);
      setMode(null);
    },
  };
}

/* ── The pen tray ────────────────────────────────────────────────────────────
   The pens stand side by side and the one in the hand is lifted out of the
   row, its tip in the ink it lays. Shapes, captions and moving a mark are one
   press further, on the square; the colour and the nib on the well beside it.
   Both open upwards, out of the tray, because the tray is at the foot of the
   screen. */
const PENS = [
  { pen: "pen", label: "Pen" },
  { pen: "marker", label: "Highlighter" },
  { pen: "eraser", label: "Eraser" },
] as const;

function Nib({ pen, ink }: { pen: (typeof PENS)[number]["pen"]; ink: string }) {
  return (
    <svg className="pen-tray-nib" viewBox="0 0 18 52" aria-hidden="true">
      {pen === "pen" && (
        <>
          <path d="M3 16 L9 2 L15 16 Z" className="pen-tray-wood" />
          <path d="M7 6.5 L9 2 L11 6.5 Z" fill={ink} />
        </>
      )}
      {pen === "marker" && (
        <>
          <path d="M4 16 L5 8 L13 5 L14 16 Z" fill={`${ink}cc`} />
        </>
      )}
      {pen === "eraser" && (
        <rect x="3" y="4" width="12" height="13" rx="4" className="pen-tray-rubber" />
      )}
      <rect x="3" y="16" width="12" height="36" rx="2.5" className="pen-tray-body" />
      {pen !== "eraser" && <rect x="3" y="20" width="12" height="3" fill={ink} />}
    </svg>
  );
}

function PenTray({ hand, children }: { hand: Hand; children?: React.ReactNode }) {
  const [open, setOpen] = useState<"shapes" | "ink" | null>(null);
  const tray = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!tray.current?.contains(event.target as globalThis.Node)) setOpen(null);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);
  const held = hand.erasing
    ? "eraser"
    : hand.shape !== null
      ? null
      : hand.marker
        ? "marker"
        : "pen";
  const custom = !DRAWING_INKS.includes(hand.ink as (typeof DRAWING_INKS)[number]);
  const ShapeGlyph =
    DRAWING_TOOLS.find((each) => each.tool === hand.shape && !hand.erasing)?.Glyph ?? Square;
  return (
    <div
      ref={tray}
      className="pen-tray"
      /* A press on a tool must not move focus: on the page layer the editor
         around it would take it, and on a phone that is the keyboard coming up
         over the pen. The colour well is a label and keeps its default, or its
         picker never opens. */
      onMouseDown={(event) => {
        if (!(event.target as Element).closest("label")) event.preventDefault();
      }}
    >
      <span className="pen-tray-pens">
        {PENS.map(({ pen, label }) => (
          <button
            key={pen}
            type="button"
            className={`pen-tray-pen ${held === pen ? "is-held" : ""}`}
            aria-label={label}
            title={label}
            aria-pressed={held === pen}
            onClick={() => {
              setOpen(null);
              if (pen === "pen") hand.pen();
              else if (pen === "marker") {
                hand.pen();
                hand.toggleMarker();
              } else if (!hand.erasing) hand.toggleErase();
            }}
          >
            <Nib pen={pen} ink={hand.ink} />
          </button>
        ))}
      </span>
      <span className="pen-tray-rule" />
      <span className="pen-tray-wrap">
        <button
          type="button"
          className={`pen-tray-tool ${held === null ? "is-active" : ""}`}
          aria-label="Shapes"
          title="Shapes"
          aria-haspopup="menu"
          aria-expanded={open === "shapes"}
          onClick={() => setOpen((now) => (now === "shapes" ? null : "shapes"))}
        >
          <ShapeGlyph size={18} />
        </button>
        {open === "shapes" && (
          <div role="menu" className="pen-tray-menu">
            {DRAWING_TOOLS.map(({ tool, label, Glyph }) => (
              <button
                key={tool}
                type="button"
                role="menuitemradio"
                aria-checked={!hand.erasing && hand.shape === tool}
                className="menu-row"
                onClick={() => {
                  if (hand.erasing) hand.toggleErase();
                  if (hand.shape !== tool) hand.toggleShape(tool);
                  setOpen(null);
                }}
              >
                <Glyph size={16} />
                {label}
                {!hand.erasing && hand.shape === tool && (
                  <Check size={14} className="pen-tray-check" />
                )}
              </button>
            ))}
            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={hand.filling}
              className="menu-row"
              disabled={!hand.closed}
              onClick={hand.toggleFill}
            >
              <PaintBucket size={16} />
              Fill
              {hand.filling && <Check size={14} className="pen-tray-check" />}
            </button>
          </div>
        )}
      </span>
      <span className="pen-tray-wrap">
        <button
          type="button"
          className="pen-tray-well"
          style={{ background: hand.ink }}
          aria-label="Colour and thickness"
          title="Colour and thickness"
          aria-haspopup="menu"
          aria-expanded={open === "ink"}
          onClick={() => setOpen((now) => (now === "ink" ? null : "ink"))}
        />
        {open === "ink" && (
          <div role="menu" className="pen-tray-menu">
            <div className="pen-tray-swatches">
              {DRAWING_INKS.map((colour) => (
                <button
                  key={colour}
                  type="button"
                  role="menuitemradio"
                  className={`drawing-ink ${colour === hand.ink ? "is-chosen" : ""}`}
                  style={{ background: colour }}
                  aria-label={`Draw in ${colour}`}
                  aria-checked={colour === hand.ink}
                  onClick={() => hand.choose(colour)}
                />
              ))}
              <label
                className={`drawing-ink is-any ${custom ? "is-chosen" : ""}`}
                style={custom ? { background: hand.ink } : undefined}
                title="Any colour"
              >
                <input
                  type="color"
                  value={hand.ink}
                  aria-label="Draw in any colour"
                  onChange={(event) => hand.choose(event.target.value)}
                />
              </label>
            </div>
            <div className="pen-tray-nibs">
              {DRAWING_NIBS.map((size) => (
                <button
                  key={size}
                  type="button"
                  role="menuitemradio"
                  aria-checked={!hand.marker && hand.nib === size}
                  aria-label={`Thickness ${size}`}
                  className={`pen-tray-size ${!hand.marker && hand.nib === size ? "is-chosen" : ""}`}
                  onClick={() => {
                    hand.chooseNib(size);
                    setOpen(null);
                  }}
                >
                  <span style={{ width: size + 2, height: size + 2 }} />
                </button>
              ))}
            </div>
          </div>
        )}
      </span>
      {children}
    </div>
  );
}

/** What a stage is drawing on: a picture in the note, or a board. */
type StageSubject =
  | { kind: "image"; src: string; alt: string; view: ImageView; natural: { w: number; h: number } }
  | { kind: "board" };

/** Lending the drawing to the phone signed into the same account. */
export interface StagePhone {
  /** A phone is listening now. */
  present: boolean;
  /** Ask it to draw this; `done` settles when it has put the pen down. */
  lend: () => { done: Promise<void>; cancel: () => void };
}

function DrawingStage({
  subject,
  initial,
  live,
  anchor,
  phone,
  until,
  onDraft,
  onKeep,
  onClose,
}: {
  subject: StageSubject;
  initial: DrawingMark[];
  /** The document's strokes as they stand, shown while the phone holds the pen. */
  live: DrawingMark[];
  anchor: HTMLElement;
  phone?: StagePhone | null;
  /** The desk took the pen back: close, keeping what is drawn. */
  until?: Promise<void>;
  /** This stage is the phone's half of a lend: every change goes straight to
   *  the document, so the screen that asked watches the drawing arrive. */
  onDraft?: (strokes: DrawingMark[]) => void;
  /** Write the drawing to the note: on Done, and before lending it. */
  onKeep: (next: { strokes: DrawingMark[]; view: ImageView | null }) => void;
  onClose: () => void;
}) {
  const image = subject.kind === "image" ? subject : null;
  const [draft, setDraft] = useState(initial);
  const [ahead, setAhead] = useState<DrawingMark[][]>([]);
  const [behind, setBehind] = useState<DrawingMark[][]>([]);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onKeepRef = useRef(onKeep);
  onKeepRef.current = onKeep;
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const write = useCallback((next: DrawingMark[]) => {
    setBehind((stack) => [...stack, draftRef.current]);
    setAhead([]);
    setDraft(next);
  }, []);
  const ink = useInk({
    strokes: draft,
    write,
    fit: image ? "width" : "board",
    editable: true,
    turned: Boolean(image),
  });
  const hand = ink.hand;
  const [crop, setCrop] = useState(image?.view.crop ?? WHOLE_CROP);
  const [spin, setSpin] = useState(image?.view.turns ?? 0);
  const [cropping, setCropping] = useState(false);
  /* The rectangle being sized, on the whole picture as it is turned now. */
  const [rect, setRect] = useState<Crop>(WHOLE_CROP);
  /* The phone has the pen: this stage only watches. */
  const [away, setAway] = useState<(() => void) | null>(null);
  const imageBox = useRef<HTMLDivElement>(null);
  const turns = ((spin % 4) + 4) % 4;
  const [leaving, setLeaving] = useState(false);
  const canvas = useRef<HTMLDivElement>(null);
  const ground = useRef<HTMLDivElement>(null);
  const chrome = useRef<HTMLDivElement>(null);

  /* Grows out of the block's place in the note, and goes back to it: the
     canvas travels, the ground and the controls fade. */
  const fly = useCallback(
    (entering: boolean) => {
      const element = canvas.current;
      if (!element) return Promise.resolve();
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const duration = reduced ? 0 : Number.parseFloat(motionToken("--dur-slow", "360")) || 360;
      const options: KeyframeAnimationOptions = {
        duration,
        easing: motionToken("--ease-out", "ease-out"),
        fill: "both",
      };
      const from = anchor.getBoundingClientRect();
      const to = element.getBoundingClientRect();
      const small =
        from.width > 0 && to.width > 0
          ? `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`
          : "scale(0.96)";
      const frames = [{ transform: small }, { transform: "none" }];
      const fade = [{ opacity: 0 }, { opacity: 1 }];
      if (!entering) {
        frames.reverse();
        fade.reverse();
      }
      ground.current?.animate(fade, options);
      chrome.current?.animate(fade, { ...options, duration: duration * 0.6 });
      return element.animate(frames, options).finished.then(() => undefined);
    },
    [anchor],
  );
  useLayoutEffect(() => {
    void fly(true);
    window.dispatchEvent(new CustomEvent(STAGE_STATE, { detail: true }));
    return () => {
      window.dispatchEvent(new CustomEvent(STAGE_STATE, { detail: false }));
    };
  }, [fly]);

  /* Lent to the phone, the draft is the document: each change is written as
     it is made, the way a stroke on the page is. */
  const onDraftRef = useRef(onDraft);
  onDraftRef.current = onDraft;
  const firstDraft = useRef(draft);
  useEffect(() => {
    if (draft !== firstDraft.current) onDraftRef.current?.(draft);
  }, [draft]);
  const settled = useRef({ crop, rect, turns, cropping });
  settled.current = { crop, rect, turns, cropping };
  /* What Done writes. Done while sizing a crop takes the rectangle as it stands. */
  const kept = useCallback(() => {
    const now = settled.current;
    const final = now.cropping ? unturnRect(now.turns, now.rect) : now.crop;
    return { strokes: draftRef.current, view: image ? { crop: final, turns: now.turns } : null };
  }, [image]);
  const finish = useCallback(
    (commit: boolean) => {
      if (leaving) return;
      setLeaving(true);
      /* Lent, the draft was the document all along: Cancel puts it back. */
      if (!commit && draftRef.current !== firstDraft.current)
        onDraftRef.current?.(firstDraft.current);
      if (commit) onKeepRef.current(kept());
      void fly(false).then(() => onCloseRef.current());
    },
    [fly, leaving, kept],
  );
  const finishRef = useRef(finish);
  finishRef.current = finish;
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (settled.current.cropping) setCropping(false);
        else finishRef.current(false);
      }
      if (event.key.toLowerCase() === "z" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        event.stopPropagation();
        if (event.shiftKey) redoRef.current();
        else undoRef.current();
      }
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, []);

  const undo = () => {
    if (!behind.length) return;
    setAhead((stack) => [draft, ...stack]);
    setDraft(behind[behind.length - 1]);
    setBehind((stack) => stack.slice(0, -1));
  };
  const redo = () => {
    if (!ahead.length) return;
    setBehind((stack) => [...stack, draft]);
    setDraft(ahead[0]);
    setAhead((stack) => stack.slice(1));
  };
  const undoRef = useRef(undo);
  undoRef.current = undo;
  const redoRef = useRef(redo);
  redoRef.current = redo;

  /* Asking the phone. The stage stays up and shows the note's own strokes as
     they arrive; the phone's Done is this stage's Done. */
  const lend = () => {
    if (!phone) return;
    /* The phone starts from what is drawn here so far. */
    onKeepRef.current(kept());
    setCropping(false);
    const asked = phone.lend();
    setAway(() => asked.cancel);
    void asked.done.then(
      () => finishRef.current(false),
      () => setAway(null),
    );
  };
  useEffect(() => () => away?.(), [away]);
  useEffect(() => {
    void until?.then(() => finishRef.current(true));
  }, [until]);
  /* While the phone has it, the canvas is the note's own strokes. */
  useEffect(() => {
    if (away) setDraft(live);
  }, [away, live]);

  const aspect = image
    ? planeCss({ crop: cropping ? WHOLE_CROP : crop, turns }, image.natural, spin).aspect
    : DRAWING_BOX.width / DRAWING_BOX.height;
  const plane = image
    ? planeCss({ crop: cropping ? WHOLE_CROP : crop, turns }, image.natural, spin)
    : null;
  const startCrop = () => {
    if (cropping) return setCropping(false);
    setRect(turnRect(turns, crop));
    setCropping(true);
  };
  const applyCrop = () => {
    setCrop(unturnRect(turns, rect));
    setCropping(false);
  };
  /* A corner, or the inside of the rectangle, followed with `window` listeners
     for the reason the ink is. */
  const grab =
    (kind: "nw" | "ne" | "sw" | "se" | "n" | "e" | "s" | "w" | "move") =>
    (event: React.PointerEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const box = imageBox.current!.getBoundingClientRect();
      const start = rect;
      const move = (next: PointerEvent) => {
        const dx = (next.clientX - event.clientX) / box.width;
        const dy = (next.clientY - event.clientY) / box.height;
        if (kind === "move") {
          setRect({
            ...start,
            x: clamp(start.x + dx, 0, 1 - start.w),
            y: clamp(start.y + dy, 0, 1 - start.h),
          });
          return;
        }
        let [x0, y0, x1, y1] = [start.x, start.y, start.x + start.w, start.y + start.h];
        if (kind.includes("w")) x0 = clamp(x0 + dx, 0, x1 - MIN_CROP_SIZE);
        if (kind.includes("e")) x1 = clamp(x1 + dx, x0 + MIN_CROP_SIZE, 1);
        if (kind.includes("n")) y0 = clamp(y0 + dy, 0, y1 - MIN_CROP_SIZE);
        if (kind.includes("s")) y1 = clamp(y1 + dy, y0 + MIN_CROP_SIZE, 1);
        setRect({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    };

  const surfaceClass = away
    ? ""
    : cropping
      ? ""
      : hand.erasing
        ? "is-erasing"
        : hand.shape === "move"
          ? "is-arranging"
          : "is-drawing";
  const button = (label: string, Glyph: typeof Pencil, onClick: () => void, disabled = false) => (
    <button
      type="button"
      className="draw-stage-button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Glyph size={18} />
    </button>
  );
  const surface = (
    <svg
      ref={ink.surface}
      className={`${image ? "rich-media-image-ink" : "draw-stage-board-ink"} ${surfaceClass}`}
      viewBox={`0 0 ${ink.box.width} ${ink.box.height}`}
      preserveAspectRatio={image ? "xMinYMin meet" : "none"}
      onPointerDown={away ? undefined : ink.start}
    >
      {ink.inked}
    </svg>
  );

  return createPortal(
    <div className="draw-stage" role="dialog" aria-modal="true" aria-label="Drawing">
      <div ref={ground} className="draw-stage-ground" />
      <div ref={chrome} className="draw-stage-chrome">
        <div className="draw-stage-top">
          <span className="draw-stage-group">{button("Cancel", X, () => finish(false))}</span>
          <span className="draw-stage-group">
            {!away && button("Undo", Undo2, undo, behind.length === 0)}
            {!away && button("Redo", Redo2, redo, ahead.length === 0)}
            {image && !away && button("Rotate", RotateCw, () => setSpin((n) => n + 1))}
            {image && !away && (
              <button
                type="button"
                className={`draw-stage-button ${cropping ? "is-active" : ""}`}
                aria-label="Crop"
                title="Crop"
                aria-pressed={cropping}
                onClick={startCrop}
              >
                <CropIcon size={18} />
              </button>
            )}
            {away && (
              <span className="draw-stage-away" role="status">
                <Smartphone size={16} />
                Drawing on iPhone
              </span>
            )}
          </span>
          <span className="draw-stage-group">
            {phone?.present &&
              !onDraft &&
              !away &&
              !cropping &&
              button("Draw on iPhone", Smartphone, lend)}
            {cropping ? (
              <button
                type="button"
                className="draw-stage-button is-done"
                aria-label="Crop"
                title="Crop"
                onClick={applyCrop}
              >
                <Check size={18} />
              </button>
            ) : (
              !away && (
                <button
                  type="button"
                  className="draw-stage-button is-done"
                  aria-label="Done"
                  title="Done"
                  onClick={() => finish(true)}
                >
                  <Check size={18} />
                </button>
              )
            )}
          </span>
        </div>
        {!away && !cropping && (
          <div className="draw-stage-tray">
            <PenTray hand={hand} />
          </div>
        )}
      </div>
      <div className="draw-stage-room">
        <div
          ref={canvas}
          className={`draw-stage-canvas ${image ? "" : "is-board"}`}
          style={{ ["--aspect" as string]: aspect }}
        >
          {image && plane ? (
            <div ref={imageBox} className="markup-image">
              <div className="media-plane" style={plane.style}>
                <img src={image.src} alt={image.alt || "Image"} draggable={false} />
                {surface}
              </div>
              {cropping && (
                <div className="markup-crop">
                  <span
                    className="markup-dim"
                    style={{ left: 0, top: 0, right: 0, height: `${rect.y * 100}%` }}
                  />
                  <span
                    className="markup-dim"
                    style={{ left: 0, bottom: 0, right: 0, top: `${(rect.y + rect.h) * 100}%` }}
                  />
                  <span
                    className="markup-dim"
                    style={{
                      left: 0,
                      top: `${rect.y * 100}%`,
                      width: `${rect.x * 100}%`,
                      height: `${rect.h * 100}%`,
                    }}
                  />
                  <span
                    className="markup-dim"
                    style={{
                      right: 0,
                      top: `${rect.y * 100}%`,
                      left: `${(rect.x + rect.w) * 100}%`,
                      height: `${rect.h * 100}%`,
                    }}
                  />
                  <div
                    className="markup-crop-rect"
                    style={{
                      left: `${rect.x * 100}%`,
                      top: `${rect.y * 100}%`,
                      width: `${rect.w * 100}%`,
                      height: `${rect.h * 100}%`,
                    }}
                    onPointerDown={grab("move")}
                  >
                    {(["n", "e", "s", "w", "nw", "ne", "sw", "se"] as const).map((corner) => (
                      <span
                        key={corner}
                        className={`markup-handle is-${corner}`}
                        data-corner={corner}
                        onPointerDown={grab(corner)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            surface
          )}
        </div>
      </div>
      {ink.menu}
    </div>,
    document.body,
  );
}

function PrivateFileView(props: NodeViewProps) {
  if (attachmentType(String(props.node.attrs.label)).startsWith("video/"))
    return <PrivateImageView {...props} />;
  return <PrivateAttachmentView {...props} />;
}

function PrivateAttachmentView({ node, extension, deleteNode, editor }: NodeViewProps) {
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
        <ExternalLink size={16} />
      </button>
      {editor.isEditable && (
        <span className="rich-media-file-actions" contentEditable={false}>
          <button
            type="button"
            className="rich-media-file-action"
            onClick={download}
            aria-label={`Download ${label}`}
          >
            <Download size={16} />
          </button>
          <button
            type="button"
            className="rich-media-file-action is-danger"
            onClick={deleteNode}
            aria-label={`Remove ${label}`}
          >
            <Trash2 size={16} />
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
/** The same for a board: one just inserted opens straight onto its stage. */
let boardWanted = false;

/** The ink and the nib outlive the drawing they were chosen on: picking red
 *  once should not have to be done again on the next sketch, on the next
 *  picture, or on the other surface. Module-level because it is a fact about
 *  the hand, not about any document — nothing here is ever written to a note. */
let lastInk: string = DRAWING_INKS[0];
let lastNib = 5;
let lastMarker = false;

/** What the hand is doing. `null` is the pen — the absence of a shape rather
 *  than a sixth button saying "no shape" — so pressing the shape you are
 *  holding puts it down, which is how the highlighter and the eraser beside it
 *  already work. It outlives the drawing for the same reason the ink does. */
let lastShape: InkTool | null = null;
let lastFilling = false;

/** What the hand may be holding besides the pen: the four shapes, the one that
 *  writes rather than draws, and the one that draws nothing and arranges what
 *  is there. All in the same slot and none of them a toggle of its own,
 *  because you are drawing a rectangle or captioning one or moving one, and
 *  never two of those at once. */
type InkTool = DrawingShape | "text" | "move";

/** A caption is set at the nib's own size times this. The nibs are the
 *  control that is already there for "how big", and reaching for the
 *  highlighter's thirty here would set a caption at a hundred and fifty. */
const TEXT_SCALE = 5;

/** Three nibs. A slider offers a hundred widths nobody wants to choose
 *  between; these are a fine line, a line, and a marker. */
const DRAWING_NIBS = [3, 6, 13];

/** What the hand can hold, in the order it reaches for them. Held as a list
 *  for the reason a menu is one in `menuShape.ts`: five buttons written out
 *  are five buttons to keep agreeing with each other, and the sixth somebody
 *  adds will agree with none of them. */
const DRAWING_TOOLS = [
  { tool: "line", label: "Straight line", Glyph: Minus },
  { tool: "arrow", label: "Arrow", Glyph: ArrowUpRight },
  { tool: "rect", label: "Rectangle", Glyph: Square },
  { tool: "ellipse", label: "Ellipse", Glyph: Circle },
  { tool: "text", label: "Caption", Glyph: Type },
  { tool: "move", label: "Move a mark", Glyph: Move },
] as const satisfies readonly { tool: InkTool; label: string; Glyph: typeof Minus }[];

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
  turned = false,
}: {
  strokes: DrawingMark[];
  write: (next: DrawingMark[]) => void;
  fit: "board" | "width";
  editable: boolean;
  /** The surface sits under a CSS transform (a turned or cropped picture):
   *  it is measured by layout size and read through its screen matrix, since
   *  its bounding box is no longer its shape. */
  turned?: boolean;
}) {
  const [ink, setInk] = useState<string>(lastInk);
  const [nib, setNib] = useState<number>(lastNib);
  const [marker, setMarker] = useState<boolean>(lastMarker);
  const [shape, setShape] = useState<InkTool | null>(lastShape);
  const [filling, setFilling] = useState<boolean>(lastFilling);
  const [erasing, setErasing] = useState(false);
  const [selectedStroke, setSelectedStroke] = useState<{
    stroke: DrawingMark;
    x: number;
    y: number;
  } | null>(null);
  /* A caption being typed, at the point of the page it was asked for. Held
     here and not in the document, because a caption nobody has finished is a
     caption nobody else needs to see arriving letter by letter. */
  const [composing, setComposing] = useState<{
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  useEffect(() => {
    if (!selectedStroke) return;
    const close = () => setSelectedStroke(null);
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [selectedStroke]);
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
  /* A fill is the ink with the highlighter's own alpha on it, which is the
     argument this file already makes about translucency: it is a property of
     the colour, so nothing that reads a stroke has to learn about fills any
     more than it had to learn about highlighters. It also means a filled
     shape drawn over the words still has the words under it. Only a closed
     shape can hold one — an arrow with an interior is a shape nobody drew. */
  const closed = shape === "rect" || shape === "ellipse";
  const fill = closed && filling ? `${ink}${MARKER_ALPHA}` : undefined;
  /* A caption takes the ink flat. The highlighter's alpha under a word is a
     word you cannot read, which is the opposite of what a caption is for. */
  const textSize = nib * TEXT_SCALE;

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
      const box = turned
        ? { width: element.offsetWidth, height: element.offsetHeight }
        : element.getBoundingClientRect();
      if (box.width > 0) setAspect(box.height / box.width);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [fit, turned]);
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
      if (turned) {
        const svg = surface.current;
        const matrix = svg?.getScreenCTM();
        if (!svg || !matrix) return null;
        const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
        const x = Math.round(point.x);
        const y = Math.round(point.y);
        return { x, y, at: `${x},${y}` };
      }
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
    [fit, turned],
  );

  /** The eraser takes whole strokes, not pixels of them. Half a line left
   *  behind is a line somebody has to go back for. */
  const rub = useCallback(
    (point: { x: number; y: number }) => {
      const kept = live.current.filter((mark) =>
        isDrawingText(mark)
          ? /* A caption is rubbed out by its anchor rather than by its
               outline: measuring the words would mean measuring the face, and
               a caption is one thing the way a stroke is one thing. */
            Math.hypot(mark.x - point.x, mark.y - point.y) > mark.size
          : !strokePoints(mark.d).some(
              (p) => Math.hypot(p.x - point.x, p.y - point.y) < mark.width / 2 + 10,
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

    /* A shape asked for outright. It is the same gesture the pen makes and a
       different thing to watch: the anchor stays where it went down and the
       shape is redrawn between it and wherever the pointer is now, so the
       hand is sizing one mark rather than laying a trail. Nothing is held
       still for and nothing is guessed at — which is the whole difference
       from `straightenStroke`, and the reason both exist: one is for a hand
       that was drawing and meant a rectangle, this is for a hand that came to
       draw a rectangle. */
    /* A caption is placed, not dragged: one press says where the words start,
       and the words themselves arrive from a field at that point rather than
       from the surface — an SVG takes no typing. It is portalled to the body
       and positioned by the pointer, which is what the menu beside it already
       does, so it costs none of the three surfaces a `position: relative` of
       their own. */
    if (shape === "text") {
      setComposing({ x: point.x, y: point.y, left: event.clientX, top: event.clientY });
      return;
    }

    /* Nothing. The move tool is not a thing the surface does, it is what makes
       the marks on the surface reachable — the page and a picture keep their
       ink transparent to the pointer while the pen is in hand, so that a line
       can be drawn across a line already there, and that is exactly the rule
       that has to be lifted to pick one up. A press on bare surface with it
       held is a press on nothing. */
    if (shape === "move") return;

    if (shape) {
      let last = point;
      const move = (next: PointerEvent) => {
        const step = at(next);
        if (!step) return;
        last = step;
        paint(shapeStroke(shape, point, step, width));
      };
      const finish = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", finish);
        /* A press that never travelled is somebody changing their mind, not a
           shape of no size — which on the page would be an invisible mark
           only the eraser could find. */
        if (Math.hypot(last.x - point.x, last.y - point.y) < 6) {
          paint("");
          return;
        }
        const drawn: DrawingStroke = {
          d: shapeStroke(shape, point, last, width),
          color: laid,
          width,
        };
        write([...live.current, fill ? { ...drawn, fill } : drawn]);
        paint("");
      };
      paint(shapeStroke(shape, point, point, width));
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
      // A page stroke may have moved entirely to media, leaving this layer unchanged.
      paint("");
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  }

  /* Pressing a mark already meant "this one" — it is how the menu that throws
     one away is opened. Dragging from that press moves it, which needs no
     tool of its own and no mode to be in: a thing you can point at is a thing
     you can drag, and the two are told apart by whether the pointer travelled.
     The translated path is written straight onto the element being dragged,
     for the reason a line being drawn is: sixty renders a second of every
     mark on the surface, to move one of them. */
  function take(mark: DrawingMark, event: React.PointerEvent<SVGElement>) {
    event.stopPropagation();
    event.preventDefault();
    const from = at(event);
    const element = event.currentTarget;
    if (!from) return;
    /* Where the mark is put while the pointer is holding it. A caption moves
       by its anchor and a stroke by every point of its path, which is the
       only place the two differ in this whole gesture. */
    const put = (dx: number, dy: number) => {
      if (isDrawingText(mark)) {
        element.setAttribute("x", String(Math.round(mark.x + dx)));
        element.setAttribute("y", String(Math.round(mark.y + dy)));
      } else element.setAttribute("d", translateStroke(mark.d, dx, dy));
    };
    let moved = false;
    const move = (next: PointerEvent) => {
      const step = at(next);
      if (!step) return;
      const dx = step.x - from.x;
      const dy = step.y - from.y;
      if (!moved && Math.hypot(dx, dy) < 6) return;
      moved = true;
      put(dx, dy);
    };
    const finish = (last: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      if (!moved) {
        setSelectedStroke({ stroke: mark, x: event.clientX, y: event.clientY });
        return;
      }
      const step = at(last);
      if (!step) {
        put(0, 0);
        return;
      }
      const dx = step.x - from.x;
      const dy = step.y - from.y;
      write(
        live.current.map((each) =>
          each !== mark
            ? each
            : isDrawingText(each)
              ? { ...each, x: Math.round(each.x + dx), y: Math.round(each.y + dy) }
              : { ...each, d: translateStroke(each.d, dx, dy) },
        ),
      );
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  }

  const inked = (
    <>
      {strokes.map((mark, index) =>
        isDrawingText(mark) ? (
          <text
            key={index}
            className={editable ? "ink-stroke" : undefined}
            onPointerDown={editable ? (event) => take(mark, event) : undefined}
            x={mark.x}
            y={mark.y}
            fill={mark.color}
            fontSize={mark.size}
            fontFamily={DRAWING_TEXT_FONT}
          >
            {mark.text}
          </text>
        ) : (
          <path
            key={index}
            className={editable ? "ink-stroke" : undefined}
            onPointerDown={editable ? (event) => take(mark, event) : undefined}
            d={mark.d}
            fill={mark.fill ?? "none"}
            stroke={mark.color}
            strokeWidth={mark.width}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ),
      )}
      <path
        ref={livePath}
        d=""
        fill={fill ?? "none"}
        stroke={laid}
        strokeWidth={width}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  );

  /* The field a caption is typed into. Portalled beside the menu and for the
     same reason: an SVG takes no typing, and putting an input inside each of
     the three surfaces means a `position: relative` and a stacking context on
     each of them. Enter writes it, Escape and an empty field throw it away —
     which is also what clicking elsewhere does, because a caption you walked
     away from is a caption you did not want. */
  const composer =
    composing && editable
      ? createPortal(
          <input
            className="ink-caption-field"
            autoFocus
            aria-label="Caption"
            maxLength={280}
            style={{
              left: Math.min(composing.left, window.innerWidth - 240),
              top: Math.min(composing.top, window.innerHeight - 52),
              color: ink,
            }}
            placeholder="Caption"
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Escape") setComposing(null);
              if (event.key !== "Enter") return;
              const text = event.currentTarget.value.trim();
              if (text)
                write([
                  ...live.current,
                  { text, x: composing.x, y: composing.y, color: ink, size: textSize },
                ]);
              setComposing(null);
            }}
            onBlur={() => setComposing(null)}
          />,
          document.body,
        )
      : null;

  const menu =
    selectedStroke && editable
      ? createPortal(
          <div
            role="menu"
            className="ink-delete-menu"
            style={{
              left: Math.min(selectedStroke.x, window.innerWidth - 175),
              top: Math.min(selectedStroke.y, window.innerHeight - 60),
            }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                write(live.current.filter((stroke) => stroke !== selectedStroke.stroke));
                setSelectedStroke(null);
              }}
            >
              Remove drawing
            </button>
          </div>,
          document.body,
        )
      : null;
  /* The same state and the same setters the palette above uses, for a surface
     that lays its own controls out (the picture's markup panel). */
  const hand = {
    ink,
    nib,
    marker,
    shape,
    filling,
    erasing,
    closed,
    choose,
    chooseNib(size: number) {
      lastNib = size;
      lastMarker = false;
      setNib(size);
      setMarker(false);
      setErasing(false);
    },
    toggleMarker() {
      lastMarker = !marker;
      setMarker((on) => !on);
      setErasing(false);
    },
    toggleShape(tool: InkTool) {
      const next = shape === tool ? null : tool;
      lastShape = next;
      setShape(next);
      setErasing(false);
      setComposing(null);
    },
    toggleFill() {
      lastFilling = !filling;
      setFilling((on) => !on);
    },
    toggleErase() {
      setErasing((on) => !on);
    },
    /** The plain pen: no shape, no highlighter, no eraser. */
    pen() {
      lastShape = null;
      lastMarker = false;
      setShape(null);
      setMarker(false);
      setErasing(false);
      setComposing(null);
    },
  };
  return {
    surface,
    box,
    start,
    inked,
    hand,
    erasing,
    arranging: shape === "move",
    menu: (
      <>
        {menu}
        {composer}
      </>
    ),
  };
}

function DrawingView({
  node,
  updateAttributes,
  deleteNode,
  editor,
  extension,
  getPos,
}: NodeViewProps) {
  const strokes = useMemo(() => drawingMarks(node.attrs.strokes as string), [node.attrs.strokes]);
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
    editor.view.dom.addEventListener(TAKE_UP_THE_PEN, take);
    return () => editor.view.dom.removeEventListener(TAKE_UP_THE_PEN, take);
  }, [onPage, editor]);

  const write = useCallback(
    (next: DrawingMark[]) => {
      const arrived = next[next.length - 1];
      /* Only a stroke can cross into a picture. A caption belongs to the
         surface it was written on: words that slid into a photograph when it
         happened to be under them is not a thing anybody asked for. */
      if (!onPage || next.length !== strokes.length + 1 || !arrived || isDrawingText(arrived)) {
        updateAttributes({ strokes: JSON.stringify(next) });
        return;
      }
      const page = editor.view.dom.getBoundingClientRect();
      const frames = Array.from(
        editor.view.dom.querySelectorAll<HTMLElement>(".rich-media-image-frame"),
      )
        .map((element) => {
          const wrapper = element.closest("[data-node-view-wrapper]")!;
          const pos = editor.view.posAtDOM(wrapper, 0);
          return { rect: element.getBoundingClientRect(), pos, node: editor.state.doc.nodeAt(pos) };
        })
        .filter(
          (frame) => frame.node && ["privateImage", "privateFile"].includes(frame.node.type.name),
        );
      const stroke: DrawingStroke = arrived;
      const sections = splitMediaStroke(
        stroke,
        page,
        frames.map((frame) => frame.rect),
      );
      const tr = editor.state.tr;
      for (let index = 0; index < frames.length; index++) {
        const added = sections
          .filter((section) => section.target === index)
          .map((section) => section.stroke);
        if (!added.length) continue;
        const frame = frames[index];
        tr.setNodeMarkup(frame.pos, undefined, {
          ...frame.node!.attrs,
          strokes: JSON.stringify([...drawingMarks(frame.node!.attrs.strokes), ...added]),
        });
      }
      if (tr.docChanged) editor.view.dispatch(tr);
      updateAttributes({
        strokes: JSON.stringify([
          ...strokes,
          ...sections.filter((section) => section.target === -1).map((section) => section.stroke),
        ]),
      });
    },
    [updateAttributes, onPage, strokes, editor],
  );
  const { surface, box, start, inked, hand, erasing, arranging, menu } = useInk({
    strokes,
    write,
    fit: onPage ? "width" : "board",
    /* A board is drawn on its stage; in the note it is only shown. */
    editable: editor.isEditable && onPage,
  });
  const sheet = useRef<HTMLButtonElement>(null);
  const stage = useStage(
    editor,
    () => {
      const noteId = (extension.options as { noteId: () => string | undefined }).noteId();
      const at = typeof getPos === "function" ? getPos() : undefined;
      if (!noteId || onPage || at === undefined) return null;
      /* A board is named by its place among the note's boards: it has no id
         of its own, and the two screens hold the same document. */
      let board = 0;
      editor.state.doc.descendants((each, pos) => {
        if (pos >= at) return false;
        if (each.type.name === node.type.name && drawingSurface(each.attrs.surface) !== "page")
          board++;
      });
      return { noteId, board };
    },
    () => sheet.current?.scrollIntoView({ block: "center", behavior: "instant" }),
  );
  const openStage = stage.open;
  useEffect(() => {
    if (onPage || !boardWanted) return;
    boardWanted = false;
    openStage("own");
    // Once, for the board that was just asked for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const remove = (
    <button
      type="button"
      className="rich-media-file-action is-danger"
      aria-label={onPage ? "Remove the drawing layer" : "Remove drawing"}
      title={onPage ? "Remove the drawing layer" : "Remove drawing"}
      onClick={deleteNode}
    >
      <Trash2 size={16} />
    </button>
  );

  if (onPage) {
    return (
      <NodeViewWrapper className="drawing-overlay" contentEditable={false}>
        {menu}
        <svg
          ref={surface}
          className={`drawing-overlay-surface ${
            pen && !erasing && !arranging ? "is-drawing" : ""
          } ${pen && erasing ? "is-erasing" : ""} ${pen && arranging ? "is-arranging" : ""}`}
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
              <PenTray hand={hand}>
                <span className="pen-tray-rule" />
                <button
                  type="button"
                  className="pen-tray-tool"
                  aria-label="Undo the last stroke"
                  title="Undo the last stroke"
                  disabled={strokes.length === 0}
                  onClick={() => write(strokes.slice(0, -1))}
                >
                  <Undo2 size={18} />
                </button>
                <button
                  type="button"
                  className="pen-tray-tool"
                  aria-label="Remove the drawing layer"
                  title="Remove the drawing layer"
                  onClick={deleteNode}
                >
                  <Trash2 size={18} />
                </button>
                <button
                  type="button"
                  className="pen-tray-tool is-done"
                  aria-label="Put the pen down"
                  title="Put the pen down"
                  onClick={() => setPen(false)}
                >
                  <Check size={18} />
                </button>
              </PenTray>
            ) : (
              <button
                type="button"
                className="rich-media-file-action"
                aria-label="Draw on the page"
                title="Draw on the page"
                onClick={() => setPen(true)}
              >
                <Pencil size={16} />
              </button>
            )}
          </span>
        )}
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper className="rich-media-drawing">
      <button
        ref={sheet}
        type="button"
        className="rich-media-drawing-sheet"
        contentEditable={false}
        aria-label="Draw"
        disabled={!editor.isEditable}
        onClick={() => stage.open("own")}
      >
        <svg
          ref={surface}
          className="rich-media-drawing-surface"
          viewBox={`0 0 ${box.width} ${box.height}`}
          preserveAspectRatio="none"
        >
          {inked}
        </svg>
      </button>
      {editor.isEditable && (
        <span className="rich-media-drawing-tools" contentEditable={false}>
          <button
            type="button"
            className="rich-media-file-action"
            aria-label="Draw"
            title="Draw"
            onClick={() => stage.open("own")}
          >
            <Pencil size={16} />
          </button>
          {remove}
        </span>
      )}
      {stage.mode && sheet.current && (
        <DrawingStage
          subject={{ kind: "board" }}
          initial={strokes}
          live={strokes}
          anchor={sheet.current}
          phone={stage.phone}
          until={stage.until}
          onDraft={
            stage.mode === "lent"
              ? (next) => updateAttributes({ strokes: JSON.stringify(next) })
              : undefined
          }
          onKeep={(next) => updateAttributes({ strokes: JSON.stringify(next.strokes) })}
          onClose={stage.close}
        />
      )}
    </NodeViewWrapper>
  );
}

/* The schema lives in `content.ts`, where the collaboration server can read it
   without React. What is added here is only what a browser can do with it. */
function privateImageExtension(
  resolve: Resolver,
  open: PrivateImageOptions["open"],
  noteId: () => string | undefined,
) {
  return PrivateImage.extend<PrivateImageOptions>({
    addOptions: () => ({ resolve, open, noteId }),
    addNodeView() {
      return ReactNodeViewRenderer(PrivateImageView);
    },
  });
}

function drawingExtension(noteId: () => string | undefined) {
  return Drawing.extend<{ noteId: () => string | undefined }>({
    addOptions: () => ({ noteId }),
    addNodeView() {
      return ReactNodeViewRenderer(DrawingView);
    },
  });
}

/* Declared once, outside the component: an extension object made per render
   is a new schema member every time Tiptap compares its list. */
const ContentsWithView = TableOfContents.extend({
  addNodeView() {
    return ReactNodeViewRenderer(ContentsView);
  },
});

const FootnoteWithView = Footnote.extend({
  addNodeView() {
    return ReactNodeViewRenderer(FootnoteView);
  },
});

function crossReferenceExtension(noteId: () => string) {
  return CrossReference.extend<{ noteId: () => string }>({
    addOptions: () => ({ noteId }),
    addNodeView() {
      return ReactNodeViewRenderer(CrossReferenceView);
    },
  });
}

const CitationWithView = Citation.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CitationView);
  },
});

const BibliographyWithView = Bibliography.extend({
  addNodeView() {
    return ReactNodeViewRenderer(BibliographyView);
  },
});

const VIEWED_ELSEWHERE = new Set([
  "tableOfContents",
  "footnote",
  "crossReference",
  "citation",
  "bibliography",
]);

function privateFileExtension(resolve: Resolver) {
  return PrivateFile.extend<PrivateFileOptions>({
    addOptions: () => ({ resolve }),
    addNodeView() {
      return ReactNodeViewRenderer(PrivateFileView);
    },
  });
}

/* The picture grows out of itself in the note rather than appearing over it.
   Already decoded when it was shown in the note, so it is usually complete at
   mount and can be measured at once; otherwise it waits for the bytes. */
const openOut = (img: HTMLImageElement | null) => {
  if (!img) return;
  if (img.complete) emerge(img, "zoom");
  else img.addEventListener("load", () => emerge(img, "zoom"), { once: true });
};

function ImageLightbox({ preview, onClose }: { preview: ImagePreview; onClose: () => void }) {
  const layer = useRef<HTMLDivElement>(null);
  const close = () => leave(layer.current, onClose);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") leave(layer.current, onClose);
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
      ref={layer}
      onClick={close}
    >
      <figure className="lightbox-figure" onClick={(event) => event.stopPropagation()}>
        <img src={preview.src} alt={preview.alt} ref={openOut} />
      </figure>
      <button
        type="button"
        onClick={close}
        className="round-close lightbox-close press"
        aria-label="Close image"
      >
        <X size={18} />
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
    writing,
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
  /* Read by the plugin on every transaction, so a change of setting needs no
     new editor — only the empty transaction below, to draw it again. */
  const writingRef = useRef<WritingFocusSettings>(writing ?? { focus: "off", typewriter: false });
  writingRef.current = writing ?? { focus: "off", typewriter: false };
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
        ...(manuscript
          ? [
              ManuscriptKeys,
              footnoteShortcut,
              suggestions,
              WritingFocus.configure({ read: () => writingRef.current }),
            ]
          : []),
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
        if (!transaction.getMeta(ySyncPluginKey)) queueMicrotask(() => onLocalEditRef.current?.());
      },
    },
    [collaboration?.document, collaboration?.provider],
  );

  /* The set arrived or changed: draw the anchors again against it. */
  useEffect(() => {
    if (editor && !editor.isDestroyed)
      editor.view.dispatch(editor.state.tr.setMeta(unsaidKey, true).setMeta("addToHistory", false));
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
          chain.insertTable({ rows: 2, cols: Number(action.slice(-1)), withHeaderRow: true }).run();
        else if (action === "table-delete-column") chain.deleteColumn().run();
        else if (action === "table-delete-row") chain.deleteRow().run();
        else if (action === "table-delete") chain.deleteTable().run();
      } else if (action === "drawing") {
        boardWanted = true;
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
        if (existing) editor.view.dom.dispatchEvent(new Event(TAKE_UP_THE_PEN));
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
  const insertionPoint = useCallback((): FocusPosition => (caretPlaced.current ? null : "end"), []);

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

  const focusSetting = writing?.focus ?? "off";
  useEffect(() => {
    if (editor && !editor.isDestroyed)
      editor.view.dispatch(editor.state.tr.setMeta(WRITING_FOCUS, focusSetting));
  }, [editor, focusSetting]);

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
  const [code, setCode] = useState<{ block: HTMLElement; top: number; right: number } | null>(null);
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
        now?.block === block ? now : { block, top: box.top, right: window.innerWidth - box.right },
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
                      const current = (Object.keys(TEXT_COLOR_VALUE) as TextColor[]).find((color) =>
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
});
