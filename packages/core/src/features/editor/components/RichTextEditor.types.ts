import { type TextColor } from "@/features/editor/lib/content";
import { type PlaceTarget } from "@/lib/documentContents";
import { type Adoption, type ChapterTargets } from "@/lib/references";
import type { HocuspocusProvider } from "@hocuspocus/provider";
import { type Editor, type JSONContent } from "@tiptap/core";
import type * as Y from "yjs";
import { type SuggestionMode } from "../lib/suggestions";

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

export interface RichTextEditorProps {
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
  /** Offered on chosen words: talk about them in the general chat, which
   *  grows out of `at`, where they are. */
  onDiscuss?: (quote: string, at: DOMRect | null) => void;
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
  /** The note this editor holds, for a cross-reference to say "in chapter 2"
   *  only of what is not in this one. */
  noteId?: string;
  /** A document with footnotes on: ⌥⌘F puts one in. */
  footnotes?: boolean;
  /** A document only: what this chapter can be cited by, as it is typed. */
  onTargets?: (targets: ChapterTargets) => void;
}
