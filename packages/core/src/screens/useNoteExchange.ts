import { RICH_TEXT_VERSION, richTextToPlainText } from "@/features/editor/lib/content";
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
import { referenceText, resolveReference, targetKind } from "@/lib/references";
import { ALL, ARCHIVE, TRASH } from "@/lib/scopes";
import { type AppSession } from "@/lib/session";
import { createNote } from "@/lib/supabase";
import { EMPTY_META, type Meta, type Note, type NoteMeta } from "@/lib/types";
import { platform } from "@/platform";
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
  setEntries: Dispatch<SetStateAction<NoteEntry[]>>;
  setMetas: Dispatch<SetStateAction<Record<string, Meta>>>;
  setSaving: (saving: boolean) => void;
  setError: (message: string) => void;
  setStatusFlash: (message: string) => void;
  setSelectedFolderId: (id: string) => void;
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
          const note: Note = {
            id: crypto.randomUUID(),
            title,
            body: richTextToPlainText(content),
            content,
            contentVersion: RICH_TEXT_VERSION,
            legacyBody: null,
            photo: null,
            cover: null,
            ownerId: viewAs,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
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

  return { handleCopyMarkdown, handleExportMarkdown, handleExportAll, handleImportFiles };
}
