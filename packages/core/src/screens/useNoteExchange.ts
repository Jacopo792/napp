import { assertAttachable, attachmentLabel } from "@/features/editor/lib/attachments";
import {
  legacyMarkdownToRichText,
  RICH_TEXT_VERSION,
  richTextToPlainText,
} from "@/features/editor/lib/content";
import { readDraft } from "@/features/editor/lib/draft";
import {
  exportFileName,
  markdownToNote,
  noteToMarkdown,
  uniqueFileNames,
} from "@/features/editor/lib/exchange";
import { projectDocument } from "@/features/editor/lib/ydoc";
import { useCollaborativeNote } from "@/lib/collab";
import { referenceSnapshot } from "@/lib/documentContents";
import { type NoteEntry } from "@/lib/entries";
import { captureRows } from "@/lib/motion";
import { referenceText, resolveReference, targetKind } from "@/lib/references";
import { ALL, ARCHIVE, TRASH } from "@/lib/scopes";
import { type AppSession } from "@/lib/session";
import { createNote, loadNote, removeObject, uploadObject } from "@/lib/supabase";
import { EMPTY_META, type Meta, type Note, type NoteMeta } from "@/lib/types";
import { platform, type DriveImportFile } from "@/platform";
import type { JSONContent } from "@tiptap/core";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { useCallback } from "react";
interface ExchangeOptions {
  selectedId: string | null;
  collaborative: Pick<ReturnType<typeof useCollaborativeNote>, "ready" | "doc">;
  orderedVisible: NoteEntry[];
  folderLabel: string;
  sessionRef: RefObject<AppSession | null>;
  entriesRef: RefObject<NoteEntry[]>;
  metasRef: RefObject<Record<string, Meta>>;
  viewAs: string;
  selectedFolderId: string;
  canWriteArchive: boolean;
  flushPendingFolder: (session: AppSession, folderId: string) => Promise<void>;
  setEntries: Dispatch<SetStateAction<NoteEntry[]>>;
  setMetas: Dispatch<SetStateAction<Record<string, Meta>>>;
  setSaving: (saving: boolean) => void;
  setError: (message: string) => void;
  setStatusFlash: (message: string) => void;
  setSelectedFolderId: (id: string) => void;
}

function importedNote(ownerId: string, title: string, content: JSONContent): Note {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title,
    body: richTextToPlainText(content),
    content,
    contentVersion: RICH_TEXT_VERSION,
    legacyBody: null,
    photo: null,
    cover: null,
    ownerId,
    createdAt: now,
    updatedAt: now,
  };
}

/** A Markdown export's cross-references say what the archive gives them
 *  now, rather than the words they were made with. */
