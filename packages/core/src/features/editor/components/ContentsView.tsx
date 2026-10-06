/* The `[TOC]` block in the editor: the document's contents, read live from
 * the screen that knows the structure (`documentContents.ts`). It holds no
 * text of its own, so there is nothing in it to edit or to fall out of date. */
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { ContentsList } from "@/components/ContentsList";
import { openPlace, useDocumentContents } from "@/lib/documentContents";

export function ContentsView({ selected }: NodeViewProps) {
  const entries = useDocumentContents();
  return (
    <NodeViewWrapper
      className={`contents-block ${selected ? "is-selected" : ""}`}
      contentEditable={false}
      data-contents=""
    >
      <ContentsList entries={entries} onOpen={(noteId, text) => openPlace({ noteId, text })} />
    </NodeViewWrapper>
  );
}
