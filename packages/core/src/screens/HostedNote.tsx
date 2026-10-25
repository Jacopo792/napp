import type { Note as StoredNote } from "@/lib/types";
import { useStoredImage } from "@/lib/media";
import { coverBackground } from "@/lib/pageProperties";
/* One note and nothing around it, for a host that draws its own chrome.
 *
 * The phone cannot draw the editor — ProseMirror is a DOM — so it hosts this
 * page in a WebView and keeps the list, the navigation and the gestures for
 * itself. What is here is exactly what `NoteEditor` binds to a note: the same
 * `useCollaborativeNote`, the same `TitleField` and `RichTextEditor` over the
 * same Y.Doc, so the schema and every rule in `writeLocks.ts` stay one.
 * Nothing in this file knows it is in a WebView; the page around it does. */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import {
  PEN_STATE,
  PUT_DOWN_THE_PEN,
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
import type { HostedCommand, HostedController, HostedFormat } from "@/lib/hostedCommands";
import { restoreKeptVersion } from "@/lib/historyRestore";
import { nameVersion } from "@/lib/history";
import { exportFileName, noteToMarkdown } from "@/features/editor/lib/exchange";
import { platform } from "@/platform";
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
  available: boolean;
  format: HostedFormat;
  /** The pen is in hand on the page: the host's bars make way for the ink. */
  drawing: boolean;
}

const RESTING: HostedFormat = {
  marks: [],
  block: "body",
  list: null,
  selection: false,
  canUndo: false,
  canRedo: false,
};

function formatOf(editor: Editor): HostedFormat {
  const marks = (["bold", "italic", "underline", "strike", "code", "link"] as const).filter(
    (mark) => editor.isActive(mark),
  );
  const heading = ([1, 2, 3] as const).find((level) => editor.isActive("heading", { level }));
  return {
    marks,
    block: heading ? `heading-${heading}` : editor.isActive("blockquote") ? "quote" : "body",
    list: editor.isActive("taskList")
      ? "checklist"
      : editor.isActive("orderedList")
        ? "ordered-list"
        : editor.isActive("bulletList")
          ? "bullet-list"
          : null,
    selection: !editor.state.selection.empty,
    canUndo: editor.can().undo(),
    canRedo: editor.can().redo(),
  };
}

interface Props {
  session: AppSession;
  noteId: string;
  /** The caret's own label. What other members see is stamped by the server. */
  name: string;
  canEdit: boolean;
  artwork?: Pick<StoredNote, "photo" | "cover">;
  /** Where the note stands, for the host to say: a wait that is not named
   *  reads as a fault. */
  onState?: (state: HostedNoteState) => void;
  autocorrectOn?: boolean;
  collaboratorsVisible?: boolean;
  onOpenNote?: (noteId: string) => void;
  onOpenLink?: () => void;
  onOpenComment?: (threadId: string) => void;
  /** A picture was tapped: the host shows it, out of its place in the note. */
  onOpenImage?: (image: HTMLImageElement, src: string, alt: string) => void;
}

const EMPTY = { type: "doc", content: [] };