function citing(from: string) {
  return {
    reference: (attrs: Record<string, unknown>) => {
      const { counted, settings, chapters } = referenceSnapshot();
      if (!chapters.length || typeof attrs.target !== "string") return null;
      const target = resolveReference(counted, {
        target: attrs.target,
        noteId: typeof attrs.noteId === "string" ? attrs.noteId : from,
        kind: targetKind(attrs.kind),
        match: typeof attrs.match === "string" ? attrs.match : "",
      });
      return target ? referenceText(target, from, settings) : null;
    },
  };
}
/** Markdown exchange reads the live document before invoking asynchronous host I/O. */
export function useNoteExchange({
  selectedId,
  collaborative,
  orderedVisible,
  folderLabel,
  sessionRef,
  entriesRef,
  metasRef,
  viewAs,
  selectedFolderId,
  canWriteArchive,
  flushPendingFolder,
  setEntries,
  setMetas,
  setSaving,
  setError,
  setStatusFlash,
  setSelectedFolderId,
}: ExchangeOptions) {
  const markdownFor = useCallback(
    (entry: NoteEntry) => {
      if (entry.note.id === selectedId && collaborative.ready && collaborative.doc) {
        const live = projectDocument(collaborative.doc);
        return noteToMarkdown(live.title, live.content, citing(entry.note.id));
      }
      /* What is on screen, not what last reached Postgres: exporting a note you
       are still typing in should give you the words you can see. */
      const draft = readDraft(entry.note.id);
      return noteToMarkdown(
        draft?.title ?? entry.note.title,
        draft?.content ?? entry.note.content,
        citing(entry.note.id),
      );
    },
    [selectedId, collaborative.ready, collaborative.doc],
  );

  const handleCopyMarkdown = useCallback(
    async (entry: NoteEntry) => {
      try {
        await navigator.clipboard.writeText(markdownFor(entry));
        setStatusFlash("Copied");
      } catch {
        setError("Could not copy");
      }
    },
    [markdownFor, setError, setStatusFlash],
  );

  const handleExportMarkdown = useCallback(
    (entry: NoteEntry) => {
      const draft = readDraft(entry.note.id);
      void platform().saveFile(
        exportFileName(draft?.title ?? entry.note.title),
        markdownFor(entry),
      );
    },
    [markdownFor],
  );

  const handleExportAll = useCallback(async () => {
    const list = orderedVisible;
    if (list.length === 0) {
      setStatusFlash("Nothing to export");
      return;
    }
    const names = uniqueFileNames(
      list.map((entry) => readDraft(entry.note.id)?.title ?? entry.note.title),
    );
    try {
      const shape = await platform().saveFolder(
        list.map((entry, index) => ({ name: names[index], text: markdownFor(entry) })),
        `${folderLabel}.md`,
      );
      /* The readout slot is 7.5rem and clips, so every one of these is kept
         inside the width of "Updated elsewhere". */
      setStatusFlash(
        shape === "folder"
          ? `Wrote ${list.length} file${list.length === 1 ? "" : "s"}`
          : `Exported ${list.length} note${list.length === 1 ? "" : "s"}`,
      );
    } catch (e) {
      /* The directory picker throws when it is dismissed, which is not an
         error the reader needs told back to them. */
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Export failed");
    }
  }, [orderedVisible, setStatusFlash, folderLabel, markdownFor, setError]);

  const handleImportFiles = useCallback(
    async (files: FileList | null) => {
      const s = sessionRef.current;
      if (!s || !canWriteArchive || !files || files.length === 0) return;
      setSaving(true);
      setError("");
      try {
        const added: NoteMeta[] = [];
        for (const file of [...files]) {
          const { title, content } = markdownToNote(file.name, await file.text());
          const note = importedNote(viewAs, title, content);
          const metadata: NoteMeta = { id: note.id, folderId: null };
          entriesRef.current = [await createNote(s, note, metadata), ...entriesRef.current];
          added.push(metadata);
        }
        setEntries(entriesRef.current);
        setMetas((current) => {
          const base = current[viewAs] ?? metasRef.current[viewAs] ?? EMPTY_META;
          return { ...current, [viewAs]: { ...base, notes: [...base.notes, ...added] } };
        });
        if (selectedFolderId === TRASH || selectedFolderId === ARCHIVE) setSelectedFolderId(ALL);
        setStatusFlash(`Imported ${added.length} note${added.length === 1 ? "" : "s"}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Import failed");
      } finally {
        setSaving(false);
      }
    },
    [
      sessionRef,
      canWriteArchive,
      setSaving,
      setError,
      setEntries,
      entriesRef,
      setMetas,
      selectedFolderId,
      setSelectedFolderId,
      setStatusFlash,
      viewAs,
      metasRef,
    ],
  );

  async function importDriveFile(file: DriveImportFile, signal: AbortSignal): Promise<string> {
    const session = sessionRef.current;
    if (!session || !canWriteArchive) throw new Error("This archive is view only.");
    const checkDestination = () => {
      signal.throwIfAborted();
      const current = sessionRef.current;
      if (current?.archiveId !== session.archiveId || current.userId !== session.userId) {
        throw new Error("The destination archive changed.");
      }
    };
    checkDestination();

    const folderId = selectedFolderId.startsWith("__") ? null : selectedFolderId;
    if (folderId) await flushPendingFolder(session, folderId);
    checkDestination();
    const blob = await file.download(signal);
    checkDestination();

    const title = file.name.trim() || "Untitled";
    let objectId: string | undefined;
    let content: JSONContent;
    if (file.format === "pdf") {
      const filename = /\.pdf$/i.test(title) ? title : `${title}.pdf`;
      assertAttachable({ name: filename, size: blob.size });
      if ((await blob.slice(0, 5).text()) !== "%PDF-") {
        throw new Error("Google Drive did not return a PDF.");
      }
      checkDestination();
      objectId = crypto.randomUUID();
      content = {
        type: "doc",
        content: [{ type: "privateFile", attrs: { objectId, label: attachmentLabel(filename) } }],
      };
    } else {
      content = legacyMarkdownToRichText(await blob.text());
    }
    const note = importedNote(viewAs, title, content);
    const metadata: NoteMeta = { id: note.id, folderId };
    let entry: NoteEntry;
    checkDestination();
    try {
      if (objectId)
        await uploadObject(session, objectId, new Blob([blob], { type: "application/pdf" }));
      checkDestination();
      entry = await createNote(session, note, metadata);
    } catch (error) {
      // A failed response can follow a committed insert. Confirm the note is
      // absent before removing its attachment. Keep the bytes if lookup fails.
      const saved = await loadNote(session, note.id).catch(() => undefined);
      if (!saved) {
        if (objectId && saved === null)
          await removeObject(session, objectId).catch(() => undefined);
        throw error;
      }
      entry = saved;
    }
    checkDestination();
    captureRows();
    entriesRef.current = [entry, ...entriesRef.current.filter((item) => item.note.id !== note.id)];
    setEntries(entriesRef.current);
    setMetas((current) => {
      const base = current[viewAs] ?? metasRef.current[viewAs] ?? EMPTY_META;
      if (base.notes.some((item) => item.id === note.id)) return current;
      return { ...current, [viewAs]: { ...base, notes: [...base.notes, metadata] } };
    });
    return entry.note.id;
  }

  return {
    handleCopyMarkdown,
    handleExportMarkdown,
    handleExportAll,
    handleImportFiles,
    importDriveFile,
  };
}
