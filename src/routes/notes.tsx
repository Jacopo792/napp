import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, Lock, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { MobileScopes } from "@/components/MobileScopes";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { restoreSession, clearSession, type AppSession } from "@/lib/session";
import {
  createNote,
  deleteNote,
  downloadEncryptedImage,
  loadArchive,
  persistMetaDiff,
  saveNote,
  uploadEncryptedImage,
  type ArchiveSnapshot,
} from "@/lib/supabase";
import { subscribeToArchive, unsubscribeFromArchive } from "@/lib/sync";
import { prepareImageForNote } from "@/lib/image";
import { type Meta, type NoteMeta, type Note, EMPTY_META } from "@/lib/types";
import type { NoteEntry } from "@/lib/entries";
import { formatStamp } from "@/lib/format";
import { derivedOf, indexOf } from "@/lib/derived";
import {
  clearDrafts,
  dropDraft,
  ensureDraft,
  hasPending,
  isDirty,
  readDraft,
  replaceDraft,
  requeue,
  takePending,
} from "@/lib/draft";
import { FolderRail, ALL, TRASH, UNFILED } from "@/components/FolderRail";
import { NoteList } from "@/components/NoteList";
import { AxisBar } from "@/components/AxisBar";
import { useIsCompact } from "@/lib/media";

const NoteEditor = lazy(() =>
  import("@/components/NoteEditor").then((m) => ({ default: m.NoteEditor })),
);

export const Route = createFileRoute("/notes")({
  component: NotesPage,
});

/** A Postgres row write is cheap enough to commit shortly after typing stops. */
const AUTOSAVE_MS = 250;

/* A failed write is retried on its own, backing off so a server that is down
   is not hammered — but never so slowly that a recovered connection is missed. */
const RETRY_MIN_MS = 4000;
const RETRY_MAX_MS = 60_000;

/* Enough of a fingerprint to notice that folders, tags or note placement moved,
   without serialising every note's metadata on every realtime wake-up. */
function metaShape(meta: Meta): string {
  let shape = `${meta.partnerName ?? ""}|${meta.folders.length}|${meta.tags.length}`;
  for (const folder of meta.folders) shape += `|${folder.id}:${folder.name}`;
  for (const tag of meta.tags) shape += `|${tag.id}:${tag.name}:${tag.color}`;
  for (const note of meta.notes) {
    shape += `|${note.id}:${note.folderId ?? ""}:${note.pinned ? 1 : 0}:${note.trashedAt ?? ""}:${note.tagIds.join(",")}`;
  }
  return shape;
}

