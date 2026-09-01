import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ChevronLeft,
  FileText,
  Folder,
  FolderDown,
  FolderTree,
  Keyboard,
  Lock,
  NotebookText,
  PanelLeftOpen,
  Search,
  Settings,
  Settings as SettingsIcon,
  SquarePen,
  Trash2,
} from "lucide-react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { restoreSession, clearSession, type AppSession } from "@/lib/session";
import {
  createNote,
  createArchiveInvite,
  deleteAvatar,
  deleteNotes,
  leaveArchive,
  downloadImage,
  downloadObject,
  loadArchive,
  loadPendingInvites,
  NoteConflict,
  loadProfile,
  persistMetaDiff,
  revokeArchiveInvite,
  saveNote,
  updateNoteProperties,
  saveProfile,
  setArchiveMemberRole,
  uploadAvatar,
  uploadImage,
  uploadObject,
  type ArchiveMember,
  type ArchiveSnapshot,
  type PendingInvite,
  type Profile,
} from "@/lib/supabase";
import { acquireAvatarUrl, invalidateAvatarUrl } from "@/lib/avatarCache";
import { subscribeToArchive, unsubscribeFromArchive } from "@/lib/sync";
import {
  loadPresencePreference,
  publishPresence,
  savePresencePreference,
  subscribeToPresence,
  unsubscribeFromPresence,
  type PresenceMember,
} from "@/lib/presence";
import {
  loadProofreaderPreference,
  saveProofreaderPreference,
} from "@/features/editor/lib/proofread";
import { prepareAvatar, prepareImageForNote, type AvatarCrop } from "@/lib/image";
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
  readBase,
  rebaseDraft,
  reconcileDraft,
  requeue,
  takePending,
} from "@/features/editor/lib/draft";
import {
  EMPTY_RICH_TEXT,
  RICH_TEXT_VERSION,
  richTextToPlainText,
} from "@/features/editor/lib/content";
import { projectDocument } from "@/features/editor/lib/ydoc";
import { mergeDocuments, mergeTitle } from "@/features/editor/lib/merge";
import {
  downloadText,
  exportFileName,
  exportMarkdown,
  markdownToNote,
  noteToMarkdown,
  uniqueFileNames,
} from "@/features/editor/lib/exchange";
import type { Draft } from "@/features/editor/lib/draft";
import { ALL, ARCHIVE, TRASH, UNFILED } from "@/lib/scopes";
import { attachmentType } from "@/features/editor/lib/attachments";
import { PaneResizer } from "@/components/PaneResizer";
import { NoteList, type ActiveFilter } from "@/components/NoteList";
import { forgetStoredImage, useIsCompact } from "@/lib/media";
import { useCollaborationPeers, useCollaborativeNote } from "@/lib/collab";
import { loadAutoLock, saveAutoLock, useAutoLock, type AutoLockMinutes } from "@/lib/autoLock";
import {
  CollectionMenu,
  Avatar,
  NoteContextMenu,
  NoteMenu,
  SettingsPanel,
} from "@/components/WorkspaceMenus";
import type { MenuPoint } from "@/lib/contextMenu";
import { Sidebar, type Scope } from "@/components/Sidebar";
import { CommandPalette, ShortcutSheet, type Command } from "@/components/CommandPalette";
import type { NoteEditorHandle } from "@/features/editor/components/NoteEditor";
import { MemberPresenceCard } from "@/features/editor/components/MemberPresenceCard";
import {
  groupEntries,
  createListPreferences,
  loadListPreferences,
  preferencesForFolder,
  rememberRecent,
  saveListPreferences,
  type ListPreferences,
  type ListPreferencesV1,
} from "@/lib/listPreferences";
import {
  presencePaletteFor,
  setWritingPreferences,
  useWritingPreferences,
} from "@/lib/writingPreferences";

const NoteEditor = lazy(() =>
  import("@/features/editor/components/NoteEditor").then((m) => ({ default: m.NoteEditor })),
);

export const Route = createFileRoute("/notes")({
  component: NotesPage,
});

/** A Postgres row write is cheap enough to commit shortly after typing stops. */
const AUTOSAVE_MS = 250;
/** How long a pause has to be before the other person is told you stopped. */
const TYPING_IDLE_MS = 2500;

/* A failed write is retried on its own, backing off so a server that is down
   is not hammered — but never so slowly that a recovered connection is missed. */
const RETRY_MIN_MS = 4000;
const RETRY_MAX_MS = 60_000;

const SIDEBAR_WIDTH_KEY = "napp:sidebar-width";
const LIST_WIDTH_KEY = "napp:list-width";
const SIDEBAR_DEFAULT = 248;
const LIST_DEFAULT = 380;
const SIDEBAR_MIN = 210;
const SIDEBAR_MAX = 420;
const LIST_MIN = 300;
const LIST_MAX = 620;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function loadPaneWidth(key: string, fallback: number, min: number, max: number): number {
  try {
    const stored = Number(localStorage.getItem(key));
    return Number.isFinite(stored) && stored > 0 ? clamp(stored, min, max) : fallback;
  } catch {
    return fallback;
  }
}

/* Enough of a fingerprint to notice that folders, tags or note placement moved,
   without serialising every note's metadata on every realtime wake-up. */
