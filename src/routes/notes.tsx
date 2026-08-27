import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Lock, PanelLeftClose, PanelLeftOpen } from "lucide-react";
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
import { decryptFile, encryptNote } from "@/lib/crypto";
import {
  fetchNoteFiles,
  writeNoteFile,
  deleteNoteFile,
  ensureDataBranch,
  readFile,
} from "@/lib/github";
import { loadMeta, saveMeta } from "@/lib/meta";
import { type Meta, type NoteMeta, type Note, EMPTY_META } from "@/lib/types";
import type { NoteEntry } from "@/lib/entries";
import { formatStamp } from "@/lib/format";
import { ThemeToggle } from "@/components/ThemeToggle";
import { FolderRail, ALL, UNFILED } from "@/components/FolderRail";
import { NoteList } from "@/components/NoteList";
import { AxisBar } from "@/components/AxisBar";

const NoteEditor = lazy(() =>
  import("@/components/NoteEditor").then((m) => ({ default: m.NoteEditor })),
);

export const Route = createFileRoute("/notes")({
  component: NotesPage,
});

/** How long the typing has to stop before a note is pushed to GitHub. */
const AUTOSAVE_MS = 1500;

type Draft = { title: string; body: string };

function NotesPage() {
  const navigate = useNavigate();

  const [session, setSession] = useState<AppSession | null>(null);
  const [viewAs, setViewAs] = useState<"u1" | "u2">("u1");

  const [entries, setEntries] = useState<NoteEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string>(ALL);
  const [filterTagIds, setFilterTagIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");

  const [myMeta, setMyMeta] = useState<Meta>({ ...EMPTY_META });
  const [partnerMeta, setPartnerMeta] = useState<Meta>({ ...EMPTY_META });

  const [draft, setDraft] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
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

  const searchRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);

  // ── Refs mirroring state, so the save pipeline can read the truth
  //    synchronously without waiting for a React commit. ───────────────────
  const entriesRef = useRef<NoteEntry[]>([]);
  entriesRef.current = entries;
  const metaShaRef = useRef<{ u1?: string; u2?: string }>({});
  const sessionRef = useRef<AppSession | null>(null);
  sessionRef.current = session;

  /** Edits waiting to be pushed, keyed by note id so switching notes never
   *  strands a pending change. Meta is whole-object, so last write wins. */
  const pendingNotesRef = useRef<Map<string, Draft>>(new Map());
  const pendingMetaRef = useRef<{ owner: "u1" | "u2"; meta: Meta } | null>(null);
  const inFlightRef = useRef(false);
  const timerRef = useRef<number | undefined>(undefined);

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
    });
  }, [navigate]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError("");
      try {
        await ensureDataBranch(session.repo, session.pat);

        const [files, mine, theirs] = await Promise.all([
          fetchNoteFiles(session.repo, session.pat),
          loadMeta(session.repo, session.pat, session.keys, session.role),
          session.role === "u1"
            ? loadMeta(session.repo, session.pat, session.keys, "u2")
            : Promise.resolve({ meta: { ...EMPTY_META }, sha: undefined }),
        ]);
        if (cancelled) return;

        const decrypted: NoteEntry[] = [];
        await Promise.all(
          files.map(async (f) => {
            const note = await decryptFile(f.content, session.keys);
            if (note) decrypted.push({ note, sha: f.sha, path: f.path });
          }),
        );
        if (cancelled) return;

        decrypted.sort((a, b) => b.note.updatedAt.localeCompare(a.note.updatedAt));
        setEntries(decrypted);
        setMyMeta(mine.meta);
        metaShaRef.current[session.role] = mine.sha;
        if (session.role === "u1") {
          setPartnerMeta(theirs.meta);
          metaShaRef.current.u2 = theirs.sha;
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session]);

  // ── The visible slice: owner → folder → tags → search, newest first ─────
  const visible = useMemo(() => {
    const meta = activeMeta;
    const folderOf = (id: string) => {
      const fid = meta.notes.find((n) => n.id === id)?.folderId ?? null;
      return fid && meta.folders.some((f) => f.id === fid) ? fid : null;
    };

    let list = entries.filter((e) => e.note.owner === viewAs);

    if (selectedFolderId === UNFILED) {
      list = list.filter((e) => folderOf(e.note.id) === null);
    } else if (selectedFolderId !== ALL) {
      list = list.filter((e) => folderOf(e.note.id) === selectedFolderId);
    }

    if (filterTagIds.length > 0) {
      list = list.filter((e) => {
        const ids = meta.notes.find((n) => n.id === e.note.id)?.tagIds ?? [];
        return filterTagIds.some((t) => ids.includes(t));
      });
    }

    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (e) => e.note.title.toLowerCase().includes(q) || e.note.body.toLowerCase().includes(q),
      );
    }

    return [...list].sort((a, b) => b.note.updatedAt.localeCompare(a.note.updatedAt));
  }, [entries, activeMeta, viewAs, selectedFolderId, filterTagIds, query]);

  const selected = visible.find((e) => e.note.id === selectedId) ?? null;
  const canEdit = selected ? session?.role === "u1" || selected.note.owner === "u2" : false;

  const folderLabel =
    selectedFolderId === ALL
      ? "All notes"
      : selectedFolderId === UNFILED
        ? "Unfiled"
        : (activeMeta.folders.find((f) => f.id === selectedFolderId)?.name ?? "Folder");

  // Load the selected note into the draft when the selection actually changes.
  const lastLoadedRef = useRef<string | null>(null);
  useEffect(() => {
    if (selected && selected.note.id !== lastLoadedRef.current) {
      const pending = pendingNotesRef.current.get(selected.note.id);
      setDraft(pending ?? { title: selected.note.title, body: selected.note.body });
      lastLoadedRef.current = selected.note.id;
    } else if (!selected && lastLoadedRef.current !== null) {
      setDraft(null);
      lastLoadedRef.current = null;
    }
  }, [selected]);

  // ── Save pipeline ───────────────────────────────────────────────────────
  const drain = useCallback(async () => {
    const s = sessionRef.current;
    if (!s || inFlightRef.current) return;
    if (pendingNotesRef.current.size === 0 && !pendingMetaRef.current) return;

    inFlightRef.current = true;
    setSaving(true);
    let failed = false;

    try {
      while (pendingNotesRef.current.size > 0 || pendingMetaRef.current) {
        for (const [id, d] of [...pendingNotesRef.current]) {
          pendingNotesRef.current.delete(id);
          const entry = entriesRef.current.find((e) => e.note.id === id);
          if (!entry) continue;

          const updated: Note = {
            ...entry.note,
            title: d.title,
            body: d.body,
            updatedAt: new Date().toISOString(),
          };
          const content = await encryptNote(updated, s.keys);

          let newSha: string;
          try {
            newSha = await writeNoteFile(s.repo, s.pat, entry.path, content, entry.sha);
          } catch (err) {
            // Stale blob SHA (someone else wrote, or our copy drifted).
            if (err instanceof Error && err.message.includes("409")) {
              const current = await readFile(s.repo, s.pat, entry.path);
              newSha = await writeNoteFile(s.repo, s.pat, entry.path, content, current?.sha);
            } else {
              pendingNotesRef.current.set(id, d);
              throw err;
            }
          }

          const saved: NoteEntry = { ...entry, note: updated, sha: newSha };
          entriesRef.current = entriesRef.current.map((e) => (e.note.id === id ? saved : e));
          setEntries(entriesRef.current);
        }

        if (pendingMetaRef.current) {
          const p = pendingMetaRef.current;
          pendingMetaRef.current = null;
          try {
            const sha = await saveMeta(
              s.repo,
              s.pat,
              s.keys,
              p.owner,
              p.meta,
              metaShaRef.current[p.owner],
            );
            metaShaRef.current[p.owner] = sha;
          } catch (err) {
            pendingMetaRef.current = p;
            throw err;
          }
        }
      }
      setError("");
      setLastSavedAt(new Date().toISOString());
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 1800);
    } catch (e) {
      failed = true;
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      inFlightRef.current = false;
      setSaving(false);
      setDirty(pendingNotesRef.current.size > 0 || pendingMetaRef.current !== null);
      if (failed) window.setTimeout(() => void drain(), 4000);
    }
  }, []);

  const schedule = useCallback(() => {
    setDirty(true);
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => void drain(), AUTOSAVE_MS);
  }, [drain]);

  const saveNow = useCallback(() => {
    window.clearTimeout(timerRef.current);
    void drain();
  }, [drain]);

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

  function handleDraftChange(title: string, body: string) {
    if (!selectedId) return;
    setDraft({ title, body });
    pendingNotesRef.current.set(selectedId, { title, body });
    schedule();
  }

  function handleMetaChange(m: Meta) {
    setActiveMeta(m);
    pendingMetaRef.current = { owner: viewAs, meta: m };
    schedule();
  }

  function handleTagsChange(noteId: string, tagIds: string[]) {
    const existing = activeMeta.notes.find((n) => n.id === noteId);
    const notes: NoteMeta[] = existing
      ? activeMeta.notes.map((n) => (n.id === noteId ? { ...n, tagIds } : n))
      : [...activeMeta.notes, { id: noteId, folderId: null, tagIds }];
    handleMetaChange({ ...activeMeta, notes });
  }

  // ── Create / delete ─────────────────────────────────────────────────────
  const handleNew = useCallback(async () => {
    const s = sessionRef.current;
    if (!s) return;
    const folderId =
      selectedFolderId === ALL || selectedFolderId === UNFILED ? null : selectedFolderId;

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
      const content = await encryptNote(note, s.keys);
      const path = `notes/${note.id}.napp`;
      const sha = await writeNoteFile(s.repo, s.pat, path, content);

      entriesRef.current = [{ note, sha, path }, ...entriesRef.current];
      setEntries(entriesRef.current);

      handleMetaChange({
        ...activeMeta,
        notes: [...activeMeta.notes, { id: note.id, folderId, tagIds: [] }],
      });

      setQuery("");
      setSelectedId(note.id);
      setDraft({ title: "", body: "" });
      lastLoadedRef.current = note.id;
      window.setTimeout(() => titleRef.current?.focus(), 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create note");
    } finally {
      setSaving(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewAs, selectedFolderId, activeMeta]);

  const handleDelete = useCallback(
    async (entry: NoteEntry) => {
      const s = sessionRef.current;
      if (!s) return;
      setSaving(true);
      setError("");
      try {
        pendingNotesRef.current.delete(entry.note.id);
        await deleteNoteFile(s.repo, s.pat, entry.path, entry.sha);

        entriesRef.current = entriesRef.current.filter((e) => e.note.id !== entry.note.id);
        setEntries(entriesRef.current);

        handleMetaChange({
          ...activeMeta,
          notes: activeMeta.notes.filter((n) => n.id !== entry.note.id),
        });

        if (selectedId === entry.note.id) {
          setSelectedId(null);
          setDraft(null);
          lastLoadedRef.current = null;
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to delete");
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
    setDraft(null);
    lastLoadedRef.current = null;
    setSelectedFolderId(ALL);
    setFilterTagIds([]);
    setQuery("");
  }

  function handleSelectFolder(id: string) {
    setSelectedFolderId(id);
    setSelectedId(null);
    setDraft(null);
    lastLoadedRef.current = null;
  }

  function handleLock() {
    saveNow();
    clearSession();
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
  ) : (
    <span className="flex items-center gap-2">
      <span className={`label ${savedFlash ? "text-ok" : "text-ink-4"}`}>Committed</span>
      {lastSavedAt && <span className="readout text-ink-4">{formatStamp(lastSavedAt)}</span>}
    </span>
  );

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

        {session.role === "u1" ? (
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
        ) : (
          <span className="label rounded-full bg-paper px-3 py-1.5 text-ink-3">My notes</span>
        )}

        <span className="ml-auto flex items-center gap-3">
          <ThemeToggle />
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
        sensors={sensors}
        onDragStart={(e: DragStartEvent) => setDragId(e.active.id as string)}
        onDragCancel={() => setDragId(null)}
        onDragEnd={handleDragEnd}
      >
        <div className="flex min-h-0 flex-1 gap-3 px-3 pb-3">
          {navigationOpen && (
            <>
              <FolderRail
                entries={entries.filter((e) => e.note.owner === viewAs)}
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
                searchRef={searchRef}
                onQueryChange={setQuery}
                onSelect={setSelectedId}
                onNew={handleNew}
                onDelete={handleDelete}
              />
            </>
          )}

          <Suspense
            fallback={
              <div className="soft-pane flex min-w-0 flex-1 flex-col gap-4 bg-page px-10 pt-10">
                <div className="w-full" style={{ maxWidth: "var(--read-measure)" }}>
                  <div className="skeleton h-9 w-2/3" />
                  <div className="skeleton mt-5 h-2.5 w-40" />
                </div>
              </div>
            }
          >
            <NoteEditor
              entry={selected}
              meta={activeMeta}
              draft={draft}
              canEdit={canEdit}
              viewingAsPartner={viewAs === "u2"}
              partnerName={partnerName}
              titleRef={titleRef}
              onChange={handleDraftChange}
              onTagsChange={handleTagsChange}
              onNew={handleNew}
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