function NotesPage() {
  const navigate = useNavigate();
  const compact = useIsCompact();

  const [session, setSession] = useState<AppSession | null>(null);
  const [viewAs, setViewAs] = useState<"u1" | "u2">("u1");

  const [entries, setEntries] = useState<NoteEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string>(ALL);
  const [filterTagIds, setFilterTagIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");

  const [myMeta, setMyMeta] = useState<Meta>({ ...EMPTY_META });
  const [partnerMeta, setPartnerMeta] = useState<Meta>({ ...EMPTY_META });

  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [syncFlash, setSyncFlash] = useState(false);
  /** Raised only when a pull replaces the open draft, so the editor knows the
   *  new text is not its own and may be applied under the caret. */
  const [syncRevision, setSyncRevision] = useState(0);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [navigationOpen, setNavigationOpen] = useState(() => {
    try {
      return localStorage.getItem("napp:navigation") !== "closed";
    } catch {
      return true;
    }
  });
  const [manageOpen, setManageOpen] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);

  // ── Refs mirroring state, so the save pipeline can read the truth
  //    synchronously without waiting for a React commit. ───────────────────
  const entriesRef = useRef<NoteEntry[]>([]);
  entriesRef.current = entries;
  const myMetaRef = useRef(myMeta);
  myMetaRef.current = myMeta;
  const partnerMetaRef = useRef(partnerMeta);
  partnerMetaRef.current = partnerMeta;
  const sessionRef = useRef<AppSession | null>(null);
  sessionRef.current = session;

  /** Note edits waiting to be written live in the draft store (lib/draft.ts),
   *  keyed by note so switching notes or archive labels never strands one. */
  const pendingMetaRef = useRef<Map<"u1" | "u2", { before: Meta; after: Meta }>>(new Map());
  const inFlightRef = useRef(false);
  const timerRef = useRef<number | undefined>(undefined);
  /** Retry after a failed write, backing off and giving up on unmount. */
  const retryRef = useRef<number | undefined>(undefined);
  const retryDelayRef = useRef(RETRY_MIN_MS);

  // ── Realtime side ───────────────────────────────────────────────────────
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;
  const readyRef = useRef(false);
  const syncingRef = useRef(false);
  const realtimePendingRef = useRef(false);

  const activeMeta = viewAs === "u1" ? myMeta : partnerMeta;
  const partnerName = myMeta.partnerName?.trim() || "Partner";

  useEffect(() => {
    try {
      localStorage.setItem("napp:navigation", navigationOpen ? "open" : "closed");
    } catch {
      /* The preference is optional; writing still works without local storage. */
    }
  }, [navigationOpen]);

  const setActiveMeta = useCallback(
    (m: Meta) => {
      if (viewAs === "u1") setMyMeta(m);
      else setPartnerMeta(m);
    },
    [viewAs],
  );

  // ── Bootstrap ───────────────────────────────────────────────────────────
  useEffect(() => {
    restoreSession().then((s) => {
      if (!s) {
        navigate({ to: "/" });
        return;
      }
      setSession(s);
      setViewAs("u1");
    });
  }, [navigate]);

  /**
   * Folds a remote snapshot into the page. The rule is that unpushed local work
   * wins: a remote body only reaches the editor when nothing is queued for that
   * note, and remote metadata is skipped while a metadata write is waiting.
   */
  const applySnapshot = useCallback((snapshot: ArchiveSnapshot, remote = true) => {
    const localById = new Map(entriesRef.current.map((entry) => [entry.note.id, entry]));
    const remoteById = new Map(snapshot.entries.map((entry) => [entry.note.id, entry]));
    const changedIds = new Set<string>();
    const entrySetChanged = localById.size !== remoteById.size;
    for (const entry of snapshot.entries) {
      if (localById.get(entry.note.id)?.version !== entry.version) changedIds.add(entry.note.id);
    }

    const next = snapshot.entries
      .map((entry) => (isDirty(entry.note.id) ? (localById.get(entry.note.id) ?? entry) : entry))
      .concat(
        entriesRef.current.filter(
          (entry) => isDirty(entry.note.id) && !remoteById.has(entry.note.id),
        ),
      )
      .sort((a, b) => b.note.updatedAt.localeCompare(a.note.updatedAt));
    entriesRef.current = next;
    setEntries(next);

    for (const owner of ["u1", "u2"] as const) {
      if (pendingMetaRef.current.has(owner)) continue;
      if (owner === "u1") setMyMeta(snapshot.metas.u1);
      else setPartnerMeta(snapshot.metas.u2);
    }

    const metadataChanged =
      metaShape(myMetaRef.current) !== metaShape(snapshot.metas.u1) ||
      metaShape(partnerMetaRef.current) !== metaShape(snapshot.metas.u2);
    if (remote && (entrySetChanged || changedIds.size > 0 || metadataChanged)) {
      setSyncFlash(true);
      window.setTimeout(() => setSyncFlash(false), 2000);
    }

    // The open note, if the other device moved it and nothing local is queued.
    const open = selectedIdRef.current;
    if (!open || isDirty(open)) return;
    if (!changedIds.has(open)) return;
    const fresh = next.find((e) => e.note.id === open);
    if (!fresh) return;

    // Retyping the title under a caret sitting in it would send that caret to
    // the end, so an in-use title field keeps what it shows.
    const titleBusy = document.activeElement === titleRef.current;
    const current = readDraft(open);
    replaceDraft(open, {
      title: titleBusy && current ? current.title : fresh.note.title,
      body: fresh.note.body,
    });
    setSyncRevision((n) => n + 1);
  }, []);

  const refreshRemote = useCallback(async () => {
    const s = sessionRef.current;
    if (!s || !readyRef.current || syncingRef.current) return;
    if (inFlightRef.current) {
      realtimePendingRef.current = true;
      return;
    }

    syncingRef.current = true;
    try {
      applySnapshot(await loadArchive(s));
    } catch {
      // Realtime retries automatically. Save errors remain visible separately.
    } finally {
      syncingRef.current = false;
    }
  }, [applySnapshot]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError("");
      try {
        const snapshot = await loadArchive(session);
        if (cancelled) return;
        applySnapshot(snapshot, false);
        readyRef.current = true;
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      readyRef.current = false;
    };
  }, [session, applySnapshot]);

  // ── Realtime subscriptions ──────────────────────────────────────────────
  useEffect(() => {
    if (!session) return;
    const channel = subscribeToArchive(session.archiveId, () => void refreshRemote());
    return () => void unsubscribeFromArchive(channel);
  }, [session, refreshRemote]);

  /** The owner's whole catalogue, unfiltered — what the rail and the scope
   *  strip count against. Memoised so their counts are not recomputed for an
   *  array that holds exactly the same notes as the render before. */
  const ownedEntries = useMemo(
    () => entries.filter((entry) => entry.note.owner === viewAs),
    [entries, viewAs],
  );

  // ── The visible slice: folder → tags → search, newest first ─────────────
  const visible = useMemo(() => {
    const meta = activeMeta;
    const index = indexOf(meta);
    const pinnedIds = new Set(meta.notes.filter((note) => note.pinned).map((note) => note.id));
    const folderOf = (id: string) => {
      const fid = index.byNote.get(id)?.folderId ?? null;
      return fid && index.byFolder.has(fid) ? fid : null;
    };

    const trashedIds = new Set(meta.notes.filter((note) => note.trashedAt).map((note) => note.id));
    let list = ownedEntries;

    if (selectedFolderId === TRASH) {
      list = list.filter((entry) => trashedIds.has(entry.note.id));
    } else {
      list = list.filter((entry) => !trashedIds.has(entry.note.id));
      if (selectedFolderId === UNFILED) {
        list = list.filter((e) => folderOf(e.note.id) === null);
      } else if (selectedFolderId !== ALL) {
        list = list.filter((e) => folderOf(e.note.id) === selectedFolderId);
      }
    }

    if (filterTagIds.length > 0) {
      list = list.filter((e) => {
        const ids = index.byNote.get(e.note.id)?.tagIds ?? [];
        return filterTagIds.some((t) => ids.includes(t));
      });
    }

    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((e) => derivedOf(e.note).haystack.includes(q));
    }

    return [...list].sort((a, b) => {
      const pinOrder = Number(pinnedIds.has(b.note.id)) - Number(pinnedIds.has(a.note.id));
      return pinOrder || b.note.updatedAt.localeCompare(a.note.updatedAt);
    });
  }, [ownedEntries, activeMeta, selectedFolderId, filterTagIds, query]);

  const selected = visible.find((e) => e.note.id === selectedId) ?? null;
  const canEdit = selected ? selectedFolderId !== TRASH : false;

  const folderLabel =
    selectedFolderId === ALL
      ? "All notes"
      : selectedFolderId === UNFILED
        ? "Unfiled"
        : selectedFolderId === TRASH
          ? "Trash"
          : (activeMeta.folders.find((f) => f.id === selectedFolderId)?.name ?? "Folder");

  // Seed the store from the stored note. `ensureDraft` leaves unsaved work
  // alone, so this is safe to run whenever the selection or the entry changes.
  useEffect(() => {
    if (!selected) return;
    ensureDraft(selected.note.id, { title: selected.note.title, body: selected.note.body });
  }, [selected]);

  // ── Save pipeline ───────────────────────────────────────────────────────
  const drain = useCallback(async () => {
    const s = sessionRef.current;
    if (!s || inFlightRef.current) return;
    if (!hasPending() && pendingMetaRef.current.size === 0) return;

    inFlightRef.current = true;
    setSaving(true);
    let failed = false;

    try {
      while (hasPending() || pendingMetaRef.current.size > 0) {
        for (const [id, d] of takePending()) {
          const entry = entriesRef.current.find((e) => e.note.id === id);
          if (!entry) {
            dropDraft(id);
            continue;
          }

          const updated: Note = {
            ...entry.note,
            title: d.title,
            body: d.body,
            updatedAt: new Date().toISOString(),
          };
          try {
            const version = await saveNote(s, updated, entry.version);
            const saved: NoteEntry = { note: updated, version };
            entriesRef.current = entriesRef.current.map((current) =>
              current.note.id === id ? saved : current,
            );
            setEntries(entriesRef.current);
          } catch (err) {
            requeue(id);
            throw err;
          }
        }

        for (const [owner, pending] of [...pendingMetaRef.current]) {
          pendingMetaRef.current.delete(owner);
          try {
            await persistMetaDiff(s, owner, pending.before, pending.after);
          } catch (err) {
            const newer = pendingMetaRef.current.get(owner);
            pendingMetaRef.current.set(owner, {
              before: pending.before,
              after: newer?.after ?? pending.after,
            });
            throw err;
          }
        }
      }
      setError("");
      retryDelayRef.current = RETRY_MIN_MS;
      setLastSavedAt(new Date().toISOString());
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 1800);
    } catch (e) {
      failed = true;
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      inFlightRef.current = false;
      setSaving(false);
      setDirty(hasPending() || pendingMetaRef.current.size > 0);
      if (failed) {
        window.clearTimeout(retryRef.current);
        retryRef.current = window.setTimeout(() => void drain(), retryDelayRef.current);
        retryDelayRef.current = Math.min(RETRY_MAX_MS, retryDelayRef.current * 2);
      }
      if (realtimePendingRef.current) {
        realtimePendingRef.current = false;
        window.setTimeout(() => void refreshRemote(), 0);
      }
    }
  }, [refreshRemote]);

  const schedule = useCallback(() => {
    setDirty(true);
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => void drain(), AUTOSAVE_MS);
  }, [drain]);

  const saveNow = useCallback(() => {
    window.clearTimeout(timerRef.current);
    void drain();
  }, [drain]);

  useEffect(
    () => () => {
      window.clearTimeout(timerRef.current);
      window.clearTimeout(retryRef.current);
    },
    [],
  );

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

  const handleUploadImage = useCallback(async (file: File): Promise<string> => {
    const current = sessionRef.current;
    if (!current) throw new Error("Sign in again before uploading an image");
    const blob = await prepareImageForNote(file);
    const imageId = crypto.randomUUID();
    await uploadEncryptedImage(current, imageId, blob);
    return `napp-image:${imageId}`;
  }, []);

  const resolveImage = useCallback(async (imageId: string): Promise<Blob> => {
    const current = sessionRef.current;
    if (!current) throw new Error("Sign in again to view this image");
    return downloadEncryptedImage(current, imageId);
  }, []);

  /* The editor has already written the words into the draft store; the page
     only has to decide when they reach Postgres. */

  const handleMetaChange = useCallback(
    (m: Meta) => {
      const pending = pendingMetaRef.current.get(viewAs);
      pendingMetaRef.current.set(viewAs, {
        before: pending?.before ?? activeMeta,
        after: m,
      });
      setActiveMeta(m);
      schedule();
    },
    [viewAs, activeMeta, setActiveMeta, schedule],
  );

  const handleTagsChange = useCallback(
    (noteId: string, tagIds: string[]) => {
      const existing = indexOf(activeMeta).byNote.get(noteId);
      const notes: NoteMeta[] = existing
        ? activeMeta.notes.map((n) => (n.id === noteId ? { ...n, tagIds } : n))
        : [...activeMeta.notes, { id: noteId, folderId: null, tagIds }];
      handleMetaChange({ ...activeMeta, notes });
    },
    [activeMeta, handleMetaChange],
  );

  const handleTogglePin = useCallback(
    (noteId: string) => {
      const existing = indexOf(activeMeta).byNote.get(noteId);
      const notes: NoteMeta[] = existing
        ? activeMeta.notes.map((note) =>
            note.id === noteId ? { ...note, pinned: !note.pinned } : note,
          )
        : [...activeMeta.notes, { id: noteId, folderId: null, tagIds: [], pinned: true }];
      handleMetaChange({ ...activeMeta, notes });
    },
    [activeMeta, handleMetaChange],
  );

  // ── Create / delete ─────────────────────────────────────────────────────
  const handleNew = useCallback(async () => {
    const s = sessionRef.current;
    if (!s) return;
    const folderId =
      selectedFolderId === ALL || selectedFolderId === UNFILED || selectedFolderId === TRASH
        ? null
        : selectedFolderId;

    const note: Note = {
      id: crypto.randomUUID(),
      title: "",
      body: "",
      owner: viewAs,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setSaving(true);
    setError("");
    try {
      const metadata: NoteMeta = { id: note.id, folderId, tagIds: [] };
      const entry = await createNote(s, note, metadata);
      entriesRef.current = [entry, ...entriesRef.current];
      setEntries(entriesRef.current);

      setActiveMeta({ ...activeMeta, notes: [...activeMeta.notes, metadata] });

      setQuery("");
      if (selectedFolderId === TRASH) setSelectedFolderId(ALL);
      setSelectedId(note.id);
      ensureDraft(note.id, { title: "", body: "" });
      window.setTimeout(() => titleRef.current?.focus(), 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create note");
    } finally {
      setSaving(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewAs, selectedFolderId, activeMeta]);

  const handleMoveToTrash = useCallback(
    (entry: NoteEntry) => {
      const existing = activeMeta.notes.find((note) => note.id === entry.note.id);
      const notes: NoteMeta[] = existing
        ? activeMeta.notes.map((note) =>
            note.id === entry.note.id ? { ...note, trashedAt: new Date().toISOString() } : note,
          )
        : [
            ...activeMeta.notes,
            {
              id: entry.note.id,
              folderId: null,
              tagIds: [],
              trashedAt: new Date().toISOString(),
            },
          ];
      handleMetaChange({ ...activeMeta, notes });

      if (selectedId === entry.note.id) {
        setSelectedId(null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedId, activeMeta],
  );

  const handleRestore = useCallback(
    (entry: NoteEntry) => {
      handleMetaChange({
        ...activeMeta,
        notes: activeMeta.notes.map((note) =>
          note.id === entry.note.id ? { ...note, trashedAt: undefined } : note,
        ),
      });
      if (selectedId === entry.note.id) {
        setSelectedId(null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedId, activeMeta],
  );

  const handleDeleteForever = useCallback(
    async (entry: NoteEntry) => {
      const s = sessionRef.current;
      if (!s) return;
      setSaving(true);
      setError("");
      try {
        dropDraft(entry.note.id);
        await deleteNote(s, entry.note.id);

        entriesRef.current = entriesRef.current.filter((e) => e.note.id !== entry.note.id);
        setEntries(entriesRef.current);

        setActiveMeta({
          ...activeMeta,
          notes: activeMeta.notes.filter((note) => note.id !== entry.note.id),
        });

        if (selectedId === entry.note.id) {
          setSelectedId(null);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to delete permanently");
      } finally {
        setSaving(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedId, activeMeta],
  );

  // ── Keyboard ────────────────────────────────────────────────────────────
  const moveSelection = useCallback(
    (delta: number) => {
      if (visible.length === 0) return;
      const i = visible.findIndex((e) => e.note.id === selectedId);
      const next = i === -1 ? 0 : Math.min(visible.length - 1, Math.max(0, i + delta));
      setSelectedId(visible[next].note.id);
    },
    [visible, selectedId],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      const typing =
        !!el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable);
      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveNow();
        return;
      }
      if (mod && (e.key.toLowerCase() === "f" || e.key.toLowerCase() === "k")) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }
      if (mod && e.key.toLowerCase() === "n") {
        e.preventDefault();
        void handleNew();
        return;
      }
      if (typing) return;

      if (e.key === "n") {
        e.preventDefault();
        void handleNew();
      } else if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        moveSelection(1);
      } else if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        moveSelection(-1);
      } else if (e.key === "Enter" && selectedId) {
        e.preventDefault();
        titleRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [moveSelection, handleNew, saveNow, selectedId]);

  // ── Drag a note onto a folder ───────────────────────────────────────────
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function handleDragEnd(e: DragEndEvent) {
    setDragId(null);
    const over = e.over?.id as string | undefined;
    if (!over) return;
    const noteId = e.active.id as string;
    const folderId = over === UNFILED ? null : over;
    const existing = activeMeta.notes.find((n) => n.id === noteId);
    handleMetaChange({
      ...activeMeta,
      notes: existing
        ? activeMeta.notes.map((n) => (n.id === noteId ? { ...n, folderId } : n))
        : [...activeMeta.notes, { id: noteId, folderId, tagIds: [] }],
    });
  }

  function handleViewChange(v: "u1" | "u2") {
    saveNow();
    setViewAs(v);
    setSelectedId(null);
    setSelectedFolderId(ALL);
    setFilterTagIds([]);
    setQuery("");
    setManageOpen(false);
  }

  function handleSelectFolder(id: string) {
    setSelectedFolderId(id);
    setSelectedId(null);
    setManageOpen(false);
    if (id === TRASH) setFilterTagIds([]);
  }

  const handleSelectNote = useCallback((id: string) => setSelectedId(id), []);

  function handleMobileBack() {
    saveNow();
    setSelectedId(null);
  }

  function handleLock() {
    saveNow();
    clearDrafts();
    void clearSession();
    navigate({ to: "/" });
  }

  if (!session) return null;

  const dragEntry = dragId ? entries.find((e) => e.note.id === dragId) : null;

  const saveReadout = error ? (
    <button
      onClick={saveNow}
      title="Retry the write now"
      className="flex items-center gap-2 text-left"
    >
      <span className="label text-danger">Write failed</span>
      <span className="readout max-w-[20rem] truncate text-ink-3 underline-offset-2 hover:underline">
        {error}
      </span>
    </button>
  ) : saving ? (
    <span className="flex items-center gap-2">
      <span className="animate-spin inline-block h-2.5 w-2.5 rounded-full border border-accent border-t-transparent" />
      <span className="label text-accent">Writing</span>
    </span>
  ) : dirty ? (
    <span className="label text-ink-2">Unsaved</span>
  ) : syncFlash ? (
    <span className="label text-accent">Synced from elsewhere</span>
  ) : (
    <span className="flex items-center gap-2">
      <span className={`label ${savedFlash ? "text-ok" : "text-ink-4"}`}>Committed</span>
      {lastSavedAt && <span className="readout text-ink-4">{formatStamp(lastSavedAt)}</span>}
    </span>
  );

  if (compact) {
    const listing = !selectedId;

    return (
      <div className="flex flex-col overflow-hidden bg-surface" style={{ height: "100dvh" }}>
        {/* The phone has two screens: the notes, and a note. The archive is the
            one piece of state worth a permanent place in the bar. */}
        <header
          className="mobile-topbar flex min-h-14 shrink-0 items-center gap-2 bg-surface px-3"
          style={{ paddingTop: "env(safe-area-inset-top)" }}
        >
          {listing ? (
            <div
              role="group"
              aria-label="Archive"
              className="flex min-w-0 flex-1 rounded-xl border border-rule bg-paper p-1"
            >
              {(
                [
                  ["u1", "My notes"],
                  ["u2", `${partnerName}'s notes`],
                ] as const
              ).map(([owner, label]) => (
                <button
                  key={owner}
                  type="button"
                  onClick={() => handleViewChange(owner)}
                  aria-pressed={viewAs === owner}
                  className={`label min-h-9 min-w-0 flex-1 truncate rounded-lg px-3 transition-colors ${
                    viewAs === owner ? "bg-accent text-on-accent" : "text-ink-3"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={handleMobileBack}
                aria-label="Back to notes"
                className="icon-button flex h-11 min-w-11 shrink-0 items-center gap-0.5 px-1 text-accent"
              >
                <ChevronLeft size={21} strokeWidth={2.2} />
                <span className="max-w-32 truncate text-[14px] font-medium">{folderLabel}</span>
              </button>
              <span className="min-w-0 flex-1" />
            </>
          )}

          <button
            type="button"
            onClick={handleLock}
            aria-label="Lock and sign out"
            className="icon-button flex h-11 w-11 shrink-0 items-center justify-center text-ink-3"
          >
            <Lock size={16} strokeWidth={2} />
          </button>
        </header>

        <DndContext key="mobile-dnd" sensors={sensors} onDragEnd={handleDragEnd}>
          <main className="flex min-h-0 flex-1 overflow-hidden bg-surface">
            {listing && (
              <NoteList
                mobile
                entries={visible}
                meta={activeMeta}
                selectedId={selectedId}
                query={query}
                loading={loading}
                busy={saving}
                folderLabel={folderLabel}
                trashMode={selectedFolderId === TRASH}
                searchRef={searchRef}
                onQueryChange={setQuery}
                onSelect={handleSelectNote}
                onNew={handleNew}
                onMoveToTrash={handleMoveToTrash}
                onRestore={handleRestore}
                onDeleteForever={handleDeleteForever}
                onTogglePin={handleTogglePin}
                scopes={
                  <MobileScopes
                    entries={ownedEntries}
                    meta={activeMeta}
                    selectedFolderId={selectedFolderId}
                    filterTagIds={filterTagIds}
                    onSelectFolder={handleSelectFolder}
                    onFilterTagsChange={setFilterTagIds}
                    onManage={() => setManageOpen(true)}
                  />
                }
              />
            )}

            {selectedId && (
              <Suspense fallback={<div className="h-full w-full bg-page" />}>
                <NoteEditor
                  key={selected?.note.id ?? "empty"}
                  mobile
                  entry={selected}
                  meta={activeMeta}
                  syncRevision={syncRevision}
                  canEdit={canEdit}
                  viewingAsPartner={viewAs === "u2"}
                  partnerName={partnerName}
                  titleRef={titleRef}
                  onEdited={schedule}
                  onTagsChange={handleTagsChange}
                  pinned={
                    selected
                      ? indexOf(activeMeta).byNote.get(selected.note.id)?.pinned === true
                      : false
                  }
                  onTogglePin={() => selected && handleTogglePin(selected.note.id)}
                  onNew={handleNew}
                  onUploadImage={handleUploadImage}
                  resolveImage={resolveImage}
                />
              </Suspense>
            )}
          </main>

          {/* Folders and tags are maintenance. They come up over the list and
              go away again; they are not a screen the reader passes through. */}
          {manageOpen && (
            <>
              <div className="sheet-scrim" onClick={() => setManageOpen(false)} aria-hidden />
              <div role="dialog" aria-modal="true" aria-label="Folders and tags" className="sheet">
                <span aria-hidden className="sheet-grip" />
                <div className="flex shrink-0 items-center justify-between px-5 pt-3 pb-1">
                  <h2 className="font-display text-[17px] font-semibold text-ink">
                    Folders and tags
                  </h2>
                  <button
                    type="button"
                    onClick={() => setManageOpen(false)}
                    aria-label="Close"
                    className="icon-button flex h-9 w-9 items-center justify-center text-ink-3"
                  >
                    <X size={17} strokeWidth={2.2} />
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto pb-4">
                  <FolderRail
                    mobile
                    entries={ownedEntries}
                    meta={activeMeta}
                    selectedFolderId={selectedFolderId}
                    filterTagIds={filterTagIds}
                    onSelectFolder={handleSelectFolder}
                    onFilterTagsChange={setFilterTagIds}
                    onMetaChange={handleMetaChange}
                  />
                </div>
              </div>
            </>
          )}
        </DndContext>

        {selectedId && <AxisBar compact>{saveReadout}</AxisBar>}
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-surface">
      <header className="flex h-14 shrink-0 items-center gap-4 px-5">
        <span
          className="font-display text-[15px] text-ink"
          style={{ fontVariationSettings: '"wght" 640, "opsz" 16', letterSpacing: "-0.02em" }}
        >
          Notes
        </span>

        <button
          onClick={() => setNavigationOpen((open) => !open)}
          aria-label={navigationOpen ? "Hide navigation" : "Show navigation"}
          aria-pressed={!navigationOpen}
          title={navigationOpen ? "Hide navigation" : "Show navigation"}
          className="icon-button p-2 text-ink-3"
        >
          {navigationOpen ? (
            <PanelLeftClose size={16} strokeWidth={1.9} />
          ) : (
            <PanelLeftOpen size={16} strokeWidth={1.9} />
          )}
        </button>

        <div
          role="group"
          aria-label="Archive"
          className="flex min-w-52 rounded-xl border border-rule bg-paper p-1"
        >
          {(
            [
              ["u1", "My notes"],
              ["u2", `${partnerName}'s notes`],
            ] as const
          ).map(([owner, label]) => (
            <button
              key={owner}
              onClick={() => handleViewChange(owner)}
              aria-pressed={viewAs === owner}
              className={`label min-w-0 flex-1 truncate rounded-lg px-3 py-1.5 transition-colors ${
                viewAs === owner
                  ? "bg-accent text-on-accent"
                  : "text-ink-3 hover:bg-page hover:text-ink"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <span className="ml-auto flex items-center gap-3">
          <button
            onClick={handleLock}
            title="Lock and sign out"
            className="label icon-button flex items-center gap-1.5 px-2.5 py-1.5 text-ink-3"
          >
            <Lock size={12} strokeWidth={2} />
            Lock
          </button>
        </span>
      </header>

      <DndContext
        key="desktop-dnd"
        sensors={sensors}
        onDragStart={(e: DragStartEvent) => setDragId(e.active.id as string)}
        onDragCancel={() => setDragId(null)}
        onDragEnd={handleDragEnd}
      >
        <div className="flex min-h-0 flex-1 gap-3 px-3 pb-3">
          {navigationOpen && (
            <>
              <FolderRail
                entries={ownedEntries}
                meta={activeMeta}
                selectedFolderId={selectedFolderId}
                filterTagIds={filterTagIds}
                onSelectFolder={handleSelectFolder}
                onFilterTagsChange={setFilterTagIds}
                onMetaChange={handleMetaChange}
              />

              <NoteList
                entries={visible}
                meta={activeMeta}
                selectedId={selectedId}
                query={query}
                loading={loading}
                busy={saving}
                folderLabel={folderLabel}
                trashMode={selectedFolderId === TRASH}
                searchRef={searchRef}
                onQueryChange={setQuery}
                onSelect={setSelectedId}
                onNew={handleNew}
                onMoveToTrash={handleMoveToTrash}
                onRestore={handleRestore}
                onDeleteForever={handleDeleteForever}
                onTogglePin={handleTogglePin}
              />
            </>
          )}

          <Suspense
            fallback={
              <div className="soft-pane flex min-w-0 flex-1 flex-col gap-4 bg-page px-10 pt-10">
                <div className="measure">
                  <div className="skeleton h-9 w-2/3" />
                  <div className="skeleton mt-5 h-2.5 w-40" />
                </div>
              </div>
            }
          >
            <NoteEditor
              key={selected?.note.id ?? "empty"}
              entry={selected}
              meta={activeMeta}
              syncRevision={syncRevision}
              canEdit={canEdit}
              viewingAsPartner={viewAs === "u2"}
              partnerName={partnerName}
              titleRef={titleRef}
              onEdited={schedule}
              onTagsChange={handleTagsChange}
              pinned={
                selected ? indexOf(activeMeta).byNote.get(selected.note.id)?.pinned === true : false
              }
              onTogglePin={() => selected && handleTogglePin(selected.note.id)}
              onNew={handleNew}
              onUploadImage={handleUploadImage}
              resolveImage={resolveImage}
            />
          </Suspense>
        </div>

        <DragOverlay dropAnimation={null}>
          {dragEntry ? (
            <div className="w-56 rounded-xl border border-accent bg-page px-3 py-2 shadow-lg">
              <p className="readout truncate text-ink">{dragEntry.note.title || "Untitled"}</p>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <AxisBar>{saveReadout}</AxisBar>
    </div>
  );
}
