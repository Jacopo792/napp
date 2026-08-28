import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, PanelLeftClose, PanelLeftOpen, Search } from "lucide-react";
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
import { MobileScopes } from "@/components/MobileScopes";
import { NoteList } from "@/components/NoteList";
import { useIsCompact } from "@/lib/media";
import { CollectionMenu, MainMenu, NoteMenu, SettingsPanel } from "@/components/WorkspaceMenus";
import type { NoteEditorHandle } from "@/components/NoteEditor";
import {
  groupEntries,
  loadListPreferences,
  preferencesForFolder,
  rememberRecent,
  saveListPreferences,
  type ListPreferences,
  type ListPreferencesV1,
} from "@/lib/listPreferences";

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
  /* Direction contract: an opaque three-pane graphite workspace on desktop;
     a notes-first gallery on phone; neutral emphasis for ordinary interaction;
     translucency belongs only to temporary overlays. */
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileScreen, setMobileScreen] = useState<"collection" | "note">("collection");
  const [mobileManageOpen, setMobileManageOpen] = useState(false);
  const [listPreferences, setListPreferences] = useState<Record<"u1" | "u2", ListPreferencesV1>>(
    () => ({ u1: loadListPreferences("u1"), u2: loadListPreferences("u2") }),
  );

  const searchRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const noteEditorRef = useRef<NoteEditorHandle>(null);

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
  const storedPreferences = listPreferences[viewAs];
  const activeListPreferences = preferencesForFolder(storedPreferences, selectedFolderId);

  useEffect(() => {
    try {
      localStorage.setItem("napp:navigation", navigationOpen ? "open" : "closed");
    } catch {
      /* The preference is optional; writing still works without local storage. */
    }
  }, [navigationOpen]);

  useEffect(() => {
    saveListPreferences(listPreferences.u1);
    saveListPreferences(listPreferences.u2);
  }, [listPreferences]);

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

    return list;
  }, [ownedEntries, activeMeta, selectedFolderId, filterTagIds, query]);

  const noteGroups = useMemo(() => {
    const pinnedIds = new Set(
      activeMeta.notes.filter((note) => note.pinned).map((note) => note.id),
    );
    return groupEntries(visible, pinnedIds, activeListPreferences);
  }, [visible, activeMeta.notes, activeListPreferences]);
  const orderedVisible = useMemo(() => noteGroups.flatMap((group) => group.entries), [noteGroups]);

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
      setListPreferences((current) => ({
        ...current,
        [viewAs]: rememberRecent(current[viewAs], note.id),
      }));
      if (compact) setMobileScreen("note");
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
        if (compact) setMobileScreen("collection");
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
          if (compact) setMobileScreen("collection");
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
      if (orderedVisible.length === 0) return;
      const i = orderedVisible.findIndex((e) => e.note.id === selectedId);
      const next = i === -1 ? 0 : Math.min(orderedVisible.length - 1, Math.max(0, i + delta));
      const id = orderedVisible[next].note.id;
      setSelectedId(id);
      setListPreferences((current) => ({
        ...current,
        [viewAs]: rememberRecent(current[viewAs], id),
      }));
    },
    [orderedVisible, selectedId, viewAs],
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
      if (mod && e.key.toLowerCase() === "f") {
        e.preventDefault();
        if (selected) noteEditorRef.current?.openFind();
        else {
          searchRef.current?.focus();
          searchRef.current?.select();
        }
        return;
      }
      if (mod && e.key.toLowerCase() === "k") {
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
  }, [moveSelection, handleNew, saveNow, selectedId, selected]);

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

  function handleMoveNote(noteId: string, folderId: string | null) {
    const existing = activeMeta.notes.find((note) => note.id === noteId);
    handleMetaChange({
      ...activeMeta,
      notes: existing
        ? activeMeta.notes.map((note) => (note.id === noteId ? { ...note, folderId } : note))
        : [...activeMeta.notes, { id: noteId, folderId, tagIds: [] }],
    });
    if (selectedFolderId !== ALL) setSelectedFolderId(folderId ?? UNFILED);
  }

  function handleListPreferencesChange(next: ListPreferences) {
    setListPreferences((current) => ({
      ...current,
      [viewAs]: {
        ...current[viewAs],
        folders: { ...current[viewAs].folders, [selectedFolderId]: next },
      },
    }));
  }

  function handleCreateFolder(name: string) {
    const folder = { id: crypto.randomUUID(), name };
    handleMetaChange({ ...activeMeta, folders: [...activeMeta.folders, folder] });
    handleSelectFolder(folder.id);
  }

  function handleRenameFolder(name: string) {
    if ([ALL, UNFILED, TRASH].includes(selectedFolderId)) return;
    handleMetaChange({
      ...activeMeta,
      folders: activeMeta.folders.map((folder) =>
        folder.id === selectedFolderId ? { ...folder, name } : folder,
      ),
    });
  }

  function handleDeleteFolder() {
    if ([ALL, UNFILED, TRASH].includes(selectedFolderId)) return;
    handleMetaChange({
      ...activeMeta,
      folders: activeMeta.folders.filter((folder) => folder.id !== selectedFolderId),
      notes: activeMeta.notes.map((note) =>
        note.folderId === selectedFolderId ? { ...note, folderId: null } : note,
      ),
    });
    handleSelectFolder(ALL);
  }

  function handleViewChange(v: "u1" | "u2") {
    saveNow();
    setViewAs(v);
    setSelectedId(null);
    setSelectedFolderId(ALL);
    setFilterTagIds([]);
    setQuery("");
    setMobileScreen("collection");
  }

  function handleSelectFolder(id: string) {
    setSelectedFolderId(id);
    setSelectedId(null);
    if (id === TRASH) setFilterTagIds([]);
    if (compact) {
      setMobileManageOpen(false);
      setMobileScreen("collection");
    }
  }

  const handleSelectNote = useCallback(
    (id: string) => {
      setSelectedId(id);
      setListPreferences((current) => ({
        ...current,
        [viewAs]: rememberRecent(current[viewAs], id),
      }));
      if (compact) setMobileScreen("note");
    },
    [compact, viewAs],
  );

  function handleOpenRecent(id: string) {
    setQuery("");
    setFilterTagIds([]);
    setSelectedFolderId(ALL);
    handleSelectNote(id);
  }

  function handleMobileBack() {
    saveNow();
    setSelectedId(null);
    setMobileScreen("collection");
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

  const pinned = selected
    ? indexOf(activeMeta).byNote.get(selected.note.id)?.pinned === true
    : false;
  const recentNotes = storedPreferences.recentNoteIds
    .filter((id) => id !== selectedId)
    .map((id) => entries.find((entry) => entry.note.id === id)?.note)
    .filter((note): note is Note => Boolean(note))
    .map((note) => ({ id: note.id, title: note.title }));
  const canManageFolder = ![ALL, UNFILED, TRASH].includes(selectedFolderId);
  const collectionActions = (
    <CollectionMenu
      preferences={activeListPreferences}
      galleryOnly={compact}
      folderName={folderLabel}
      canManageFolder={canManageFolder}
      onChange={handleListPreferencesChange}
      onNewFolder={handleCreateFolder}
      onRenameFolder={handleRenameFolder}
      onDeleteFolder={handleDeleteFolder}
    />
  );
  const noteActions = selected ? (
    <>
      <span className="mr-2">{saveReadout}</span>
      <button
        type="button"
        aria-label="Find in note"
        className="toolbar-button"
        onClick={() => noteEditorRef.current?.openFind()}
      >
        <Search size={16} />
      </button>
      <NoteMenu
        pinned={pinned}
        folders={activeMeta.folders}
        recent={recentNotes}
        onTogglePin={() => handleTogglePin(selected.note.id)}
        onFind={() => noteEditorRef.current?.openFind()}
        onMove={(folderId) => handleMoveNote(selected.note.id, folderId)}
        onRecent={handleOpenRecent}
        onDelete={() => handleMoveToTrash(selected)}
      />
    </>
  ) : null;

  if (compact) {
    return (
      <div className="mobile-workspace overflow-hidden" style={{ height: "100dvh" }}>
        <DndContext key="mobile-dnd" sensors={sensors} onDragEnd={handleDragEnd}>
          <main className="h-full overflow-hidden">
            {mobileScreen === "collection" && (
              <section className="mobile-screen flex h-full flex-col">
                <header
                  className="mobile-appbar shrink-0 px-4 pb-2"
                  style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
                >
                  <div className="flex items-center gap-3">
                    <MainMenu onSettings={() => setSettingsOpen(true)} onLock={handleLock} />
                    <span className="font-display text-lg font-semibold tracking-[-0.03em]">
                      Notes
                    </span>
                    <div
                      role="group"
                      aria-label="Archive"
                      className="archive-switch ml-auto flex p-1"
                    >
                      {(
                        [
                          ["u1", "Mine"],
                          ["u2", partnerName],
                        ] as const
                      ).map(([owner, label]) => (
                        <button
                          key={owner}
                          type="button"
                          onClick={() => handleViewChange(owner)}
                          aria-pressed={viewAs === owner}
                          className={`max-w-28 min-w-16 truncate px-3 py-1.5 text-xs ${viewAs === owner ? "is-active" : ""}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </header>
                <MobileScopes
                  entries={ownedEntries}
                  meta={activeMeta}
                  selectedFolderId={selectedFolderId}
                  filterTagIds={filterTagIds}
                  onSelectFolder={handleSelectFolder}
                  onFilterTagsChange={setFilterTagIds}
                  onManage={() => setMobileManageOpen(true)}
                />
                <NoteList
                  mobile
                  entries={visible}
                  groups={noteGroups}
                  view="gallery"
                  toolbarActions={collectionActions}
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
                />
              </section>
            )}

            {mobileScreen === "note" && selectedId && (
              <section className="mobile-screen flex h-full flex-col">
                <nav
                  className="mobile-backbar flex shrink-0 items-center px-3"
                  style={{ paddingTop: "env(safe-area-inset-top)" }}
                >
                  <button
                    type="button"
                    onClick={handleMobileBack}
                    aria-label={`Back to ${folderLabel}`}
                    className="mobile-back"
                  >
                    <ChevronLeft size={22} />
                    <span className="max-w-48 truncate">{folderLabel}</span>
                  </button>
                </nav>
                <Suspense fallback={<div className="h-full w-full bg-page" />}>
                  <NoteEditor
                    ref={noteEditorRef}
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
                    onNew={handleNew}
                    onUploadImage={handleUploadImage}
                    resolveImage={resolveImage}
                    headerActions={noteActions}
                  />
                </Suspense>
              </section>
            )}
          </main>
        </DndContext>
        {mobileManageOpen && (
          <>
            <button
              type="button"
              aria-label="Close folder and tag manager"
              className="sheet-scrim"
              onClick={() => setMobileManageOpen(false)}
            />
            <section className="sheet" aria-label="Folders and tags">
              <span aria-hidden className="sheet-grip" />
              <header className="flex items-center px-5 pt-3 pb-2">
                <div>
                  <h2 className="font-display text-xl font-semibold">Organize</h2>
                  <p className="text-xs text-ink-3">Folders and tags</p>
                </div>
                <button
                  type="button"
                  className="toolbar-button ml-auto"
                  onClick={() => setMobileManageOpen(false)}
                >
                  Done
                </button>
              </header>
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
            </section>
          </>
        )}
        <SettingsPanel
          mobile
          open={settingsOpen}
          preferences={activeListPreferences}
          onClose={() => setSettingsOpen(false)}
          onPreferencesChange={handleListPreferencesChange}
          onLock={handleLock}
        />
      </div>
    );
  }

  return (
    <div className="workspace-shell h-screen overflow-hidden">
      <DndContext
        key="desktop-dnd"
        sensors={sensors}
        onDragStart={(e: DragStartEvent) => setDragId(e.active.id as string)}
        onDragCancel={() => setDragId(null)}
        onDragEnd={handleDragEnd}
      >
        <div className="workspace-grid flex h-full min-h-0">
          {navigationOpen && (
            <>
              <section className="folder-column flex w-[248px] shrink-0 flex-col">
                <header className="folder-toolbar flex h-13 shrink-0 items-center border-b border-rule px-3">
                  <MainMenu onSettings={() => setSettingsOpen(true)} onLock={handleLock} />
                  <div
                    role="group"
                    aria-label="Archive"
                    className="archive-switch ml-2 flex min-w-0 flex-1"
                  >
                    {(
                      [
                        ["u1", "Mine"],
                        ["u2", partnerName],
                      ] as const
                    ).map(([owner, label]) => (
                      <button
                        key={owner}
                        type="button"
                        onClick={() => handleViewChange(owner)}
                        aria-pressed={viewAs === owner}
                        className={`min-w-0 flex-1 truncate px-2 py-1.5 text-xs ${viewAs === owner ? "is-active" : ""}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setNavigationOpen(false)}
                    aria-label="Hide navigation"
                    className="toolbar-button ml-1"
                  >
                    <PanelLeftClose size={16} />
                  </button>
                </header>
                <FolderRail
                  entries={ownedEntries}
                  meta={activeMeta}
                  selectedFolderId={selectedFolderId}
                  filterTagIds={filterTagIds}
                  onSelectFolder={handleSelectFolder}
                  onFilterTagsChange={setFilterTagIds}
                  onMetaChange={handleMetaChange}
                />
              </section>

              <NoteList
                entries={visible}
                groups={noteGroups}
                view={activeListPreferences.view}
                toolbarActions={collectionActions}
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
              />
            </>
          )}

          <Suspense
            fallback={
              <div className="soft-pane pane-page flex min-w-0 flex-1 flex-col gap-4 px-10 pt-10">
                <div className="measure">
                  <div className="skeleton h-9 w-2/3" />
                  <div className="skeleton mt-5 h-2.5 w-40" />
                </div>
              </div>
            }
          >
            <NoteEditor
              ref={noteEditorRef}
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
              onNew={handleNew}
              onUploadImage={handleUploadImage}
              resolveImage={resolveImage}
              navigationAction={
                !navigationOpen ? (
                  <button
                    type="button"
                    onClick={() => setNavigationOpen(true)}
                    aria-label="Show navigation"
                    className="toolbar-button"
                  >
                    <PanelLeftOpen size={16} />
                  </button>
                ) : null
              }
              headerActions={noteActions}
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
      <SettingsPanel
        open={settingsOpen}
        preferences={activeListPreferences}
        onClose={() => setSettingsOpen(false)}
        onPreferencesChange={handleListPreferencesChange}
        onLock={handleLock}
      />
    </div>
  );
}
