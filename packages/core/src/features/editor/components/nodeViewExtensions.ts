import { ReactNodeViewRenderer } from "@tiptap/react";
import {
  Bibliography,
  Citation,
  CrossReference,
  Drawing,
  Footnote,
  PrivateFile,
  PrivateImage,
  TableOfContents,
} from "../lib/content";
import { BibliographyView } from "./BibliographyView";
import { CitationView } from "./CitationView";
import { ContentsView } from "./ContentsView";
import { CrossReferenceView } from "./CrossReferenceView";
import { DrawingView } from "./DrawingView";
import { FootnoteView } from "./FootnoteView";
import {
  PrivateFileView,
  PrivateImageView,
  type PrivateFileOptions,
  type PrivateImageOptions,
  type Resolver,
} from "./mediaNodeViews";
/** Browser node views extend the shared schema without changing persisted nodes. */

/* Declared once, outside the component: an extension object made per render
   is a new schema member every time Tiptap compares its list. */
export const ContentsWithView = TableOfContents.extend({
  addNodeView() {
    return ReactNodeViewRenderer(ContentsView);
  },
});

export const FootnoteWithView = Footnote.extend({
  addNodeView() {
    return ReactNodeViewRenderer(FootnoteView);
  },
});

export function crossReferenceExtension(noteId: () => string) {
  return CrossReference.extend<{ noteId: () => string }>({
    addOptions: () => ({ noteId }),
    addNodeView() {
      return ReactNodeViewRenderer(CrossReferenceView);
    },
  });
}

export const CitationWithView = Citation.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CitationView);
  },
});

export const BibliographyWithView = Bibliography.extend({
  addNodeView() {
    return ReactNodeViewRenderer(BibliographyView);
  },
});

export const VIEWED_ELSEWHERE = new Set([
  "tableOfContents",
  "footnote",
  "crossReference",
  "citation",
  "bibliography",
]);

export function drawingExtension(noteId: () => string | undefined) {
  return Drawing.extend<{ noteId: () => string | undefined }>({
    addOptions: () => ({ noteId }),
    addNodeView() {
      return ReactNodeViewRenderer(DrawingView);
    },
  });
}

/* The schema lives in `content.ts`, where the collaboration server can read it
   without React. What is added here is only what a browser can do with it. */
export function privateImageExtension(
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

export function privateFileExtension(resolve: Resolver) {
  return PrivateFile.extend<PrivateFileOptions>({
    addOptions: () => ({ resolve }),
    addNodeView() {
      return ReactNodeViewRenderer(PrivateFileView);
    },
  });
}
