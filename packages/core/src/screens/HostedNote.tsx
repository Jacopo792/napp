/* One note and nothing around it, for a host that draws its own chrome.
 *
 * The phone cannot draw the editor — ProseMirror is a DOM — so it hosts this
 * page in a WebView and keeps the list, the navigation and the gestures for
 * itself. What is here is exactly what `NoteEditor` binds to a note: the same
 * `useCollaborativeNote`, the same `TitleField` and `RichTextEditor` over the
 * same Y.Doc, so the schema and every rule in `writeLocks.ts` stay one.
 * Nothing in this file knows it is in a WebView; the page around it does. */
import { useCallback, useEffect, useRef } from "react";
import {
  RichTextEditor,
  type RichTextEditorHandle,
} from "@/features/editor/components/RichTextEditor";
import { TitleField } from "@/features/editor/components/TitleField";
import { TITLE_TEXT } from "@/features/editor/lib/ydoc";
import { initAppearance } from "@/lib/appearance";
import { initAxes } from "@/lib/axes";
import { useCollaborativeNote, type CollaborativeNote } from "@/lib/collab";
import type { AppSession } from "@/lib/session";
import { downloadImage, downloadObject } from "@/lib/supabase";
import { initWritingPreferences } from "@/lib/writingPreferences";

/* Before React, as App.tsx does: these write the CSS custom properties the
   editor is drawn in. */
initAppearance();
initAxes();
initWritingPreferences();

export interface HostedNoteState {
  connection: CollaborativeNote["connection"];
  ready: boolean;
  refusal: string;
  waking: boolean;
}

interface Props {
  session: AppSession;
  noteId: string;
  /** The caret's own label. What other members see is stamped by the server. */
  name: string;
  canEdit: boolean;
  /** Where the note stands, for the host to say: a wait that is not named
   *  reads as a fault. */
  onState?: (state: HostedNoteState) => void;
  autocorrectOn?: boolean;
  collaboratorsVisible?: boolean;
}

const EMPTY = { type: "doc", content: [] };

export function HostedNote({
  session,
  noteId,
  name,
  canEdit,
  onState,
  autocorrectOn = true,
  collaboratorsVisible = true,
}: Props) {
  const note = useCollaborativeNote(noteId, {
    userId: session.userId,
    archiveId: session.archiveId,
    name,
  });
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const editorRef = useRef<RichTextEditorHandle>(null);

  const { connection, ready, refusal, waking } = note;
  useEffect(() => {
    onState?.({ connection, ready, refusal, waking });
  }, [onState, connection, ready, refusal, waking]);

  const resolveImage = useCallback((id: string) => downloadImage(session, id), [session]);
  const resolveFile = useCallback(
    (id: string) => downloadObject(session, id, "application/pdf"),
    [session],
  );

  const collaboration =
    (note.ready || note.cached) && note.doc
      ? { document: note.doc, provider: collaboratorsVisible ? note.provider : null }
      : null;

  return (
    <div className="editor-scroll min-h-0 flex-1">
      <header className="px-5 pt-5 pb-3">
        <div className="measure note-frontispiece-measure">
          <TitleField
            mobile
            noteId={noteId}
            canEdit={canEdit}
            titleRef={titleRef}
            onEdited={() => {}}
            onDone={() => editorRef.current?.focus()}
            yTitle={note.doc?.getText(TITLE_TEXT) ?? null}
            synced={note.ready}
          />
        </div>
      </header>
      {/* The same gutter NoteEditor gives the body on a phone. */}
      <div className="px-5">
        {collaboration ? (
          <RichTextEditor
            key={noteId}
            ref={editorRef}
            mobile
            noteId={noteId}
            value={EMPTY}
            readOnly={!canEdit}
            autocorrectOn={autocorrectOn}
            placeholder="Start writing…"
            /* Yjs is the writer and the server persists it; the page has
               nothing of its own to keep. */
            onChange={() => {}}
            onOpenLink={() => {}}
            writeLockOwner={canEdit ? session.userId : null}
            resolveImage={resolveImage}
            resolveFile={resolveFile}
            collaboration={collaboration}
          />
        ) : (
          <div className="note-body-waiting" aria-hidden="true">
            <div className="skeleton" style={{ width: "92%" }} />
            <div className="skeleton" style={{ width: "78%" }} />
            <div className="skeleton" style={{ width: "45%" }} />
          </div>
        )}
      </div>
    </div>
  );
}
