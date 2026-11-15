import { RICH_TEXT_VERSION, richTextToPlainText } from "@/features/editor/lib/content";
import type { Draft } from "@/features/editor/lib/draft";
import {
  dropDraft,
  hasPending,
  isDirty,
  readBase,
  readDraft,
  rebaseDraft,
  reconcileDraft,
  replaceDraft,
  requeue,
  takePending,
} from "@/features/editor/lib/draft";
import { mergeDocuments, mergeTitle } from "@/features/editor/lib/merge";
import { type NoteEntry } from "@/lib/entries";
import { MetaQueue } from "@/lib/metaQueue";
import { type AppSession } from "@/lib/session";
import { NoteConflict, NoteRefused, createNote, persistMetaDiff, saveNote } from "@/lib/supabase";
import { type Note } from "@/lib/types";
import { RETRY_MIN_MS, nextRetryDelay, waitUntilIdle } from "@/lib/writeDrain";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { useCallback, useEffect } from "react";
interface ArchiveWriteOptions {
  sessionRef: RefObject<AppSession | null>;
  entriesRef: RefObject<NoteEntry[]>;
  pendingMetaRef: RefObject<MetaQueue>;
  inFlightRef: RefObject<boolean>;
  timerRef: RefObject<number | undefined>;
  retryRef: RefObject<number | undefined>;
  retryDelayRef: RefObject<number>;
  realtimePendingRef: RefObject<boolean>;
  loading: boolean;
  refreshRemote: () => void;
  setEntries: Dispatch<SetStateAction<NoteEntry[]>>;
  setSyncRevision: Dispatch<SetStateAction<number>>;
  setMerge: Dispatch<SetStateAction<{ label: string; detail: string } | null>>;
  setError: (message: string) => void;
  setSaving: (saving: boolean) => void;
  setSaveError: (message: string) => void;
  setDirty: (dirty: boolean) => void;
}
const AUTOSAVE_MS = 250;
export const writesWaiting = (meta: MetaQueue) => hasPending() || meta.size > 0;
/** Drain row drafts and queued metadata, preserve conflicting words, and flush before leaving. */
export function useArchiveWrites({
  sessionRef,
  entriesRef,
  pendingMetaRef,
  inFlightRef,
  timerRef,
  retryRef,
  retryDelayRef,
  realtimePendingRef,
  loading,
  refreshRemote,
  setEntries,
  setSyncRevision,
  setMerge,
  setError,
  setSaving,
  setSaveError,
  setDirty,
}: ArchiveWriteOptions) {
  const storeEntry = useCallback(
    (note: Note, version: number) => {
      const saved: NoteEntry = { note, version };
      entriesRef.current = entriesRef.current.map((current) =>
        current.note.id === note.id ? saved : current,
      );
      setEntries(entriesRef.current);
    },
    [entriesRef, setEntries],
  );

  /**
   * Somebody else wrote this note while we were writing it.
   *
   * The document is the unit of the write, so the two versions cannot both be
   * sent — but they can both be kept. `mergeDocuments` takes the blocks each
   * side added or removed relative to the version this editor started from and
   * produces one document holding both, which is exactly right for the case
   * that lost text: two people adding paragraphs to the same note. Only when
   * both edited the *same* block is there nothing to decide, and then the
   * losing document is kept as a note of its own rather than discarded.
   */
  const resolveConflict = useCallback(
    async (s: AppSession, id: string, taken: Draft, conflict: NoteConflict) => {
      /**
       * Puts the merged document on screen. Anything typed while the write was in
       * flight descends from `taken`, and so does the merged document — so the same
       * three-way merge re-applies those keystrokes on top of it. The base becomes
       * what the archive now holds, never what is on screen, or the next merge
       * would read the other person's blocks as a deletion.
       */
      function adoptMerged(id: string, taken: Draft, written: Draft) {
        const current = readDraft(id);
        const typedSince = isDirty(id) && current !== undefined;
        if (!typedSince) {
          replaceDraft(id, written);
          setSyncRevision((n) => n + 1);
          return;
        }
        const document =
          mergeDocuments(taken.content, current.content, written.content) ?? written.content;
        reconcileDraft(
          id,
          written,
          {
            title: mergeTitle(taken.title, current.title, written.title),
            body: richTextToPlainText(document),
            content: document,
          },
          true,
        );
        setSyncRevision((n) => n + 1);
      }

      /** The losing document, kept where it can be read. No marker reaches the
       *  text of either version. */
      async function keepUnmergedCopy(s: AppSession, remote: Note, local: Draft) {
        const note: Note = {
          id: crypto.randomUUID(),
          title: `${remote.title || "Untitled"} — your version`,
          body: local.body,
          content: local.content,
          contentVersion: RICH_TEXT_VERSION,
          legacyBody: null,
          photo: remote.photo,
          cover: remote.cover,
          ownerId: remote.ownerId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        const entry = await createNote(s, note, { id: note.id, folderId: null });
        entriesRef.current = [entry, ...entriesRef.current];
        setEntries(entriesRef.current);
      }
      if (!conflict.entry) {
        // ponytail: the row is gone, so there is nothing to merge onto and no
        // metadata to recreate it under. Recreate it as a note if this ever
        // happens to anybody in practice.
        dropDraft(id);
        setError("That note was removed somewhere else");
        return;
      }

      let remote = conflict.entry;
      for (let attempt = 0; attempt < 3; attempt++) {
        const base = readBase(id) ?? taken;
        const document = mergeDocuments(base.content, taken.content, remote.note.content);

        if (!document) {
          await keepUnmergedCopy(s, remote.note, taken);
          storeEntry(remote.note, remote.version);
          replaceDraft(
            id,
            {
              title: remote.note.title,
              body: remote.note.body,
              content: remote.note.content,
            },
            remote.note.updatedAt,
          );
          setSyncRevision((n) => n + 1);
          setMerge({
            label: "Kept a copy",
            detail:
              "You and somebody else edited the same paragraph, so both versions could not become one. Theirs is in this note; yours is kept as a note of its own.",
          });
          return;
        }

        const merged: Note = {
          ...remote.note,
          title: mergeTitle(base.title, taken.title, remote.note.title),
          body: richTextToPlainText(document),
          content: document,
          contentVersion: RICH_TEXT_VERSION,
          updatedAt: new Date().toISOString(),
        };

        try {
          const version = await saveNote(s, merged, remote.version);
          storeEntry(merged, version);
          adoptMerged(id, taken, {
            title: merged.title,
            body: merged.body,
            content: document,
          });
          setMerge({
            label: "Merged",
            detail: "Somebody else wrote in this note while you did. Both changes are here.",
          });
          return;
        } catch (err) {
          // Written again while we were merging: merge onto the newer one.
          if (!(err instanceof NoteConflict) || !err.entry) throw err;
          remote = err.entry;
        }
      }
      throw new Error("The note kept changing while it was being merged");
    },
    [entriesRef, setEntries, setError, setMerge, setSyncRevision, storeEntry],
  );

  const drain = useCallback(async () => {
    const s = sessionRef.current;
    if (!s || inFlightRef.current) return;
    if (!hasPending() && pendingMetaRef.current.size === 0) return;

    inFlightRef.current = true;
    setSaving(true);
    let failed = false;

    try {
      while (writesWaiting(pendingMetaRef.current)) {
        for (const { id, draft: d, restoreUpdatedAt } of takePending()) {
          const entry = entriesRef.current.find((e) => e.note.id === id);
          if (!entry) {
            dropDraft(id);
            continue;
          }

          const updated: Note = {
            ...entry.note,
            title: d.title,
            body: d.body,
            content: d.content,
            contentVersion: RICH_TEXT_VERSION,
            updatedAt: restoreUpdatedAt ?? new Date().toISOString(),
          };
          try {
            storeEntry(updated, await saveNote(s, updated, entry.version));
            rebaseDraft(id, d);
          } catch (err) {
            if (!(err instanceof NoteConflict)) {
              requeue(id);
              throw err;
            }
            await resolveConflict(s, id, d, err);
          }
        }

        await pendingMetaRef.current.flushAll((owner, before, after) =>
          persistMetaDiff(s, owner, before, after),
        );
      }
      setSaveError("");
      retryDelayRef.current = RETRY_MIN_MS;
    } catch (e) {
      if (e instanceof NoteRefused) {
        // ponytail: drops anything staged for this owner during the write too; per-row requeue if that bites.
        pendingMetaRef.current.discard(e.owner);
        realtimePendingRef.current = true;
        setSaveError(e.message);
      } else {
        failed = true;
        setSaveError(e instanceof Error ? e.message : "Save failed");
      }
    } finally {
      inFlightRef.current = false;
      setSaving(false);
      setDirty(writesWaiting(pendingMetaRef.current));
      if (failed) {
        window.clearTimeout(retryRef.current);
        retryRef.current = window.setTimeout(() => void drain(), retryDelayRef.current);
        retryDelayRef.current = nextRetryDelay(retryDelayRef.current);
      }
      if (realtimePendingRef.current) {
        realtimePendingRef.current = false;
        window.setTimeout(() => void refreshRemote(), 0);
      }
    }
  }, [
    entriesRef,
    inFlightRef,
    pendingMetaRef,
    realtimePendingRef,
    refreshRemote,
    resolveConflict,
    retryDelayRef,
    retryRef,
    sessionRef,
    setDirty,
    setSaveError,
    setSaving,
    storeEntry,
  ]);

  /* `drain` steps aside while a save is already on its way, which is right for
     a timer and wrong for leaving: the archive switch read that as "still
     saving" and refused. Leaving waits for the save in flight, then flushes
     what is left. Bounded, so a request that never answers cannot hold the
     window; what is still waiting after that is refused as before. */
  const settleWrites = useCallback(async () => {
    await waitUntilIdle(() => inFlightRef.current, 8000);
    await drain();
  }, [drain, inFlightRef]);

  const schedule = useCallback(() => {
    /* Drafts and metadata both: trashing or pinning a note writes no draft,
       and asking only about drafts left it unsaved until the window hid. */
    if (!writesWaiting(pendingMetaRef.current)) {
      window.clearTimeout(timerRef.current);
      setDirty(pendingMetaRef.current.size > 0);
      return;
    }
    setDirty(true);
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => void drain(), AUTOSAVE_MS);
  }, [drain, pendingMetaRef, setDirty, timerRef]);

  const saveNow = useCallback(() => {
    window.clearTimeout(timerRef.current);
    void drain();
  }, [drain, timerRef]);

  useEffect(
    () => () => {
      window.clearTimeout(timerRef.current);
      window.clearTimeout(retryRef.current);
    },
    [retryRef, timerRef],
  );

  /* A draft restored from the reload has never reached Postgres, and the
     archive is the only place it is safe. `drain` needs the entry it belongs
     to, so this waits for the catalogue rather than firing on mount. */
  useEffect(() => {
    if (loading || !hasPending()) return;
    saveNow();
  }, [loading, saveNow]);

  // Never leave the tab holding unsaved words.
  useEffect(() => {
    function onHide() {
      if (document.visibilityState === "hidden") saveNow();
    }
    // No "Leave site?" confirm: it cannot finish an async write anyway, and
    // the flush above already runs before the tab is backgrounded or closed.
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", saveNow);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", saveNow);
    };
  }, [saveNow]);

  return { drain, settleWrites, schedule, saveNow };
}