export const HostedNote = forwardRef<HostedController, Props>(function HostedNote(
  {
    session,
    noteId,
    name,
    canEdit,
    artwork,
    onState,
    autocorrectOn = true,
    collaboratorsVisible = true,
    onOpenLink,
    onOpenNote,
    onOpenComment,
    onOpenImage,
  },
  ref,
) {
  const note = useCollaborativeNote(noteId, {
    userId: session.userId,
    archiveId: session.archiveId,
    name,
  });
  const current = useRef(note);
  current.current = note;
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const editorRef = useRef<RichTextEditorHandle>(null);
  /* The instance itself, for the phone's bar: what the selection is set in,
     and the few edits the handle has no verb for. */
  const [instance, setInstance] = useState<Editor | null>(null);
  const [format, setFormat] = useState<HostedFormat>(RESTING);
  useEffect(() => {
    if (!instance) return;
    let last = "";
    const read = () => {
      if (instance.isDestroyed) return;
      const next = formatOf(instance);
      const key = JSON.stringify(next);
      if (key !== last) {
        last = key;
        setFormat(next);
      }
    };
    /* The undo stack is Yjs's and fills as the binding writes, a beat after
       the transaction this hears. */
    const soon = () => queueMicrotask(read);
    read();
    instance.on("transaction", soon);
    return () => {
      instance.off("transaction", soon);
    };
  }, [instance]);
  const [drawing, setDrawing] = useState(false);
  useEffect(() => {
    if (!instance) return;
    const dom = instance.view.dom;
    const heard = (event: Event) => setDrawing(Boolean((event as CustomEvent<boolean>).detail));
    dom.addEventListener(PEN_STATE, heard);
    return () => {
      dom.removeEventListener(PEN_STATE, heard);
      setDrawing(false);
    };
  }, [instance]);
  /* A tap on a commented passage, read at rest, opens its conversation —
     the underline is the only sign one exists. Taken on the touch's end and
     prevented there, so WebKit neither focuses the page (the keyboard would
     rise under the sheet) nor synthesises the click the editor would also
     answer. While writing, the same tap only moves the caret: a commented
     passage has to stay editable. A finger that travelled was scrolling. */
  const page = useRef<HTMLDivElement>(null);
  const openComment = useRef(onOpenComment);
  openComment.current = onOpenComment;
  useEffect(() => {
    const root = page.current;
    if (!root) return;
    let start: { x: number; y: number; writing: boolean } | null = null;
    const down = (event: TouchEvent) => {
      const touch = event.touches[0];
      const active = document.activeElement;
      start =
        event.touches.length === 1 && touch
          ? {
              x: touch.clientX,
              y: touch.clientY,
              writing: Boolean(active && root.contains(active)),
            }
          : null;
    };
    const up = (event: TouchEvent) => {
      const from = start;
      start = null;
      const touch = event.changedTouches[0];
      if (!from || from.writing || !touch || !openComment.current) return;
      if (Math.hypot(touch.clientX - from.x, touch.clientY - from.y) > 10) return;
      const threadId = (event.target as Element | null)
        ?.closest?.("span[data-comment-thread]")
        ?.getAttribute("data-comment-thread");
      if (!threadId) return;
      event.preventDefault();
      openComment.current(threadId);
    };
    root.addEventListener("touchstart", down, { passive: true });
    root.addEventListener("touchend", up, { passive: false });
    return () => {
      root.removeEventListener("touchstart", down);
      root.removeEventListener("touchend", up);
    };
  }, []);
  const writable = useRef(canEdit);
  writable.current = canEdit;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      async execute(command: HostedCommand) {
        if (command.type === "putDownPen") {
          instance?.view.dom.dispatchEvent(new Event(PUT_DOWN_THE_PEN));
          return null;
        }
        if (command.type === "edit" && command.action === "done") {
          (document.activeElement as HTMLElement | null)?.blur();
          window.getSelection()?.removeAllRanges();
          return null;
        }
        /* Asked from the Comments sheet, perhaps before the note has arrived
           — opened from the Comments tab, or a long note still syncing. A
           passage not there yet may be on its way; one absent from a synced
           note is not. */
        if (command.type === "revealComment") {
          for (const until = Date.now() + 10000; Date.now() < until; ) {
            const ready = editorRef.current;
            if (ready?.showComment(command.threadId)) return true;
            if (ready && current.current.ready) return false;
            await new Promise((resolve) => setTimeout(resolve, 150));
          }
          return false;
        }
        const editor = editorRef.current;
        if (!editor || !note.doc) throw new Error("The note is still loading");
        const title = note.doc.getText(TITLE_TEXT);
        const body = () => {
          const content = editor.getContent();
          if (!content) throw new Error("The note is still loading");
          return { title: title.toString(), content };
        };
        const readonly = [
          "body",
          "export",
          "commentQuotes",
          "search",
          "nextMatch",
          "previousMatch",
          "closeSearch",
          /* Asked as the note opens, a beat before the page hears it may write. */
          "focusTitle",
        ];
        if (!writable.current && !readonly.includes(command.type))
          throw new Error("This note is read-only");
        switch (command.type) {
          case "body":
            return body();
          case "link":
            editor.insertLink(editor.getSelectedText(), command.url);
            break;
          case "format":
            editor.format(command.action);
            break;
          case "export": {
            const current = body();
            if (command.format === "md")
              await platform().saveFile(
                exportFileName(current.title),
                noteToMarkdown(current.title, current.content),
                "text/markdown",
              );
            else await editor.exportNote(command.format, current.title);
            break;
          }
          case "restore": {
            await restoreKeptVersion({
              current: body,
              canWrite: () => writable.current && mounted.current,
              earlier: command.body,
              keep: (present) =>
                nameVersion(session, noteId, "Before restoring a version", present),
              apply: (earlier) => {
                note.doc!.transact(() => {
                  title.delete(0, title.length);
                  title.insert(0, earlier.title);
                });
                editorRef.current?.replaceContent(earlier.content);
              },
            });
            break;
          }
          case "attach":
            if (command.image) editor.insertImage(command.objectId, command.label);
            else editor.insertAttachment(command.label, command.objectId);
            break;
          case "comment":
            return editor.commentSelection(command.threadId);
          case "commentQuotes":
            return Object.fromEntries(editor.commentQuotes());
          case "resolveComment":
            editor.setCommentResolved(command.threadId, command.resolved);
            break;
          case "removeComment":
            editor.removeComment(command.threadId);
            break;
          case "search":
            return editor.setSearch(command.query);
          case "nextMatch":
            return editor.findNext();
          case "previousMatch":
            return editor.findPrevious();
          case "closeSearch":
            editor.closeSearch();
            break;
          case "focusTitle":
            titleRef.current?.focus();
            break;
          case "edit": {
            const chain = instance?.chain().focus();
            if (!chain) break;
            if (command.action === "undo") chain.undo().run();
            else if (command.action === "redo") chain.redo().run();
            else if (command.action === "underline") chain.toggleUnderline().run();
            else if (command.action === "indent")
              chain.sinkListItem(instance!.isActive("taskList") ? "taskItem" : "listItem").run();
            else if (command.action === "outdent")
              chain.liftListItem(instance!.isActive("taskList") ? "taskItem" : "listItem").run();
            break;
          }
        }
        return null;
      },
    }),
    [note.doc, session, noteId, instance],
  );

  const { connection, ready, refusal, waking } = note;
  useEffect(() => {
    onState?.({
      connection,
      ready,
      refusal,
      waking,
      available: Boolean(note.doc && (ready || note.cached)),
      format,
      drawing,
    });
  }, [onState, connection, ready, refusal, waking, note.doc, note.cached, format, drawing]);

  const resolveImage = useCallback((id: string) => downloadImage(session, id), [session]);
  const resolveFile = useCallback(
    (id: string) => downloadObject(session, id, "application/pdf"),
    [session],
  );

  const cover = artwork?.cover ?? null;
  const coverImage = useStoredImage(cover?.kind === "upload" ? cover.objectId : null, resolveImage);
  const photoImage = useStoredImage(artwork?.photo?.objectId ?? null, resolveImage);

  const collaboration =
    (note.ready || note.cached) && note.doc
      ? { document: note.doc, provider: collaboratorsVisible ? note.provider : null }
      : null;

  return (
    <div ref={page} className="editor-scroll min-h-0 flex-1">
      {cover ? (
        <div
          className="note-page-cover hosted-page-cover"
          role="img"
          aria-label="Note cover"
          style={{
            backgroundImage:
              cover.kind === "preset"
                ? (coverBackground(cover) ?? undefined)
                : coverImage
                  ? `url("${coverImage}")`
                  : undefined,
            backgroundSize: "cover",
            backgroundPosition: `center ${cover.position * 100}%`,
          }}
        />
      ) : null}
      {/* The ink covers the body only; with the pen in hand the title is not a
          place to start typing, or a stray touch raises the keyboard over the
          tools. */}
      <header className="px-5 pt-5 pb-3" style={drawing ? { pointerEvents: "none" } : undefined}>
        <div
          className="measure note-frontispiece-measure"
          style={{ display: "flex", alignItems: "center", gap: 12 }}
        >
          {artwork?.photo ? (
            <div className="hosted-note-photo">
              {photoImage ? <img src={photoImage} alt="Note picture" /> : null}
            </div>
          ) : null}
          <div style={{ flex: 1, minWidth: 0 }}>
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
            onOpenLink={onOpenLink ?? (() => {})}
            onOpenNote={onOpenNote}
            writeLockOwner={canEdit ? session.userId : null}
            resolveImage={resolveImage}
            resolveFile={resolveFile}
            collaboration={collaboration}
            onEditor={setInstance}
            onOpenImage={onOpenImage}
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
});