function metaShape(meta: Meta): string {
  let shape = `${meta.partnerName ?? ""}|${meta.folders.length}|${meta.tags.length}`;
  for (const folder of meta.folders) shape += `|${folder.id}:${folder.name}`;
  for (const tag of meta.tags) shape += `|${tag.id}:${tag.name}:${tag.color}`;
  for (const note of meta.notes) {
    shape += `|${note.id}:${note.folderId ?? ""}:${note.pinned ? 1 : 0}:${note.trashedAt ?? ""}:${note.archivedAt ?? ""}:${note.tagIds.join(",")}`;
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
  /** The scope on screen, which is a member id. Empty until the session and
   *  the roster have both arrived. */
  const [viewAs, setViewAs] = useState<string>("");
  const [members, setMembers] = useState<ArchiveMember[]>([]);
  /** Seats, and the invitations already holding one. Loaded with Settings
   *  rather than with the archive: nothing outside that panel asks. */
  const [seatLimit, setSeatLimit] = useState(2);
  const [invites, setInvites] = useState<PendingInvite[]>([]);

  const [entries, setEntries] = useState<NoteEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string>(ALL);
  const [query, setQuery] = useState("");

  /** One scope of folders, tags and note placement per member. */
  const [metas, setMetas] = useState<Record<string, Meta>>({});

  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  /** A one-line answer to a command that has no other visible outcome —
   *  "Copied as Markdown", "Imported 12 notes". It borrows the save readout's
   *  slot, which is where this window already says what just happened. */
  const [statusFlash, setStatusFlash] = useState("");
  const [syncFlash, setSyncFlash] = useState(false);
  /** What the last merge did: a word for the readout, a sentence for its
   *  tooltip, because the readout slot holds one state and not a paragraph. */
  const [merge, setMerge] = useState<{ label: string; detail: string } | null>(null);
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
  const [sidebarWidth, setSidebarWidth] = useState(() =>
    loadPaneWidth(SIDEBAR_WIDTH_KEY, SIDEBAR_DEFAULT, SIDEBAR_MIN, SIDEBAR_MAX),
  );
  const [listWidth, setListWidth] = useState(() =>
    loadPaneWidth(LIST_WIDTH_KEY, LIST_DEFAULT, LIST_MIN, LIST_MAX),
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  /* This account's own profile. The roster carries everybody's, but the one
     being edited is read on its own so a save shows immediately rather than
     waiting for the next archive snapshot. */
  const [profile, setProfile] = useState<Profile>({
    nickname: "",
    avatarObject: null,
    hideArchived: false,
  });
  const [avatarUrls, setAvatarUrls] = useState<Record<string, string | null>>({});
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [presenceEnabled, setPresenceEnabled] = useState(false);
  const [proofreaderEnabled, setProofreaderEnabled] = useState(loadProofreaderPreference);
  const writingPreferences = useWritingPreferences();
  const [presenceReady, setPresenceReady] = useState(false);
  const [presentMembers, setPresentMembers] = useState<Map<string, PresenceMember>>(
    () => new Map(),
  );
  const presenceChannelRef = useRef<RealtimeChannel | null>(null);
  const typingOffRef = useRef<number | undefined>(undefined);
  const typingRef = useRef(false);
  /** Where a right-click landed on the note page, if one has. */
  const [editorMenuPoint, setEditorMenuPoint] = useState<MenuPoint | null>(null);
  /** The phone has no room for a permanent sidebar, so it gets the same one
   *  as a drawer — the destinations are identical, only the staging differs. */
  const [foldersOpen, setFoldersOpen] = useState(false);
  const [mobileScreen, setMobileScreen] = useState<"collection" | "note">("collection");
  const [listPreferences, setListPreferences] = useState<Record<string, ListPreferencesV1>>({});
  /** Minutes of inactivity before the archive locks itself; 0 is never. */
  const [autoLock, setAutoLock] = useState<AutoLockMinutes>(loadAutoLock);

  /* Uploaded this session, so the tab that just attached a file knows its type
     without a round trip. Anything else opens as the PDF it almost always is. */
  const fileTypes = useRef(new Map<string, string>());
  const searchRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const noteEditorRef = useRef<NoteEditorHandle>(null);

  const collaborationIdentity = useMemo(
    () =>
      session
        ? {
            userId: session.userId,
            archiveId: session.archiveId,
            name: profile.nickname || session.email.split("@")[0] || "Someone",
          }
        : null,
    [session, profile.nickname],
  );
  const collaborative = useCollaborativeNote(selectedId, collaborationIdentity, presenceEnabled);
  /* Who is on this note, asked of the note's own document rather than of a
     second channel that has to be told which note that is. A peer in this
     list is connected to this note by construction. */
  const notePeers = useCollaborationPeers(collaborative.provider, session?.userId ?? null);

  // ── Refs mirroring state, so the save pipeline can read the truth
  //    synchronously without waiting for a React commit. ───────────────────
  const entriesRef = useRef<NoteEntry[]>([]);
  entriesRef.current = entries;
  const metasRef = useRef(metas);
  metasRef.current = metas;
  const sessionRef = useRef<AppSession | null>(null);
  sessionRef.current = session;

  /** Note edits waiting to be written live in the draft store (lib/draft.ts),
   *  keyed by note so switching notes or archive labels never strands one. */
  const pendingMetaRef = useRef<Map<string, { before: Meta; after: Meta }>>(new Map());
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

  const activeMeta = metas[viewAs] ?? EMPTY_META;
  /* What to call the other person, for the copy that still says "partner". The
     archive setting was a single stored string; a nickname belongs to whoever
     owns it. */
  const partnerName =
    members.find((member) => !member.isSelf && member.nickname)?.nickname ??
    activeMeta.partnerName ??
    "Partner";
  const storedPreferences = listPreferences[viewAs] ?? createListPreferences(viewAs);
  const activeListPreferences = preferencesForFolder(storedPreferences, selectedFolderId);

  useEffect(() => {
    try {
      localStorage.setItem("napp:navigation", navigationOpen ? "open" : "closed");
    } catch {
      /* The preference is optional; writing still works without local storage. */
    }
  }, [navigationOpen]);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(Math.round(sidebarWidth)));
      localStorage.setItem(LIST_WIDTH_KEY, String(Math.round(listWidth)));
    } catch {
      /* Pane sizing is a convenience; the archive never depends on it. */
    }
  }, [sidebarWidth, listWidth]);

  useEffect(() => {
    for (const preferences of Object.values(listPreferences)) saveListPreferences(preferences);
  }, [listPreferences]);

  /* Preferences are per member and stored locally, so they are read as the
     roster arrives rather than at mount, when nobody is known yet. */
  useEffect(() => {
    if (members.length === 0) return;
    setListPreferences((current) => {
      const next = { ...current };
      let changed = false;
      for (const member of members) {
        if (!next[member.userId]) {
          next[member.userId] = loadListPreferences(member.userId);
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [members]);

  /* The signed-in account's own profile, read once the session exists. */
  useEffect(() => {
    if (!session) return;
    let live = true;
    void loadProfile(session)
      .then((loaded) => {
        if (live) setProfile(loaded);
      })
      .catch(() => {
        /* A profile that will not load is not a reason to keep you out of your
           notes: the interface falls back to initials and the address. */
      });
    return () => {
      live = false;
    };
  }, [session]);

  /* One roster load carries every member's avatar object. The byte URLs live in
     a module cache, so the sidebar, switch and Settings reuse one download and
     an ordinary component unmount never revokes an image still in use. */
  useEffect(() => {
    const leases: Array<ReturnType<typeof acquireAvatarUrl>> = [];
    let live = true;
    setAvatarUrls((current) =>
      Object.fromEntries(members.map((member) => [member.userId, current[member.userId] ?? null])),
    );
    for (const member of members) {
      if (!member.avatarObject) continue;
      const lease = acquireAvatarUrl(member.userId, member.avatarObject);
      leases.push(lease);
      void lease.url.then((url) => {
        if (!live) return;
        setAvatarUrls((current) => ({ ...current, [member.userId]: url }));
      });
    }
    return () => {
      live = false;
      for (const lease of leases) lease.release();
    };
  }, [members]);

  const setActiveMeta = useCallback(
    (m: Meta) => setMetas((current) => ({ ...current, [viewAs]: m })),
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
      setViewAs(s.userId);
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

    setMembers(snapshot.members);
    setSeatLimit(snapshot.seatLimit);
    setMetas((current) => {
      const next = { ...current };
      for (const [owner, meta] of Object.entries(snapshot.metas)) {
        if (pendingMetaRef.current.has(owner)) continue;
        next[owner] = meta;
      }
      return next;
    });

    const metadataChanged = Object.entries(snapshot.metas).some(
      ([owner, meta]) => metaShape(metasRef.current[owner] ?? EMPTY_META) !== metaShape(meta),
    );
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
    replaceDraft(
      open,
      {
        title: titleBusy && current ? current.title : fresh.note.title,
        body: fresh.note.body,
        content: fresh.note.content,
      },
      fresh.note.updatedAt,
    );
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

  useEffect(() => {
    if (!session) return;
    setPresenceEnabled(loadPresencePreference(session));
    setPresenceReady(true);
    return () => setPresenceReady(false);
  }, [session]);

  useEffect(() => {
    if (!session || !presenceReady || !presenceEnabled) {
      setPresentMembers(new Map());
      return;
    }
    const channel = subscribeToPresence(session, setPresentMembers);
    presenceChannelRef.current = channel;
    return () => {
      presenceChannelRef.current = null;
      window.clearTimeout(typingOffRef.current);
      typingRef.current = false;
      void unsubscribeFromPresence(channel);
    };
  }, [session, presenceReady, presenceEnabled]);

  const onlineMemberIds = useMemo(() => new Set(presentMembers.keys()), [presentMembers]);

  /* Opening a note is an announcement; closing one is the same announcement
     with a null. Typing stops when you do, so leaving a note cancels the flag
     rather than leaving it raised on a page nobody is on. */
  useEffect(() => {
    const channel = presenceChannelRef.current;
    if (!channel || !session) return;
    window.clearTimeout(typingOffRef.current);
    typingRef.current = false;
    publishPresence(channel, session, { noteId: selectedId, typing: false });
  }, [selectedId, session, presenceEnabled]);

  /* One announcement when the burst starts and one when it ends, rather than a
     packet per keystroke. TYPING_IDLE_MS is how long a pause has to be before
     the other person is told you stopped. */
  const markTyping = useCallback(() => {
    const channel = presenceChannelRef.current;
    if (!channel || !session) return;
    window.clearTimeout(typingOffRef.current);
    if (!typingRef.current) {
      typingRef.current = true;
      publishPresence(channel, session, { noteId: selectedIdRef.current, typing: true });
    }
    typingOffRef.current = window.setTimeout(() => {
      typingRef.current = false;
      const live = presenceChannelRef.current;
      if (live) publishPresence(live, session, { noteId: selectedIdRef.current, typing: false });
    }, TYPING_IDLE_MS);
  }, [session]);

  /** The owner's whole catalogue, unfiltered — what the rail and the scope
   *  strip count against. Memoised so their counts are not recomputed for an
   *  array that holds exactly the same notes as the render before. */
  const ownedEntries = useMemo(
    () => entries.filter((entry) => entry.note.ownerId === viewAs),
    [entries, viewAs],
  );

  /* The trash wins over the shelf: a note thrown away while archived is
     waiting to be deleted, and that is the more urgent thing to say. Both sets
     are named here rather than inside the slice below, because emptying either
     place asks the same question the filter does. */
  const trashedIds = useMemo(
    () => new Set(activeMeta.notes.filter((note) => note.trashedAt).map((note) => note.id)),
    [activeMeta],
  );

  const archivedIds = useMemo(
    () =>
      new Set(
        activeMeta.notes
          .filter((note) => note.archivedAt && !note.trashedAt)
          .map((note) => note.id),
      ),
    [activeMeta],
  );

  // ── The visible slice: folder → search, newest first ────────────────────
  const visible = useMemo(() => {
    const meta = activeMeta;
    const index = indexOf(meta);
    const folderOf = (id: string) => {
      const fid = index.byNote.get(id)?.folderId ?? null;
      return fid && index.byFolder.has(fid) ? fid : null;
    };

    let list = ownedEntries;

    if (selectedFolderId === TRASH) {
      list = list.filter((entry) => trashedIds.has(entry.note.id));
    } else if (selectedFolderId === ARCHIVE) {
      list = list.filter((entry) => archivedIds.has(entry.note.id));
    } else {
      list = list.filter(
        (entry) => !trashedIds.has(entry.note.id) && !archivedIds.has(entry.note.id),
      );
      if (selectedFolderId === UNFILED) {
        list = list.filter((e) => folderOf(e.note.id) === null);
      } else if (selectedFolderId !== ALL) {
        list = list.filter((e) => folderOf(e.note.id) === selectedFolderId);
      }
    }

    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((e) => derivedOf(e.note).haystack.includes(q));
    }

    return list;
  }, [ownedEntries, activeMeta, trashedIds, archivedIds, selectedFolderId, query]);

  const noteGroups = useMemo(() => {
    const pinnedIds = new Set(
      activeMeta.notes.filter((note) => note.pinned).map((note) => note.id),
    );
    return groupEntries(visible, pinnedIds, activeListPreferences);
  }, [visible, activeMeta.notes, activeListPreferences]);
  const orderedVisible = useMemo(() => noteGroups.flatMap((group) => group.entries), [noteGroups]);

  const selected = visible.find((e) => e.note.id === selectedId) ?? null;
  const selfMember = members.find((member) => member.isSelf);
  const canWriteArchive = selfMember?.role === "editor";
  /* A question about the archive and the note — your role, and whether this is
     Trash. It used to be answered by the websocket as well
     (`canEdit && collaborative.ready`), so a collaboration server that was slow
     or asleep took away the page's own controls: the format bar, and the Add
     cover button, which writes to Postgres and never needed the socket at all.
     What the socket gates is the *text*, and it gates it at the mount: the
     editor is built once, against one document, and never rebuilt.

     That document may arrive from either side. The server is one source; this
     device's own IndexedDB store is the other, and it is milliseconds away
     rather than a continent — which is the difference between reading your
     note now and reading it after a sleeping instance has woken. The store
     decides nothing: what is drawn is a note in `entries`, and `entries` is
     the catalogue Postgres returned under row level security a moment ago, so
     somebody who has lost access is handed no row to draw. */
  const canEdit = selected ? selectedFolderId !== TRASH && canWriteArchive : false;

  const folderLabel =
    selectedFolderId === ALL
      ? "All notes"
      : selectedFolderId === UNFILED
        ? "Unfiled"
        : selectedFolderId === TRASH
          ? "Trash"
          : selectedFolderId === ARCHIVE
            ? "Archive"
            : (activeMeta.folders.find((f) => f.id === selectedFolderId)?.name ?? "Folder");

  // Seed the store from the stored note. `ensureDraft` leaves unsaved work
  // alone, so this is safe to run whenever the selection or the entry changes.
  useEffect(() => {
    if (!selected) return;
    ensureDraft(
      selected.note.id,
      {
        title: selected.note.title,
        body: selected.note.body,
        content: selected.note.content,
      },
      selected.note.updatedAt,
    );
  }, [selected]);

  // ── Save pipeline ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!merge) return;
    const timer = window.setTimeout(() => setMerge(null), 6000);
    return () => window.clearTimeout(timer);
  }, [merge]);

  useEffect(() => {
    if (!statusFlash) return;
    const timer = window.setTimeout(() => setStatusFlash(""), 4000);
    return () => window.clearTimeout(timer);
  }, [statusFlash]);

  const storeEntry = useCallback((note: Note, version: number) => {
    const saved: NoteEntry = { note, version };
    entriesRef.current = entriesRef.current.map((current) =>
      current.note.id === note.id ? saved : current,
    );
    setEntries(entriesRef.current);
  }, []);

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
    [storeEntry],
  );

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
    const entry = await createNote(s, note, { id: note.id, folderId: null, tagIds: [] });
    entriesRef.current = [entry, ...entriesRef.current];
    setEntries(entriesRef.current);
  }

  const drain = useCallback(async () => {
    const s = sessionRef.current;
    if (!s || inFlightRef.current) return;
    if (!hasPending() && pendingMetaRef.current.size === 0) return;

    inFlightRef.current = true;
    setSaving(true);
    let failed = false;

    try {
      while (hasPending() || pendingMetaRef.current.size > 0) {
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
  }, [refreshRemote, resolveConflict, storeEntry]);

  const schedule = useCallback(() => {
    if (!hasPending()) {
      window.clearTimeout(timerRef.current);
      setDirty(pendingMetaRef.current.size > 0);
      return;
    }
    setDirty(true);
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => void drain(), AUTOSAVE_MS);
  }, [drain]);

  const saveNow = useCallback(() => {
    window.clearTimeout(timerRef.current);
    void drain();
  }, [drain]);

  /** One keystroke, two consequences: a save is queued, and whoever else has
   *  this note open is told somebody is writing in it. */
  const handleEdited = useCallback(() => {
    schedule();
    markTyping();
  }, [schedule, markTyping]);

  useEffect(
    () => () => {
      window.clearTimeout(timerRef.current);
      window.clearTimeout(retryRef.current);
    },
    [],
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

  const handleUploadImage = useCallback(
    async (file: File): Promise<string> => {
      if (!canWriteArchive) throw new Error("This archive is view only");
      const current = sessionRef.current;
      if (!current) throw new Error("Sign in again before uploading an image");
      const blob = await prepareImageForNote(file);
      const imageId = crypto.randomUUID();
      await uploadImage(current, imageId, blob);
      return imageId;
    },
    [canWriteArchive],
  );

  const resolveImage = useCallback(async (imageId: string): Promise<Blob> => {
    const current = sessionRef.current;
    if (!current) throw new Error("Sign in again to view this image");
    return downloadImage(current, imageId);
  }, []);

  /* Attachments and images share one private, account-protected bucket. */
  const handleUploadFile = useCallback(
    async (file: File): Promise<string> => {
      if (!canWriteArchive) throw new Error("This archive is view only");
      const current = sessionRef.current;
      if (!current) throw new Error("Sign in again before attaching a file");
      const objectId = crypto.randomUUID();
      await uploadObject(current, objectId, file);
      fileTypes.current.set(objectId, file.type || attachmentType(file.name));
      return objectId;
    },
    [canWriteArchive],
  );

  const resolveFile = useCallback(async (objectId: string): Promise<Blob> => {
    const current = sessionRef.current;
    if (!current) throw new Error("Sign in again to open this attachment");
    return downloadObject(current, objectId, fileTypes.current.get(objectId) ?? "application/pdf");
  }, []);

  const handleUpdatePageProperties = useCallback(
    async (values: Pick<Note, "photo" | "cover">, forNoteId?: string) => {
      const current = sessionRef.current;
      const noteId = forNoteId ?? selectedIdRef.current;
      if (!current || !noteId || !canWriteArchive) throw new Error("This archive is view only");
      const previous = entriesRef.current.find((entry) => entry.note.id === noteId);
      if (!previous) return;
      const changed = { ...previous, note: { ...previous.note, ...values } };
      entriesRef.current = entriesRef.current.map((entry) =>
        entry.note.id === noteId ? changed : entry,
      );
      setEntries(entriesRef.current);
      try {
        await updateNoteProperties(current, noteId, values);
      } catch (reason) {
        entriesRef.current = entriesRef.current.map((entry) =>
          entry.note.id === noteId ? previous : entry,
        );
        setEntries(entriesRef.current);
        throw reason;
      }
    },
    [canWriteArchive],
  );

  /* A note's picture is chosen where the note is named — its own context menu
     — and cut by the cropper the profile picture already uses, so the two
     pictures are made the same way. Passing null takes it off. */
  const handleNotePhoto = useCallback(
    async (noteId: string, file: File | null, crop?: AvatarCrop) => {
      const current = sessionRef.current;
      const entry = entriesRef.current.find((item) => item.note.id === noteId);
      if (!current || !entry) return;
      const replaced = entry.note.photo?.objectId ?? null;
      try {
        let photo: Note["photo"] = null;
        if (file) {
          const objectId = crypto.randomUUID();
          await uploadImage(current, objectId, await prepareAvatar(file, crop));
          photo = { kind: "photo", objectId };
        }
        await handleUpdatePageProperties({ photo, cover: entry.note.cover }, noteId);
        if (replaced) forgetStoredImage(replaced);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Could not use that picture");
      }
    },
    [handleUpdatePageProperties],
  );

  /* The editor has already written the words into the draft store; the page
     only has to decide when they reach Postgres. */

  const handleMetaChange = useCallback(
    (next: Meta | ((prev: Meta) => Meta)) => {
      if (!canWriteArchive) return;
      const pending = pendingMetaRef.current.get(viewAs);
      const base = pending?.after ?? metasRef.current[viewAs] ?? activeMeta ?? EMPTY_META;
      const m = typeof next === "function" ? (next as (prev: Meta) => Meta)(base) : next;
      pendingMetaRef.current.set(viewAs, {
        before: pending?.before ?? base,
        after: m,
      });
      setActiveMeta(m);
      schedule();
    },
    [viewAs, activeMeta, setActiveMeta, schedule, canWriteArchive],
  );

  const handleTogglePin = useCallback(
    (noteId: string) => {
      handleMetaChange((prev) => {
        const existing = indexOf(prev).byNote.get(noteId);
        const notes: NoteMeta[] = existing
          ? prev.notes.map((note) =>
              note.id === noteId ? { ...note, pinned: !note.pinned } : note,
            )
          : [...prev.notes, { id: noteId, folderId: null, tagIds: [], pinned: true }];
        return { ...prev, notes };
      });
    },
    [handleMetaChange],
  );

  // ── Create / delete ─────────────────────────────────────────────────────
  /* ── Markdown in and out ──────────────────────────────────────────────────
     Deliberately files and the clipboard rather than an integration with
     anybody's API. Obsidian is a folder of `.md`, Notion and Google Docs both
     read pasted Markdown, and Apple Notes has no API at all — so a file and a
     clipboard reach all three, and none of them needs an OAuth secret or the
     server this project does not have. */

  const markdownFor = useCallback(
    (entry: NoteEntry) => {
      if (entry.note.id === selectedId && collaborative.ready && collaborative.doc) {
        const live = projectDocument(collaborative.doc);
        return noteToMarkdown(live.title, live.content);
      }
      /* What is on screen, not what last reached Postgres: exporting a note you
       are still typing in should give you the words you can see. */
      const draft = readDraft(entry.note.id);
      return noteToMarkdown(draft?.title ?? entry.note.title, draft?.content ?? entry.note.content);
    },
    [selectedId, collaborative.ready, collaborative.doc],
  );

  const handleCopyMarkdown = useCallback(
    async (entry: NoteEntry) => {
      try {
        await navigator.clipboard.writeText(markdownFor(entry));
        setStatusFlash("Copied");
      } catch {
        setError("The browser would not give this page the clipboard");
      }
    },
    [markdownFor],
  );

  const handleExportMarkdown = useCallback(
    (entry: NoteEntry) => {
      const draft = readDraft(entry.note.id);
      downloadText(exportFileName(draft?.title ?? entry.note.title), markdownFor(entry));
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
      const shape = await exportMarkdown(
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
  }, [orderedVisible, markdownFor, folderLabel]);

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
          const metadata: NoteMeta = { id: note.id, folderId: null, tagIds: [] };
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
    [canWriteArchive, viewAs, selectedFolderId],
  );

  const handleNew = useCallback(async () => {
    if (!canWriteArchive) return;
    const s = sessionRef.current;
    if (!s) return;
    const folderId =
      selectedFolderId === ALL ||
      selectedFolderId === UNFILED ||
      selectedFolderId === TRASH ||
      selectedFolderId === ARCHIVE
        ? null
        : selectedFolderId;

    const note: Note = {
      id: crypto.randomUUID(),
      title: "",
      body: "",
      content: structuredClone(EMPTY_RICH_TEXT),
      contentVersion: RICH_TEXT_VERSION,
      legacyBody: null,
      photo: null,
      cover: null,
      ownerId: viewAs,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setSaving(true);
    setError("");
    try {
      // A note filed in a folder that has just been created still lives only
      // in the pending Meta: Postgres has not seen the folder row yet, so
      // inserting the note with that folder_id would violate the
      // notes_folder_owner_id_fkey. Flush the pending folder first.
      if (folderId !== null) {
        const pending = pendingMetaRef.current.get(viewAs);
        const needsFlush = pending?.after.folders.some((folder) => folder.id === folderId) ?? false;
        if (needsFlush) {
          window.clearTimeout(timerRef.current);
          window.clearTimeout(retryRef.current);
          while (inFlightRef.current) {
            await new Promise((resolve) => setTimeout(resolve, 30));
          }
          const currentPending = pendingMetaRef.current.get(viewAs);
          if (currentPending) {
            pendingMetaRef.current.delete(viewAs);
            try {
              await persistMetaDiff(s, viewAs, currentPending.before, currentPending.after);
              setDirty(pendingMetaRef.current.size > 0 || hasPending());
            } catch (err) {
              const newer = pendingMetaRef.current.get(viewAs);
              pendingMetaRef.current.set(viewAs, {
                before: currentPending.before,
                after: newer?.after ?? currentPending.after,
              });
              throw err;
            }
          }
        }
      }

      const metadata: NoteMeta = { id: note.id, folderId, tagIds: [] };
      const entry = await createNote(s, note, metadata);
      entriesRef.current = [entry, ...entriesRef.current];
      setEntries(entriesRef.current);

      setMetas((current) => {
        const base = current[viewAs] ?? metasRef.current[viewAs] ?? EMPTY_META;
        return { ...current, [viewAs]: { ...base, notes: [...base.notes, metadata] } };
      });

      setQuery("");
      if (selectedFolderId === TRASH || selectedFolderId === ARCHIVE) setSelectedFolderId(ALL);
      setSelectedId(note.id);
      setListPreferences((current) => ({
        ...current,
        [viewAs]: rememberRecent(current[viewAs] ?? createListPreferences(viewAs), note.id),
      }));
      if (compact) setMobileScreen("note");
      ensureDraft(
        note.id,
        {
          title: "",
          body: "",
          content: structuredClone(EMPTY_RICH_TEXT),
        },
        note.updatedAt,
      );
      window.setTimeout(() => titleRef.current?.focus(), 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create note");
    } finally {
      setSaving(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewAs, selectedFolderId, canWriteArchive]);

  const handleMoveToTrash = useCallback(
    (entry: NoteEntry) => {
      handleMetaChange((prev) => {
        const existing = prev.notes.find((note) => note.id === entry.note.id);
        const notes: NoteMeta[] = existing
          ? prev.notes.map((note) =>
              note.id === entry.note.id ? { ...note, trashedAt: new Date().toISOString() } : note,
            )
          : [
              ...prev.notes,
              {
                id: entry.note.id,
                folderId: null,
                tagIds: [],
                trashedAt: new Date().toISOString(),
              },
            ];
        return { ...prev, notes };
      });

      if (selectedId === entry.note.id) {
        setSelectedId(null);
        if (compact) setMobileScreen("collection");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedId, handleMetaChange],
  );

  /* Onto the shelf and back off it. One handler rather than two: the halves
     differ by a timestamp, and both leave the list the note was in. */
  const handleArchiveChange = useCallback(
    (entry: NoteEntry, archived: boolean) => {
      const archivedAt = archived ? new Date().toISOString() : undefined;
      handleMetaChange((prev) => {
        const existing = prev.notes.find((note) => note.id === entry.note.id);
        const notes: NoteMeta[] = existing
          ? prev.notes.map((note) => (note.id === entry.note.id ? { ...note, archivedAt } : note))
          : [...prev.notes, { id: entry.note.id, folderId: null, tagIds: [], archivedAt }];
        return { ...prev, notes };
      });

      if (selectedId === entry.note.id) {
        setSelectedId(null);
        if (compact) setMobileScreen("collection");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedId, handleMetaChange],
  );

  const handleRestore = useCallback(
    (entry: NoteEntry) => {
      handleMetaChange((prev) => ({
        ...prev,
        notes: prev.notes.map((note) =>
          note.id === entry.note.id ? { ...note, trashedAt: undefined } : note,
        ),
      }));
      if (selectedId === entry.note.id) {
        setSelectedId(null);
      }
    },

    [selectedId, handleMetaChange],
  );

  /* One note or the whole trash: the same four prunes either way — the draft
     store, the loaded entries, this scope's metadata, and the selection if it
     was pointing at something that just stopped existing. */
  const deleteForever = useCallback(
    async (targets: NoteEntry[]) => {
      if (!canWriteArchive || targets.length === 0) return;
      const s = sessionRef.current;
      if (!s) return;
      const doomed = new Set(targets.map((entry) => entry.note.id));
      setSaving(true);
      setError("");
      try {
        for (const id of doomed) dropDraft(id);
        await deleteNotes(s, [...doomed]);

        entriesRef.current = entriesRef.current.filter((e) => !doomed.has(e.note.id));
        setEntries(entriesRef.current);

        setMetas((current) => {
          const base = current[viewAs] ?? metasRef.current[viewAs] ?? EMPTY_META;
          return {
            ...current,
            [viewAs]: { ...base, notes: base.notes.filter((note) => !doomed.has(note.id)) },
          };
        });

        if (selectedId && doomed.has(selectedId)) {
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
    [selectedId, viewAs, canWriteArchive],
  );

  const handleDeleteForever = useCallback(
    (entry: NoteEntry) => void deleteForever([entry]),
    [deleteForever],
  );

  /* The two bulk actions the shelf and the waiting room each want, and they
     are not the same kind of act: emptying the trash destroys, clearing the
     archive only files everything back. Both read the whole scope rather than
     the visible slice, so a search left in the box cannot quietly narrow what
     "all" means. */
  const trashedEntries = useMemo(
    () => ownedEntries.filter((entry) => trashedIds.has(entry.note.id)),
    [ownedEntries, trashedIds],
  );

  const archivedEntries = useMemo(
    () => ownedEntries.filter((entry) => archivedIds.has(entry.note.id)),
    [ownedEntries, archivedIds],
  );

  const handleEmptyTrash = useCallback(
    () => void deleteForever(trashedEntries),
    [deleteForever, trashedEntries],
  );

  const handleEmptyArchive = useCallback(() => {
    if (archivedEntries.length === 0) return;
    const returning = new Set(archivedEntries.map((entry) => entry.note.id));
    handleMetaChange((prev) => ({
      ...prev,
      notes: prev.notes.map((note) =>
        returning.has(note.id) ? { ...note, archivedAt: undefined } : note,
      ),
    }));
  }, [archivedEntries, handleMetaChange]);

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
        [viewAs]: rememberRecent(current[viewAs] ?? createListPreferences(viewAs), id),
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
        /* Inside the text ⌘K is still "link these words" — that convention is
           older than the palette's and the reader is holding a selection. */
        if (canEdit && el?.closest(".rich-text-content")) {
          noteEditorRef.current?.openLink();
          return;
        }
        setPaletteOpen(true);
        return;
      }
      if (mod && e.key.toLowerCase() === "n") {
        e.preventDefault();
        void handleNew();
        return;
      }
      if (typing) return;

      if (e.key === "?") {
        e.preventDefault();
        setShortcutsOpen(true);
        return;
      }

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
  }, [moveSelection, handleNew, saveNow, selectedId, selected, canEdit]);

  // ── Drag a note onto a folder ───────────────────────────────────────────
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function handleDragEnd(e: DragEndEvent) {
    setDragId(null);
    const over = e.over?.id as string | undefined;
    if (!over) return;
    const noteId = e.active.id as string;
    const folderId = over === UNFILED ? null : over;
    handleMetaChange((prev) => {
      const existing = prev.notes.find((n) => n.id === noteId);
      return {
        ...prev,
        notes: existing
          ? prev.notes.map((n) => (n.id === noteId ? { ...n, folderId } : n))
          : [...prev.notes, { id: noteId, folderId, tagIds: [] }],
      };
    });
  }

  /* ── Folders, edited where they are used ─────────────────────────────────
     Creating, renaming and deleting a folder are all one write to the archive's
     metadata. Deleting one never deletes a note: the notes it held simply
     become unfiled, which is the only behaviour that makes a folder safe to
     throw away. ───────────────────────────────────────────────────────────── */
  function handleCreateFolder(name: string, parentId: string | null) {
    handleMetaChange((prev) => ({
      ...prev,
      folders: [...prev.folders, { id: crypto.randomUUID(), name, parentId }],
    }));
  }

  function handleRenameFolder(id: string, name: string) {
    handleMetaChange((prev) => ({
      ...prev,
      folders: prev.folders.map((folder) => (folder.id === id ? { ...folder, name } : folder)),
    }));
  }

  /* Deleting a folder deletes the branch under it. Nothing loses a note: every
     note anywhere in that branch becomes unfiled, and an unfiled note is in All
     notes — which is the only reason throwing a folder away is safe. */
  function handleDeleteFolder(id: string) {
    const latest =
      pendingMetaRef.current.get(viewAs)?.after ?? metasRef.current[viewAs] ?? activeMeta;
    const doomed = new Set([id]);
    for (let added = true; added; ) {
      added = false;
      for (const folder of latest.folders) {
        const parentId = folder.parentId ?? null;
        if (parentId && doomed.has(parentId) && !doomed.has(folder.id)) {
          doomed.add(folder.id);
          added = true;
        }
      }
    }
    handleMetaChange((prev) => ({
      ...prev,
      folders: prev.folders.filter((folder) => !doomed.has(folder.id)),
      notes: prev.notes.map((note) =>
        note.folderId && doomed.has(note.folderId) ? { ...note, folderId: null } : note,
      ),
    }));
    if (doomed.has(selectedFolderId)) handleSelectFolder(ALL);
  }

  function handleMoveNote(noteId: string, folderId: string | null) {
    handleMetaChange((prev) => {
      const existing = prev.notes.find((note) => note.id === noteId);
      return {
        ...prev,
        notes: existing
          ? prev.notes.map((note) => (note.id === noteId ? { ...note, folderId } : note))
          : [...prev.notes, { id: noteId, folderId, tagIds: [] }],
      };
    });
    if (selectedFolderId !== ALL) setSelectedFolderId(folderId ?? ALL);
  }

  function handleListPreferencesChange(next: ListPreferences) {
    setListPreferences((current) => ({
      ...current,
      [viewAs]: {
        ...(current[viewAs] ?? createListPreferences(viewAs)),
        folders: {
          ...(current[viewAs] ?? createListPreferences(viewAs)).folders,
          [selectedFolderId]: next,
        },
      },
    }));
  }

  function handleViewChange(v: string) {
    saveNow();
    setViewAs(v);
    setSelectedId(null);
    setSelectedFolderId(ALL);
    setQuery("");
    setMobileScreen("collection");
  }

  function handleSelectFolder(id: string) {
    setSelectedFolderId(id);
    setSelectedId(null);
    if (compact) setMobileScreen("collection");
  }

  const handleSelectNote = useCallback(
    (id: string) => {
      setSelectedId(id);
      setListPreferences((current) => ({
        ...current,
        [viewAs]: rememberRecent(current[viewAs] ?? createListPreferences(viewAs), id),
      }));
      if (compact) setMobileScreen("note");
    },
    [compact, viewAs],
  );

  function handleOpenRecent(id: string) {
    setQuery("");
    setSelectedFolderId(ALL);
    handleSelectNote(id);
  }

  function handleMobileBack() {
    saveNow();
    setSelectedId(null);
    setMobileScreen("collection");
  }

  /* One writer for the profile, optimistic so the field does not snap back
     under the cursor, and rolled back with the reason if the write is refused.
     The archive is refreshed afterwards because the roster — and so the scope
     switch — carries the nickname that just changed. */
  async function persistProfile(next: Profile) {
    if (!session) return;
    const previous = profile;
    setProfile(next);
    setProfileBusy(true);
    setProfileError("");
    try {
      await saveProfile(session, next);
      await refreshRemote();
    } catch (reason) {
      setProfile(previous);
      setProfileError(reason instanceof Error ? reason.message : "Could not save your profile");
    } finally {
      setProfileBusy(false);
    }
  }

  /* Pending invitations are only ever looked at from Settings, so they are
     fetched when it opens and after anything that could change the count. */
  const refreshInvites = useCallback(async () => {
    if (!session) return;
    try {
      setInvites(await loadPendingInvites(session));
    } catch {
      setInvites([]);
    }
  }, [session]);

  useEffect(() => {
    if (settingsOpen) void refreshInvites();
  }, [settingsOpen, refreshInvites]);

  async function handleAvatarPick(file: File, crop?: AvatarCrop) {
    if (!session) return;
    setProfileBusy(true);
    setProfileError("");
    try {
      const blob = await prepareAvatar(file, crop);
      const objectId = await uploadAvatar(session, blob);
      const replaced = profile.avatarObject;
      await persistProfile({ ...profile, avatarObject: objectId });
      /* The old picture is removed only once the new one is the stored one, so
         a failed write never leaves the profile pointing at nothing. */
      if (replaced) await deleteAvatar(session, replaced).catch(() => {});
      if (replaced) invalidateAvatarUrl(replaced);
    } catch (reason) {
      setProfileError(reason instanceof Error ? reason.message : "Could not use that picture");
    } finally {
      setProfileBusy(false);
    }
  }

  async function handleAvatarRemove() {
    if (!session) return;
    const removed = profile.avatarObject;
    await persistProfile({ ...profile, avatarObject: null });
    if (removed) await deleteAvatar(session, removed).catch(() => {});
    if (removed) invalidateAvatarUrl(removed);
  }

  function handleAutoLockChange(minutes: AutoLockMinutes) {
    setAutoLock(minutes);
    saveAutoLock(minutes);
  }

  function handlePresenceChange(enabled: boolean) {
    if (!session) return;
    savePresencePreference(session, enabled);
    setPresenceEnabled(enabled);
  }

  function handleProofreaderChange(enabled: boolean) {
    saveProofreaderPreference(enabled);
    setProofreaderEnabled(enabled);
  }

  function handleLock() {
    saveNow();
    clearDrafts();
    void clearSession();
    navigate({ to: "/" });
  }

  const handleLeaveArchive = useCallback(async () => {
    const current = sessionRef.current;
    if (!current) throw new Error("Sign in again before leaving this archive");

    /* Membership removal revokes the right to finish a write, so flush first
       and fail closed if any note or metadata is still waiting locally. */
    await drain();
    if (hasPending() || pendingMetaRef.current.size > 0) {
      throw new Error("Your latest changes could not be saved. Try again before leaving.");
    }

    await leaveArchive(current);
    clearDrafts();
    await clearSession();
    setSession(null);
    navigate({ to: "/" });
  }, [drain, navigate]);

  /* Who else is on this page right now. Filtered to the note that is open, so
     the other person appears when they arrive and goes when they leave — the
     roster in Settings answers "who is online", and this answers the narrower
     question you actually have while writing. Nothing renders while presence
     is off, on either side: the channel is mutual and so is this. */
  const noteReaders = useMemo(() => {
    if (!presenceEnabled || !selectedId || notePeers.length === 0) return null;
    return (
      <span className="note-readers" aria-live="polite">
        {notePeers.map((peer) => {
          /* The roster is where a face and a chosen nickname live. Awareness is
             where *being here* lives, and it is the one the caret in the text
             already agrees with. A peer the roster has not loaded yet still
             appears, under the name the server stamped. */
          const member = members.find((candidate) => candidate.userId === peer.userId);
          const name = member?.nickname || peer.name;
          const typing = presentMembers.get(peer.userId)?.typing === true;
          const palette = presencePaletteFor(writingPreferences.presencePalette);
          return (
            <MemberPresenceCard
              key={peer.userId}
              avatarUrl={avatarUrls[peer.userId] ?? null}
              name={name}
              active={presentMembers.has(peer.userId)}
              typing={typing}
              noteJoinedAt={peer.joinedAt}
              archiveJoinedAt={member?.joinedAt}
              role={member?.role}
              color={palette.color}
              wash={palette.wash}
            />
          );
        })}
      </span>
    );
  }, [
    presenceEnabled,
    selectedId,
    notePeers,
    members,
    presentMembers,
    avatarUrls,
    writingPreferences,
  ]);

  /* Who may sign a remark: the archive's own roster, with the avatars already
     resolved for the sidebar. Comments name people, and a comment from "an id"
     is not a conversation. */
  const commentAuthors = useMemo(
    () =>
      new Map(
        members.map((member) => [
          member.userId,
          {
            userId: member.userId,
            name: member.nickname || (member.isSelf ? "You" : "Someone"),
            avatarUrl: avatarUrls[member.userId] ?? null,
          },
        ]),
      ),
    [members, avatarUrls],
  );

  /* Last hook in the body, and deliberately above the `!session` return so the
     order never changes between renders. */
  useAutoLock(autoLock, handleLock);

  if (!session) return null;

  const dragEntry = dragId ? entries.find((e) => e.note.id === dragId) : null;

  /* The states have very different lengths, so the readout is given one slot of
     a fixed width below and every state is measured against the widest of them.
     Left to size itself it slid back and forth by 55px on each debounce, which
     is the one thing in the toolbar that moves while you are looking at it. The
     write error is carried in the tooltip for the same reason. */
  const saveReadout = collaborative.refusal ? (
    <span className="label text-danger" title={collaborative.refusal}>
      Unavailable
    </span>
  ) : error ? (
    <button
      onClick={saveNow}
      title={`${error}\nClick to retry the write now`}
      className="flex items-center gap-2 text-left"
    >
      <span className="label text-danger underline-offset-2 hover:underline">Save failed</span>
    </button>
  ) : saving ? (
    <span className="flex items-center gap-2">
      <span className="animate-spin inline-block h-2.5 w-2.5 rounded-full border border-accent border-t-transparent" />
      <span className="label text-accent">Saving</span>
    </span>
  ) : dirty ? (
    <span className="label text-ink-2">Unsaved</span>
  ) : statusFlash ? (
    <span className="label text-accent">{statusFlash}</span>
  ) : selectedId && !collaborative.ready ? (
    <span className="label text-ink-4">Connecting</span>
  ) : selectedId && collaborative.connection === "offline" ? (
    <span className="label text-ink-2" title="Changes stay on this device and sync on reconnect">
      Offline
    </span>
  ) : merge ? (
    <span className="label text-accent" title={merge.detail}>
      {merge.label}
    </span>
  ) : syncFlash ? (
    <span className="label text-accent">Updated elsewhere</span>
  ) : (
    <span className="flex items-center gap-2">
      <span className={`label ${savedFlash ? "text-ok" : "text-ink-4"}`}>
        {selectedId ? "Live" : "Saved"}
      </span>
      {lastSavedAt && (
        <span className="readout tabular-nums text-ink-4">{formatStamp(lastSavedAt)}</span>
      )}
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

  /* Scope counts, computed once for the sidebar. */
  const scopes: Scope[] = (() => {
    const index = indexOf(activeMeta);
    const byFolder = new Map<string, number>();
    let trash = 0;
    let archived = 0;
    for (const entry of ownedEntries) {
      const noteMeta = index.byNote.get(entry.note.id);
      if (noteMeta?.trashedAt) {
        trash += 1;
        continue;
      }
      if (noteMeta?.archivedAt) {
        archived += 1;
        continue;
      }
      const folderId = noteMeta?.folderId ?? null;
      if (folderId && index.byFolder.has(folderId)) {
        byFolder.set(folderId, (byFolder.get(folderId) ?? 0) + 1);
      }
    }
    return [
      { id: ALL, label: "All notes", count: ownedEntries.length - trash - archived },
      ...activeMeta.folders.map((folder) => ({
        id: folder.id,
        label: folder.name,
        count: byFolder.get(folder.id) ?? 0,
      })),
      { id: ARCHIVE, label: "Archive", count: archived },
      { id: TRASH, label: "Trash", count: trash },
    ];
  })();
  /* On the phone there is no sidebar, so the scope in force is still worth a
     dismissible chip above the list. On the desktop the sidebar says it. */
  const activeFilters: ActiveFilter[] =
    compact && selectedFolderId !== ALL
      ? [{ id: "scope", label: folderLabel, onClear: () => handleSelectFolder(ALL) }]
      : [];

  /* Everything the palette can reach, in the order a resting palette should
     show it: where you were going, then what you were looking for, then the
     things the window itself does. The notes come from the same entries and
     the same `derivedOf` haystack the list searches, so a note found here and
     a note found in the list are found by the same rule. */
  const paletteCommands: Command[] = ((): Command[] => {
    if (!paletteOpen) return [];
    const open = (id: string) => () => {
      setQuery("");
      setSelectedFolderId(ALL);
      handleSelectNote(id);
    };
    return [
      ...scopes.map((scope) => ({
        id: `scope:${scope.id}`,
        group: "Go to",
        name: scope.label,
        icon:
          scope.id === TRASH ? (
            <Trash2 size={15} />
          ) : scope.id === ARCHIVE ? (
            <Archive size={15} />
          ) : scope.id === ALL ? (
            <NotebookText size={15} />
          ) : (
            <Folder size={15} />
          ),
        run: () => handleSelectFolder(scope.id),
      })),
      ...ownedEntries.map((entry) => ({
        id: `note:${entry.note.id}`,
        group: "Notes",
        name: entry.note.title || "Untitled",
        hint: derivedOf(entry.note).preview || undefined,
        keywords: derivedOf(entry.note).haystack,
        icon: <FileText size={15} />,
        run: open(entry.note.id),
      })),
      {
        id: "new",
        group: "Do",
        name: "New note",
        hint: "⌘N",
        icon: <SquarePen size={15} />,
        run: () => void handleNew(),
      },
      {
        id: "settings",
        group: "Do",
        name: "Settings",
        icon: <Settings size={15} />,
        run: () => setSettingsOpen(true),
      },
      {
        id: "export",
        group: "Do",
        name: "Export all as Markdown",
        icon: <FolderDown size={15} />,
        run: () => void handleExportAll(),
      },
      {
        id: "shortcuts",
        group: "Do",
        name: "Keyboard shortcuts",
        hint: "?",
        icon: <Keyboard size={15} />,
        run: () => setShortcutsOpen(true),
      },
      {
        id: "lock",
        group: "Do",
        name: "Lock & sign out",
        icon: <Lock size={15} />,
        run: () => handleLock(),
      },
    ];
  })();

  const collectionActions = (
    <CollectionMenu
      preferences={activeListPreferences}
      onChange={handleListPreferencesChange}
      onExportAll={() => void handleExportAll()}
      bulk={
        !canWriteArchive
          ? undefined
          : selectedFolderId === TRASH
            ? {
                label: "Delete all",
                confirm: "Delete all forever?",
                danger: true,
                count: trashedEntries.length,
                run: handleEmptyTrash,
              }
            : selectedFolderId === ARCHIVE
              ? {
                  label: "Remove all from Archive",
                  confirm: "Move all back?",
                  danger: false,
                  count: archivedEntries.length,
                  run: handleEmptyArchive,
                }
              : undefined
      }
    />
  );

  /* ── Whose notes ───────────────────────────────────────────────────────────
     The control that re-points the entire window, so it is built as a real
     switch rather than two buttons that happen to sit together: one track, one
     travelling thumb, and the two names always both legible. The thumb is a
     single element moved by `data-active`, which is what lets the selection
     slide between the halves instead of blinking from one to the other.

     `flex-1` children need a parent with a width of its own; in the phone app
     bar the switch is shrink-to-fit, so it is given one. */
  const archiveSwitch = (
    <div
      role="group"
      aria-label="Scope"
      style={
        {
          "--switch-count": Math.max(members.length, 1),
          "--switch-index": Math.max(
            members.findIndex((member) => member.userId === viewAs),
            0,
          ),
        } as React.CSSProperties
      }
      className={`archive-switch ${compact ? "archive-switch-tight w-52 shrink-0" : "w-full"}`}
    >
      <span className="archive-switch-thumb" aria-hidden="true" />
      {members.map((member) => (
        <button
          key={member.userId}
          type="button"
          onClick={() => handleViewChange(member.userId)}
          aria-pressed={viewAs === member.userId}
          className={viewAs === member.userId ? "is-active" : ""}
        >
          <Avatar
            url={avatarUrls[member.userId] ?? null}
            name={member.nickname}
            email=""
            compact
            online={presenceEnabled && onlineMemberIds.has(member.userId)}
          />
          <span className="truncate">
            {member.isSelf ? (compact ? "Mine" : "My notes") : member.nickname || "Member"}
          </span>
        </button>
      ))}
    </div>
  );

  const sidebar = (
    <Sidebar
      scopes={scopes}
      folders={activeMeta.folders}
      selectedId={selectedFolderId}
      canWrite={canWriteArchive}
      onSelect={(id) => {
        handleSelectFolder(id);
        setFoldersOpen(false);
      }}
      onCreateFolder={handleCreateFolder}
      onRenameFolder={handleRenameFolder}
      onDeleteFolder={handleDeleteFolder}
      onClose={() => (compact ? setFoldersOpen(false) : setNavigationOpen(false))}
      onSettings={() => {
        setFoldersOpen(false);
        setSettingsOpen(true);
      }}
      onLock={handleLock}
      selfAvatarUrl={avatarUrls[session.userId] ?? null}
      selfName={selfMember?.nickname || profile.nickname}
      selfEmail={session.email}
      selfOnline={presenceEnabled && onlineMemberIds.has(session.userId)}
      archiveSwitch={archiveSwitch}
    />
  );

  /* Whose notes the window is pointed at, said in the roster's own words. It
     used to read "Jacopo's notes" or the partner's, which was the last place
     in the interface still assuming an archive holds exactly two people. */
  const viewedMember = members.find((member) => member.userId === viewAs);
  const readingLabel = !viewedMember
    ? "This archive"
    : viewedMember.isSelf
      ? "Your notes"
      : `${viewedMember.nickname || "Another member"}'s notes`;

  /* Both keyboard sheets travel with the settings panel, because both layouts
     mount that and neither wants a second copy of this. */
  const keyboardSheets = (
    <>
      <CommandPalette
        open={paletteOpen}
        commands={paletteCommands}
        onClose={() => setPaletteOpen(false)}
      />
      <ShortcutSheet open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </>
  );

  const settingsPanel = (
    <SettingsPanel
      open={settingsOpen}
      email={session.email}
      reading={readingLabel}
      autoLock={autoLock}
      profile={profile}
      avatarUrl={avatarUrls[session.userId] ?? null}
      joinedAt={members.find((member) => member.isSelf)?.joinedAt}
      memberCount={members.length}
      members={members}
      seatLimit={seatLimit}
      invites={invites}
      canManageMembers={canWriteArchive}
      presenceEnabled={presenceEnabled}
      profileBusy={profileBusy}
      profileError={profileError}
      onNicknameSave={(nickname) => void persistProfile({ ...profile, nickname })}
      onAvatarPick={(file, crop) => void handleAvatarPick(file, crop)}
      onAvatarRemove={() => void handleAvatarRemove()}
      onCreateInvite={async (email, role) => {
        const token = await createArchiveInvite(session, email, role);
        const link = new URL(import.meta.env.BASE_URL, window.location.origin);
        link.searchParams.set("invite", token);
        await refreshInvites();
        return link.toString();
      }}
      onRevokeInvite={async (inviteId) => {
        await revokeArchiveInvite(inviteId);
        await refreshInvites();
      }}
      onMemberRoleChange={async (userId, role) => {
        await setArchiveMemberRole(session, userId, role);
        await refreshRemote();
      }}
      onLeaveArchive={handleLeaveArchive}
      onPresenceEnabledChange={handlePresenceChange}
      proofreaderEnabled={proofreaderEnabled}
      writingPreferences={writingPreferences}
      onProofreaderEnabledChange={handleProofreaderChange}
      onWritingPreferencesChange={setWritingPreferences}
      /* Straight through the one profile writer: this is a column on the row,
         and Postgres reads it back to decide what the other member may fetch. */
      onHideArchivedChange={(hideArchived) => void persistProfile({ ...profile, hideArchived })}
      onAutoLockChange={handleAutoLockChange}
      onClose={() => setSettingsOpen(false)}
      onLock={handleLock}
    />
  );

  const noteActions = selected ? (
    <>
      <span className="mr-1 flex shrink-0 items-center overflow-hidden">
        {canWriteArchive ? saveReadout : <span className="readout text-ink-4">View only</span>}
      </span>
      {noteReaders}
      <button
        type="button"
        aria-label="Find in note"
        className="toolbar-button press"
        onClick={() => noteEditorRef.current?.openFind()}
      >
        <Search size={16} />
      </button>
      {canWriteArchive && (
        <NoteMenu
          pinned={pinned}
          folders={activeMeta.folders}
          recent={recentNotes}
          onCopyMarkdown={() => void handleCopyMarkdown(selected)}
          onExportMarkdown={() => handleExportMarkdown(selected)}
          onTogglePin={() => handleTogglePin(selected.note.id)}
          onFind={() => noteEditorRef.current?.openFind()}
          onMove={(folderId) => handleMoveNote(selected.note.id, folderId)}
          onRecent={handleOpenRecent}
          onDelete={() => handleMoveToTrash(selected)}
        />
      )}
    </>
  ) : null;

  /* The same items the ⋯ carries, opened where the pointer is. The editor
     hands the click over only when it did not land on the words. */
  const editorMenu =
    selected && editorMenuPoint && canWriteArchive ? (
      <NoteContextMenu
        point={editorMenuPoint}
        onClose={() => setEditorMenuPoint(null)}
        pinned={pinned}
        folders={activeMeta.folders}
        recent={recentNotes}
        onCopyMarkdown={() => void handleCopyMarkdown(selected)}
        onExportMarkdown={() => handleExportMarkdown(selected)}
        onTogglePin={() => handleTogglePin(selected.note.id)}
        onFind={() => noteEditorRef.current?.openFind()}
        onMove={(folderId) => handleMoveNote(selected.note.id, folderId)}
        onRecent={handleOpenRecent}
        onDelete={() => handleMoveToTrash(selected)}
      />
    ) : null;

  /* Always leave a useful writing surface. On narrower desktop windows the
     handles stop before either navigation pane can consume the editor. */
  const editorReserve = 380;
  const sidebarMax = Math.max(
    SIDEBAR_MIN,
    Math.min(SIDEBAR_MAX, window.innerWidth - listWidth - editorReserve - 28),
  );
  const listMax = Math.max(
    LIST_MIN,
    Math.min(LIST_MAX, window.innerWidth - sidebarWidth - editorReserve - 28),
  );

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
                  <div className="flex items-center gap-2">
                    {/* Folders, Trash and the archive switch, one tap away in
                        the same column the desktop keeps open. */}
                    <button
                      type="button"
                      aria-label="Folders"
                      className="toolbar-button press shrink-0"
                      onClick={() => setFoldersOpen(true)}
                    >
                      <FolderTree size={18} />
                    </button>
                    <button
                      type="button"
                      aria-label="Settings"
                      className="toolbar-button press shrink-0"
                      onClick={() => setSettingsOpen(true)}
                    >
                      <SettingsIcon size={18} />
                    </button>
                    <span className="ml-auto flex min-w-0">{archiveSwitch}</span>
                  </div>
                </header>
                <NoteList
                  mobile
                  entries={visible}
                  groups={noteGroups}
                  view="gallery"
                  toolbarActions={collectionActions}
                  filters={activeFilters}
                  meta={activeMeta}
                  selectedId={selectedId}
                  query={query}
                  loading={loading}
                  busy={saving}
                  canWrite={canWriteArchive}
                  folderLabel={folderLabel}
                  trashMode={selectedFolderId === TRASH}
                  archiveMode={selectedFolderId === ARCHIVE}
                  searchRef={searchRef}
                  onQueryChange={setQuery}
                  onSelect={handleSelectNote}
                  onNew={handleNew}
                  onMoveToTrash={handleMoveToTrash}
                  onRestore={handleRestore}
                  onArchiveChange={handleArchiveChange}
                  onDeleteForever={handleDeleteForever}
                  onTogglePin={handleTogglePin}
                  onMoveToFolder={handleMoveNote}
                  onSetPhoto={handleNotePhoto}
                  resolveImage={resolveImage}
                />
              </section>
            )}

            {mobileScreen === "note" && selectedId && (
              <section
                className="mobile-screen flex h-full flex-col"
                style={{ paddingTop: "env(safe-area-inset-top)" }}
              >
                <Suspense fallback={<div className="h-full w-full bg-page" />}>
                  <NoteEditor
                    ref={noteEditorRef}
                    key={selected?.note.id ?? "empty"}
                    mobile
                    entry={selected}
                    syncRevision={syncRevision}
                    canEdit={canEdit}
                    proofreaderEnabled={proofreaderEnabled}
                    viewingAsPartner={viewAs === "u2"}
                    partnerName={partnerName}
                    titleRef={titleRef}
                    onEdited={handleEdited}
                    onNew={handleNew}
                    onImportMarkdown={() => importRef.current?.click()}
                    onUploadImage={handleUploadImage}
                    onUploadFile={handleUploadFile}
                    resolveImage={resolveImage}
                    resolveFile={resolveFile}
                    onUpdatePageProperties={handleUpdatePageProperties}
                    collaboration={
                      (collaborative.ready || collaborative.cached) && collaborative.doc
                        ? {
                            document: collaborative.doc,
                            provider: presenceEnabled ? collaborative.provider : null,
                          }
                        : null
                    }
                    navigationAction={
                      <button
                        type="button"
                        onClick={handleMobileBack}
                        aria-label={`Back to ${folderLabel}`}
                        className="mobile-back press"
                      >
                        <ChevronLeft size={20} />
                        <span className="max-w-28 truncate">{folderLabel}</span>
                      </button>
                    }
                    headerActions={noteActions}
                    synced={collaborative.ready}
                    session={session}
                    commentAuthors={commentAuthors}
                  />
                </Suspense>
              </section>
            )}
          </main>
        </DndContext>
        {foldersOpen && (
          <div className="mobile-nav-layer" role="presentation">
            <button
              type="button"
              aria-label="Close folders"
              className="settings-scrim"
              onClick={() => setFoldersOpen(false)}
            />
            <div className="mobile-nav-drawer">{sidebar}</div>
          </div>
        )}
        {settingsPanel}
        {keyboardSheets}
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
              <div className="pane-frame" style={{ width: sidebarWidth }}>
                {sidebar}
              </div>
              <PaneResizer
                label="Resize folders sidebar"
                value={sidebarWidth}
                min={SIDEBAR_MIN}
                max={sidebarMax}
                defaultValue={SIDEBAR_DEFAULT}
                onChange={setSidebarWidth}
              />
              <div className="pane-frame" style={{ width: listWidth }}>
                <NoteList
                  entries={visible}
                  groups={noteGroups}
                  view="list"
                  toolbarActions={collectionActions}
                  filters={activeFilters}
                  meta={activeMeta}
                  selectedId={selectedId}
                  query={query}
                  loading={loading}
                  busy={saving}
                  canWrite={canWriteArchive}
                  folderLabel={folderLabel}
                  trashMode={selectedFolderId === TRASH}
                  archiveMode={selectedFolderId === ARCHIVE}
                  searchRef={searchRef}
                  onQueryChange={setQuery}
                  onSelect={handleSelectNote}
                  onNew={handleNew}
                  onMoveToTrash={handleMoveToTrash}
                  onRestore={handleRestore}
                  onArchiveChange={handleArchiveChange}
                  onDeleteForever={handleDeleteForever}
                  onTogglePin={handleTogglePin}
                  onMoveToFolder={handleMoveNote}
                  onSetPhoto={handleNotePhoto}
                  resolveImage={resolveImage}
                />
              </div>
              <PaneResizer
                label="Resize notes list"
                value={listWidth}
                min={LIST_MIN}
                max={listMax}
                defaultValue={LIST_DEFAULT}
                onChange={setListWidth}
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
              syncRevision={syncRevision}
              canEdit={canEdit}
              proofreaderEnabled={proofreaderEnabled}
              viewingAsPartner={viewAs === "u2"}
              partnerName={partnerName}
              titleRef={titleRef}
              onEdited={handleEdited}
              onNew={handleNew}
              onImportMarkdown={() => importRef.current?.click()}
              onUploadImage={handleUploadImage}
              onUploadFile={handleUploadFile}
              resolveImage={resolveImage}
              resolveFile={resolveFile}
              onUpdatePageProperties={handleUpdatePageProperties}
              collaboration={
                (collaborative.ready || collaborative.cached) && collaborative.doc
                  ? {
                      document: collaborative.doc,
                      provider: presenceEnabled ? collaborative.provider : null,
                    }
                  : null
              }
              onContextMenu={
                canWriteArchive
                  ? (event) => setEditorMenuPoint({ x: event.clientX, y: event.clientY })
                  : undefined
              }
              navigationAction={
                !navigationOpen ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setNavigationOpen(true)}
                      aria-label="Show the notes list"
                      className="toolbar-button press"
                    >
                      <PanelLeftOpen size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setSettingsOpen(true)}
                      aria-label="Settings"
                      className="toolbar-button press"
                    >
                      <SettingsIcon size={16} />
                    </button>
                  </>
                ) : null
              }
              headerActions={noteActions}
              synced={collaborative.ready}
              session={session}
              commentAuthors={commentAuthors}
            />
          </Suspense>
        </div>

        <DragOverlay dropAnimation={null}>
          {dragEntry ? (
            <div className="drag-chip w-56 px-3 py-2">
              <p className="readout truncate text-ink">{dragEntry.note.title || "Untitled"}</p>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      {settingsPanel}
      {keyboardSheets}
      {editorMenu}
      {/* The editor's attachment menu opens this; a file input is the only way
          a browser lets a page read a file the reader chose. */}
      <input
        ref={importRef}
        type="file"
        accept=".md,.markdown,.txt,text/markdown,text/plain"
        multiple
        className="hidden"
        onChange={(event) => {
          void handleImportFiles(event.target.files);
          event.target.value = "";
        }}
      />
    </div>
  );
}
