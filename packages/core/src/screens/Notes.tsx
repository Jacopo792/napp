import { useNavigate } from "@tanstack/react-router";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import {
  Archive,
  ChevronLeft,
  Columns2,
  FileText,
  Folder,
  FolderDown,
  FolderTree,
  Keyboard,
  Lock,
  Maximize2,
  MessageSquare,
  Minimize2,
  NotebookText,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  SquarePen,
  Trash2,
  X,
  ChevronRight,
  Copy,
  FileDown,
  History,
  Printer,
  Structure,
  Chapters,
  Heading2,
  Layers,
  Pilcrow,
  Footnote,
  Sparkle,
  UserRound,
} from "@/components/icons";
import type { SettingsSection } from "@/components/settingsSections";
import { settingsSectionsFor } from "@/components/settingsSectionsFor";
import { headingsOf, nameMatch, snippetOf } from "@/lib/spotlight";
import {
  OPEN_PLACE,
  openPlace,
  referenceSnapshot,
  setDocumentContents,
  setDocumentReferences,
  type PlaceRequest,
  type PlaceTarget,
} from "@/lib/documentContents";
import {
  EMPTY_TARGETS,
  REFERENCE_WORDS,
  referenceText,
  resolveReference,
  targetKind,
  targetsOf,
  type ChapterTargets,
} from "@/lib/references";
import { ContentsList } from "@/components/ContentsList";
import { loadContributions, loadNamedVersions, type NamedVersion } from "@/lib/history";
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
import { chooseArchive, restoreSession, clearSession, type AppSession } from "@/lib/session";
import {
  createSpace,
  setDocumentFeatures,
  setPageSetup,
  setSpaceKind,
  deleteSpace,
  loadSpaces,
  renameSpace,
  setSpaceSeats,
  findInOtherArchives,
  type Space,
} from "@/lib/spaces";
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
  uploadAvatar,
  uploadImage,
  uploadObject,
  type ArchiveMember,
  type ArchiveSnapshot,
  type PendingInvite,
  type Profile,
} from "@/lib/supabase";
import { acquireAvatarUrl, invalidateAvatarUrl } from "@/lib/avatarCache";
import { subscribeToArchive, subscribeToComments, unsubscribeFromArchive } from "@/lib/sync";
import {
  loadArchiveComments,
  notesWithOpenRemarks,
  unreadRemarks,
  type RemarksSeen,
  type ArchiveComment,
} from "@/lib/comments";
import {
  announceNote,
  subscribeToPresence,
  unsubscribeFromPresence,
  type Presence,
} from "@/lib/presence";
import {
  DEFAULT_FLAGS,
  flagsOf,
  localPreferences,
  heldRemarksSeen,
  mergeRemarksSeen,
  preferencesWith,
  pullAccountPreferences,
  pushAccountPreferences,
  subscribeToAccountPreferences,
  unsubscribeFromAccountPreferences,
  watchLocalStores,
  type AccountFlags,
} from "@/lib/accountPreferences";
import { prepareAvatar, prepareImageForNote, type AvatarCrop } from "@/lib/image";
import { type Meta, type NoteLock, type NoteMeta, type Note, EMPTY_META } from "@/lib/types";
import type { NoteEntry } from "@/lib/entries";
import { fold, formatDateTime, formatStamp } from "@/lib/format";
import { COVER_PRESETS } from "@/lib/pageProperties";
import { derivedOf, indexOf, linkedNoteIds, linksTo } from "@/lib/derived";
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
  exportFileName,
  markdownToNote,
  noteToMarkdown,
  uniqueFileNames,
} from "@/features/editor/lib/exchange";
import { platform } from "@/platform";
import type { Draft } from "@/features/editor/lib/draft";
import { ALL, ARCHIVE, REMARKS, TRASH, UNFILED } from "@/lib/scopes";
import { attachmentType } from "@/features/editor/lib/attachments";
import { PaneResizer } from "@/components/PaneResizer";
import { NoteList, type ActiveFilter } from "@/components/NoteList";
import { forgetStoredImage, useIsCompact, useWindowWidth } from "@/lib/media";
import {
  announceTyping,
  useCollaborationPeers,
  useCollaborativeNote,
  wakeCollaboration,
} from "@/lib/collab";
import { useAutoLock } from "@/lib/autoLock";
import { CollectionMenu, Avatar, NoteContextMenu, NoteMenu } from "@/components/WorkspaceMenus";
/* Lazily, and only once it is opened. Settings is one panel behind one button
   that nobody presses on the way to a note, and it was riding in the same
   chunk as the archive. */
const SettingsPanel = lazy(() =>
  import("@/components/SettingsPanel").then((module) => ({ default: module.SettingsPanel })),
);
import type { MenuPoint } from "@/lib/contextMenu";
import { ContextMenu } from "@/components/ContextMenu";
import { PersonSheet } from "@/components/PersonSheet";
import { SheetStack, type SheetOrigin } from "@/components/Sheet";
import { NoteSheet } from "@/components/NoteSheet";
import { FolderSheet } from "@/components/FolderSheet";
import { ArchiveSheet, NewArchiveSheet } from "@/components/ArchiveSheet";
import { StructurePane, type ChapterItem, type StructureTarget } from "@/components/StructurePane";
import { MenuButton as WritingMenuButton, PageSetupButton } from "@/components/WritingMenus";
import type { MenuItem } from "@/lib/menuShape";
import {
  intoPart,
  moveTo,
  positionBetween,
  splitManuscript,
  structureRows,
  contentsOf,
  topLevel,
} from "@/lib/manuscript";
import {
  DEFAULT_FEATURES,
  DEFAULT_PAGE,
  pageStyle,
  type ArchiveKind,
  type DocumentFeatures,
  type PageSetup,
} from "@/lib/spaceShape";
import { keyName } from "@/lib/shortcuts";
import { SpaceSwitch } from "@/components/SpaceSwitch";

/** One sheet in the stack: what it is about, and where it grew out of. */
type SheetEntry = SheetOrigin &
  (
    | { kind: "note"; noteId: string }
    | { kind: "person"; userId: string }
    | { kind: "folder"; folderId: string }
    | { kind: "archive" }
    | { kind: "new-archive" }
  );

/** A document's Trash, as a menu: each page a section with its two acts,
 *  the second of which destroys and so takes the second press. */
function trashItems(
  trashed: { id: string; title: string }[],
  onRestore: (id: string) => void,
  onDelete: (id: string) => void,
): MenuItem[] {
  if (trashed.length === 0) return [{ kind: "label", label: "The Trash is empty" }];
  return trashed.map((item) => ({
    kind: "item" as const,
    id: `trash-${item.id}`,
    label: item.title || "Untitled",
    icon: <Trash2 size={16} />,
    submenu: [
      {
        kind: "item" as const,
        id: `restore-${item.id}`,
        label: "Put back",
        run: () => onRestore(item.id),
      },
      { kind: "separator" as const },
      {
        kind: "item" as const,
        id: `delete-${item.id}`,
        label: "Delete forever",
        danger: true,
        run: () => onDelete(item.id),
      },
    ],
  }));
}

/** Where a held face is on screen — the portrait in it, when it has one, so
 *  the face that flies into a sheet starts exactly over the face that was
 *  held. */
function faceOrigin(element: Element): SheetOrigin {
  const { x, y, width, height } = (
    element.querySelector(".avatar") ?? element
  ).getBoundingClientRect();
  return { x, y, width, height };
}
import { Sidebar, type Scope } from "@/components/Sidebar";
import { CommandPalette, ShortcutSheet, type Command } from "@/components/CommandPalette";
import { WhatsNewSheet } from "@/components/WhatsNewSheet";
import { WhatsNewButton } from "@/components/WhatsNewButton";
import { CURRENT_RELEASE, compareVersions, laterVersion } from "@/lib/whatsNew";
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

/** A Postgres row write is cheap enough to commit shortly after typing stops. */
const AUTOSAVE_MS = 250;

/* A chapter's targets, read once per projection: the content object is
   replaced whenever the note changes, so it is its own cache key. */
const targetCache = new WeakMap<object, ChapterTargets>();

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
/* What the strip above the column has to hold: 88px of traffic-light gutter on
   macOS, the 70px scope switch, and the two buttons at the end of it, with the
   gaps. Narrower than this and the buttons are underneath the faces. */
const SIDEBAR_MIN = 248;
const SIDEBAR_MAX = 420;
/* How long a press has to be held before it stops being a press and becomes a
   question. Long enough not to fire on a slow tap, short enough that nobody
   wonders whether it is going to. */
const HOLD_MS = 420;
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

/* Enough of a fingerprint to notice that folders or note placement moved,
   without serialising every note's metadata on every realtime wake-up. */
function metaShape(meta: Meta): string {
  let shape = `${meta.partnerName ?? ""}|${meta.folders.length}`;
  for (const folder of meta.folders) shape += `|${folder.id}:${folder.name}`;
  for (const note of meta.notes) {
    shape += `|${note.id}:${note.folderId ?? ""}:${note.pinned ? 1 : 0}:${note.trashedAt ?? ""}:${note.archivedAt ?? ""}`;
  }
  return shape;
}

/* Switching archive is this whole screen starting again on another one, and
   it is done by remounting it rather than by resetting it. Every channel,
   provider, timer and cache below belongs to one archive; a reset would have
   to name each of them and would forget the next one somebody adds. The
   session underneath is the same account, so nobody signs in again.

   A remount is also every entrance the screen has, at once: the list cascading
   in, the plate drawing itself, the switch and the faces missing until their
   rows arrive and then pushing the column down. Played in the open that is
   the window bouncing. So the way across is one motion and nothing else: the
   old screen fades, the new one mounts under `data-arriving` with nothing
   showing, and once it has its archive every entrance is brought to its end
   and the screen fades in already settled. Opacity only, on one layer. */
const SWITCH_OUT = { duration: 140, easing: "cubic-bezier(0.4, 0, 1, 1)" };
const SWITCH_IN = { duration: 200, easing: "cubic-bezier(0.16, 1, 0.3, 1)" };
const shellElement = () =>
  document.querySelector<HTMLElement>(".workspace-shell, .mobile-workspace");
const stillMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Fades the screen out, and resolves even in a window too hidden to animate. */
function leaveScreen(): Promise<void> {
  const shell = shellElement();
  if (!shell || stillMotion()) return Promise.resolve();
  const fade = shell.animate([{ opacity: 1 }, { opacity: 0 }], { ...SWITCH_OUT, fill: "forwards" });
  return Promise.race([
    fade.finished.then(() => undefined),
    new Promise<void>((resolve) => window.setTimeout(resolve, SWITCH_OUT.duration + 100)),
  ]);
}

/** The archives seen last, so a remount draws the switch from its first frame
 *  instead of making room for it when the list comes back. */
let knownSpaces: Space[] = [];
/** A note chosen in ⌘K from another archive: the switch remounts the screen,
 *  so what to open on arrival has to outlive this one. */
let openOnArrival: string | null = null;
/** How many words each document had when this window first opened it — what
 *  "this session" counts from. Kept across remounts, which switching archive
 *  is, so going to another archive and back does not restart the session. */
const sessionStart = new Map<string, number>();
/** The switches as last known, for the same reason: a remount that started
 *  from the defaults would take the archive switch away until the row came
 *  back, and the window would grow it again a moment after arriving. */
let knownFlags: AccountFlags = DEFAULT_FLAGS;
/* What's New opens by itself once per window, not once per archive: an
   archive switch remounts this screen. */
let whatsNewShown = false;
export default function NotesPage() {
  const [opened, setOpened] = useState(0);
  return <ArchiveScreen key={opened} onReopen={() => setOpened((count) => count + 1)} />;
}

function ArchiveScreen({ onReopen }: { onReopen: () => void }) {
  /* Direction contract: an opaque three-pane graphite workspace on desktop;
     a notes-first gallery on phone; neutral emphasis for ordinary interaction;
     translucency belongs only to temporary overlays. */
  const navigate = useNavigate();
  const compact = useIsCompact();
  const windowWidth = useWindowWidth();

  const [session, setSession] = useState<AppSession | null>(null);
  /** The scope on screen, which is a member id. Empty until the session and
   *  the roster have both arrived. */
  const [viewAs, setViewAs] = useState<string>("");
  const [members, setMembers] = useState<ArchiveMember[]>([]);
  /** Seats, and the invitations already holding one. Loaded with Settings
   *  rather than with the archive: nothing outside that panel asks. */
  const [seatLimit, setSeatLimit] = useState(2);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  /** Every archive this account is in, for the switch and its sheet. */
  const [spaces, setSpaces] = useState<Space[]>(knownSpaces);

  const [entries, setEntries] = useState<NoteEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string>(ALL);
  const [query, setQuery] = useState("");

  /** One scope of folders and note placement per member. */
  const [metas, setMetas] = useState<Record<string, Meta>>({});

  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  /** A one-line answer to a command that has no other visible outcome —
   *  "Copied as Markdown", "Imported 12 notes". It borrows the save readout's
   *  slot, which is where this window already says what just happened. */
  const [statusFlash, setStatusFlash] = useState("");
  /** What the last merge did: a word for the readout, a sentence for its
   *  tooltip, because the readout slot holds one state and not a paragraph. */
  const [merge, setMerge] = useState<{ label: string; detail: string } | null>(null);
  /** Raised only when a pull replaces the open draft, so the editor knows the
   *  new text is not its own and may be applied under the caret. */
  const [syncRevision, setSyncRevision] = useState(0);
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
  const [settingsSection, setSettingsSection] = useState<SettingsSection>();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  /* Named versions, for ⌘K: read when the palette opens, because a name is
     given rarely and the list is a request the archive's own load does not make. */
  const [namedVersions, setNamedVersions] = useState<NamedVersion[]>([]);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
  /* Focus is the two panes put away and the page's own controls stepping back
     while you write. It is not a third layout: the workspace already knows how
     to run without the rail and the list, so this is that state plus a way in
     that is not a small button in a corner, plus a class the stylesheet reads. */
  const [focusMode, setFocusMode] = useState(false);
  /* The second note, read beside the first. A note id and nothing else: the
     editor is already a component that takes an entry, and the collaboration
     hook is already a hook that takes a note id — two of each is the whole
     feature, on the one socket `collab.ts` holds for the session. */
  const [splitId, setSplitId] = useState<string | null>(null);
  /* Raised by a keystroke and lowered by the pointer. Deliberately not the
     presence `typing` flag: that one needs a channel, and presence is off by
     default — the page's own chrome must not depend on a socket to get out of
     the way. */
  const [quiet, setQuiet] = useState(false);
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
  /* The four switches that are the account's rather than this browser's, held
     together because they travel together: they are pulled from the profile
     row on sign-in, pushed back when any of them moves, and re-applied when
     the other browser moves one. `writingPreferences`, the appearance and the
     axes ride along in `accountPreferences.ts`, which watches their stores. */
  const [flags, setFlags] = useState<AccountFlags>(knownFlags);
  useEffect(() => {
    knownFlags = flags;
  }, [flags]);
  /* Which conversations this account has read, note by note. Held here beside
     the flags because it travels in the same blob and is pushed by the same
     effect; the archive-wide reading of it is further down. */
  const [remarksSeen, setRemarksSeen] = useState<RemarksSeen>({});

  /* This device's copy, for the first paint. The account's row lands on top of
     it a moment later, in the preferences effect below. */
  useEffect(() => {
    setRemarksSeen(session ? heldRemarksSeen(session.userId) : {});
  }, [session]);
  const writingPreferences = useWritingPreferences();
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [present, setPresent] = useState<Presence>(() => new Map());
  const onlineMemberIds = useMemo(() => new Set(present.keys()), [present]);
  const [scopeDirection, setScopeDirection] = useState<"next" | "previous" | null>(null);
  const presenceChannelRef = useRef<RealtimeChannel | null>(null);
  const typingOffRef = useRef<number | undefined>(undefined);
  const typingRef = useRef(false);
  /** Where a right-click landed on the note page, if one has. */
  const [editorMenuPoint, setEditorMenuPoint] = useState<MenuPoint | null>(null);
  /** The sheets that are up, the last on top, each with where the thing it
   *  grew out of was. A name in a sheet pushes another; Back pops it. */
  const [sheets, setSheets] = useState<SheetEntry[]>([]);
  const openSheet = (entry: SheetEntry) => setSheets([entry]);
  const pushSheet = (entry: SheetEntry) => setSheets((stack) => [...stack, entry]);
  /* A note opened from somebody's work opens with its history beside it —
     once the editor for it exists, which is a render after it was chosen. */
  const [openThen, setOpenThen] = useState<{
    noteId: string;
    history?: string | true;
    comments?: boolean;
    /** Words to go to once the note is open — a heading or a line ⌘K found —
     *  or a footnote, a caption, a cited heading. */
    reveal?: string | PlaceTarget;
  } | null>(null);

  /* A hold, and the two refs it needs. The timer is one, because it has to be
     cancelled by a hand that moved away; and whether it fired is the other,
     because the press that ends a hold is still a press and would throw the
     switch on its way out. */
  const holdRef = useRef<number | undefined>(undefined);
  const heldRef = useRef(false);

  function holdStart(event: React.PointerEvent, userId: string) {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    const face = event.currentTarget;
    heldRef.current = false;
    window.clearTimeout(holdRef.current);
    holdRef.current = window.setTimeout(() => {
      heldRef.current = true;
      openSheet({ ...faceOrigin(face), kind: "person", userId });
    }, HOLD_MS);
  }

  function holdEnd() {
    window.clearTimeout(holdRef.current);
  }

  useEffect(() => () => window.clearTimeout(holdRef.current), []);

  /** The phone has no room for a permanent sidebar, so it gets the same one
   *  as a drawer — the destinations are identical, only the staging differs. */
  const [foldersOpen, setFoldersOpen] = useState(false);
  const [mobileScreen, setMobileScreen] = useState<"collection" | "note">("collection");
  const [listPreferences, setListPreferences] = useState<Record<string, ListPreferencesV1>>({});
  /** Minutes of inactivity before the archive locks itself; 0 is never. */
  const autoLock = flags.autoLock;
  const proofreaderEnabled = flags.proofreader;
  const autocorrectEnabled = flags.autocorrect;

  /* Uploaded this session, so the tab that just attached a file knows its type
     without a round trip. Anything else opens as the PDF it almost always is. */
  const fileTypes = useRef(new Map<string, string>());
  const searchRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const splitTitleRef = useRef<HTMLTextAreaElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const noteEditorRef = useRef<NoteEditorHandle>(null);
  useEffect(() => {
    if (!openThen || selectedId !== openThen.noteId) return;
    /* The editor is a lazy chunk, so on the first note of a visit it is not
       there yet a frame after the choice: wait for it, for a couple of
       seconds at most, rather than dropping what was asked for. */
    let frame = 0;
    let tries = 0;
    const run = () => {
      const editor = noteEditorRef.current;
      if (!editor && tries++ < 120) {
        frame = requestAnimationFrame(run);
        return;
      }
      if (openThen.history)
        editor?.openHistory(openThen.history === true ? undefined : openThen.history);
      else if (openThen.comments) editor?.openComments();
      else if (openThen.reveal) editor?.reveal(openThen.reveal);
      setOpenThen(null);
    };
    frame = requestAnimationFrame(run);
    return () => cancelAnimationFrame(frame);
  }, [openThen, selectedId]);

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
  const collaborative = useCollaborativeNote(selectedId, collaborationIdentity);
  /* Awareness is per document, so the second note announces you on the second
     note and nowhere else. It used to be told not to announce at all, back when
     presence was one archive-wide channel carrying a single `noteId` that two
     open editors would have spent the session arguing over. */
  const splitCollaborative = useCollaborativeNote(splitId, collaborationIdentity);
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
    if (!session) return;
    for (const preferences of Object.values(listPreferences))
      saveListPreferences(session.archiveId, preferences);
  }, [listPreferences, session]);

  /* Preferences are per member and stored locally, so they are read as the
     roster arrives rather than at mount, when nobody is known yet. */
  useEffect(() => {
    if (members.length === 0 || !session) return;
    const archiveId = session.archiveId;
    setListPreferences((current) => {
      const next = { ...current };
      let changed = false;
      for (const member of members) {
        if (!next[member.userId]) {
          next[member.userId] = loadListPreferences(archiveId, member.userId);
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [members, session]);

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

  // ── Bootstrap ───────────────────────────────────────────────────────────
  useEffect(() => {
    let active = true;
    void restoreSession()
      .then((s) => {
        if (!active) return;
        if (!s) {
          navigate({ to: "/" });
          return;
        }
        setSession(s);
        setViewAs(s.userId);
      })
      .catch(() => {
        if (active) void navigate({ to: "/", replace: true });
      });
    return () => {
      active = false;
    };
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

  /* Realtime says a row moved; this reads a coherent snapshot back. Two things
     have to be true of it and only one was.

     **A burst is one read.** Somebody typing produces a save about once a
     second, each one an announcement, and each announcement was a whole
     snapshot — six queries for a change to one note. They arrive together, so
     they are answered together, the way `refreshRemarks` already does it.

     **And an announcement that lands mid-read is not lost.** Events arriving
     while a snapshot was in flight were dropped on the floor: the read that was
     already running had asked the database *before* that change, so the last
     word of a burst could sit unread until something else happened to move.
     A dropped event is now a repeat, once, when the read that dropped it
     finishes. */
  const refreshTimer = useRef(0);
  const refreshAgainRef = useRef(false);
  const readSnapshot = useCallback(async () => {
    const s = sessionRef.current;
    if (!s || !readyRef.current) return;
    if (syncingRef.current) {
      refreshAgainRef.current = true;
      return;
    }
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
      if (refreshAgainRef.current) {
        refreshAgainRef.current = false;
        void readSnapshot();
      }
    }
  }, [applySnapshot]);

  const refreshRemote = useCallback(() => {
    window.clearTimeout(refreshTimer.current);
    refreshTimer.current = window.setTimeout(() => void readSnapshot(), 250);
  }, [readSnapshot]);

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

  /* ── Coming back ─────────────────────────────────────────────────────────
     A tab is reloaded a dozen times a day and a desktop window is not: it is
     opened once and left open for a week, through a closed lid, a changed
     network and a hotel wifi. A Realtime socket does not survive all of that,
     and the way it fails is the worst kind — the channel is gone, nothing
     throws, and the list simply stops hearing that rows have changed. An edit
     made in the window landed in Postgres with the right stamp on it and the
     list beside it went on saying what it said yesterday, which reads exactly
     like the save not working.

     So the window is asked to notice it has come back. Three signals, because
     no one of them covers the three ways of leaving:

     - `visibilitychange`, for a window that was hidden or a tab in the
       background.
     - `online`, for the network returning.
     - **A clock that jumped**, which is the only one that catches a laptop
       whose lid was shut: the display slept, the window stayed "visible" the
       whole time, and nothing else fires. A tick that arrives long after it was
       due is a machine that was asleep between the two.

     Both halves matter on a wake: the snapshot is read again, because whatever
     happened while we were away was never announced, and the channel is rebuilt,
     because the one we had may be listening to nothing. */
  const [awake, setAwake] = useState(0);
  useEffect(() => {
    const wake = () => setAwake((count) => count + 1);
    const onVisible = () => document.visibilityState === "visible" && wake();
    const BEAT = 30_000;
    let last = Date.now();
    const beat = window.setInterval(() => {
      const now = Date.now();
      const slept = now - last > BEAT * 3;
      last = now;
      if (slept) wake();
    }, BEAT);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", wake);
    return () => {
      window.clearInterval(beat);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", wake);
    };
  }, []);

  // ── Realtime subscriptions ──────────────────────────────────────────────
  useEffect(() => {
    if (!session) return;
    /* At once rather than through the debounce: nothing is arriving in a burst
       here, this is the window asking what it missed. A no-op on the first run,
       because `readSnapshot` stands down until the initial load has landed and
       the initial load is the effect above this one. */
    void readSnapshot();
    /* And the note's own socket, which fails the same way for the same reason
       and is not rebuilt by anything else: it is one socket for the session, so
       nothing remounts it when a note is opened. A no-op unless it is stalled. */
    wakeCollaboration();
    const channel = subscribeToArchive(session.archiveId, () => void refreshRemote());
    return () => void unsubscribeFromArchive(channel);
  }, [session, refreshRemote, readSnapshot, awake]);

  /* The account's preferences, in three moves: read the row over whatever this
     browser had, follow the row while another browser is open on it, and push
     whatever moves here back up. `pullAccountPreferences` applies the
     appearance, the axes and the writing palette itself — they live in stores
     of their own — and hands back the four flags this component holds. */
  useEffect(() => {
    if (!session) return;
    let live = true;
    void pullAccountPreferences(session)
      .catch(() => localPreferences())
      .then((preferences) => {
        if (!live) return;
        setFlags(flagsOf(preferences));
        setRemarksSeen((current) => mergeRemarksSeen(current, preferences.remarksSeen));
        setPreferencesReady(true);
      });
    const channel = subscribeToAccountPreferences(session, (preferences) => {
      if (!live) return;
      setFlags(flagsOf(preferences));
      setRemarksSeen((current) => mergeRemarksSeen(current, preferences.remarksSeen));
    });
    return () => {
      live = false;
      setPreferencesReady(false);
      void unsubscribeFromAccountPreferences(channel);
    };
  }, [session]);

  /* Anything that moves — a slider dragged in Settings, a switch here — is one
     debounced write of the whole blob. Held back until the pull has landed, or
     the first render would push this browser's stale copy over the row it is
     about to read. */
  useEffect(() => {
    if (!session || !preferencesReady) return;
    const push = () => pushAccountPreferences(session, preferencesWith(flags, remarksSeen));
    push();
    return watchLocalStores(push);
  }, [session, preferencesReady, flags, remarksSeen]);

  useEffect(() => {
    if (!session || !preferencesReady || !flags.presence) {
      setPresent(new Map());
      return;
    }
    const channel = subscribeToPresence(session, setPresent, () => selectedIdRef.current);
    presenceChannelRef.current = channel;
    return () => {
      presenceChannelRef.current = null;
      void unsubscribeFromPresence(channel);
    };
  }, [session, preferencesReady, flags.presence]);

  /* Which note this tab has open, for the other member's list. Only once the
     channel is up: the first announcement is made by the subscription itself. */
  useEffect(() => {
    const channel = presenceChannelRef.current;
    if (channel && session) void announceNote(channel, session, selectedId).catch(() => {});
  }, [selectedId, session]);

  /* Writing is a fact about the note, so it is announced on the note's own
     document rather than on the archive's presence channel — the same place
     the face beside the title comes from, which is what stops the two
     disagreeing. Changing note lowers the flag first, so it can never be left
     raised on a page nobody is on. */
  const typingProvider = collaborative.provider;
  useEffect(() => {
    window.clearTimeout(typingOffRef.current);
    typingRef.current = false;
    return () => {
      window.clearTimeout(typingOffRef.current);
      typingRef.current = false;
      announceTyping(typingProvider, false);
    };
  }, [typingProvider]);

  /* One announcement when the burst starts and one when it ends, rather than a
     packet per keystroke. TYPING_IDLE_MS is how long a pause has to be before
     the other person is told you stopped. */
  const markTyping = useCallback(() => {
    if (!typingProvider) return;
    window.clearTimeout(typingOffRef.current);
    if (!typingRef.current) {
      typingRef.current = true;
      announceTyping(typingProvider, true);
    }
    typingOffRef.current = window.setTimeout(() => {
      typingRef.current = false;
      announceTyping(typingProvider, false);
    }, TYPING_IDLE_MS);
  }, [typingProvider]);

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

  const selfId = session?.userId ?? null;

  /* Remarks, archive-wide. The panel beside a note answers "what was said
     about this"; this answers the question a shared archive raises the moment
     you sign in — has the other member said anything, anywhere, since you last
     looked.

     The line is a timestamp per note, held in this browser rather than in a
     column, and deliberately: it is a fact about a device looking, not about
     the archive, and a set of read ids is a thing nobody ever finishes
     pruning. A new device therefore starts with everything unread, which is
     the right answer for it. Per note rather than archive-wide because opening
     a note is the act of having read what was said on it — one line for the
     whole archive could only be moved by looking at the list, which left the
     dot up after you had read the one remark under it. */
  const [archiveComments, setArchiveComments] = useState<ArchiveComment[]>([]);
  /* Reading a note is having read its remarks. Written to the account, not to
     this browser: it is a thing the person did, and a badge that says "unread"
     for every conversation already read on the other device is a badge nobody
     can clear. The push effect below carries it up. */
  const markRemarksSeen = useCallback((noteId: string) => {
    setRemarksSeen((current) => ({ ...current, [noteId]: new Date().toISOString() }));
  }, []);

  /* One read per burst, not one per row. Realtime announces every insert,
     update and delete on `note_comments` separately, and a resolved thread of
     six remarks is six announcements — each one re-reading every comment in
     the archive. They arrive together, so they are answered together. */
  const remarkTimer = useRef(0);
  const refreshRemarks = useCallback(() => {
    window.clearTimeout(remarkTimer.current);
    remarkTimer.current = window.setTimeout(() => {
      const current = sessionRef.current;
      if (!current) return;
      void loadArchiveComments(current)
        .then(setArchiveComments)
        /* A remark that will not load is not a reason to fail to open the
           archive: the count simply stays where it was. */
        .catch(() => undefined);
    }, 400);
  }, []);

  useEffect(() => () => window.clearTimeout(remarkTimer.current), []);

  useEffect(() => {
    if (!session) return;
    refreshRemarks();
    const channel = subscribeToComments(session.archiveId, refreshRemarks);
    return () => void unsubscribeFromArchive(channel);
    /* `awake` for the same reason the archive channel takes it: a socket that
       died while the machine slept announces nothing, and this one carries the
       badge. */
  }, [session, refreshRemarks, awake]);

  const remarkedIds = useMemo(() => notesWithOpenRemarks(archiveComments), [archiveComments]);
  const unreadRemarkNotes = useMemo(
    () =>
      new Set(
        selfId
          ? unreadRemarks(archiveComments, selfId, remarksSeen).map((remark) => remark.noteId)
          : [],
      ),
    [archiveComments, selfId, remarksSeen],
  );
  const unreadRemarkCount = useMemo(
    () => (selfId ? unreadRemarks(archiveComments, selfId, remarksSeen).length : 0),
    [archiveComments, selfId, remarksSeen],
  );

  /* The number on the icon in the Dock, which is the whole of what an
     application can say to somebody who is not looking at it.
     `navigator.setAppBadge` and not a bridge to `app.dock.setBadge`: it is a
     standard the browser has too, Electron implements it and puts it on the
     Dock, and a member on `platform.ts` for it would have been an interface
     describing a habit. Absent in a plain tab, where it simply does nothing. */
  useEffect(() => {
    const badge = navigator as Navigator & {
      setAppBadge?: (count?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (!badge.setAppBadge || !badge.clearAppBadge) return;
    void (
      unreadRemarkCount > 0 ? badge.setAppBadge(unreadRemarkCount) : badge.clearAppBadge()
    ).catch(() => undefined);
  }, [unreadRemarkCount]);

  /* Who has taken a note back, keyed by note. A lock is metadata on the row
     like the trash stamp beside it, and it is read from the same place — but
     unlike `owner_id` it is a permission, and `notes_editor_update` refuses
     the row to everybody it does not name. */
  const lockHolders = useMemo(
    () =>
      new Map(
        activeMeta.notes
          .filter((note) => note.lockedBy)
          .map((note) => [note.id, note.lockedBy as string]),
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
    } else if (selectedFolderId === REMARKS) {
      /* Not the trash: a note on its way out is nobody's to discuss. */
      list = list.filter(
        (entry) => remarkedIds.has(entry.note.id) && !trashedIds.has(entry.note.id),
      );
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

    /* Folded, like the haystack it is looked for in. */
    const q = fold(query.trim());
    if (q) {
      list = list.filter((e) => derivedOf(e.note).haystack.includes(q));
    }

    return list;
  }, [ownedEntries, activeMeta, trashedIds, archivedIds, remarkedIds, selectedFolderId, query]);

  const noteGroups = useMemo(() => {
    const pinnedIds = new Set(
      activeMeta.notes.filter((note) => note.pinned).map((note) => note.id),
    );
    return groupEntries(visible, pinnedIds, activeListPreferences);
  }, [visible, activeMeta.notes, activeListPreferences]);
  const orderedVisible = useMemo(() => noteGroups.flatMap((group) => group.entries), [noteGroups]);

  /* ── A document ──────────────────────────────────────────────────────────
     The same notes, read as one piece of writing: chapters in the order
     `position` gives them, parts over stretches of it, and a notebook of
     everything not placed. A shared manuscript lives in the scope of the
     archive's first member, so the structure is one for everybody and the
     switch beside the faces chooses whose notebook is open. Nothing here
     changes what a notes archive reads or writes. */
  const currentSpace = spaces.find((space) => space.archiveId === session?.archiveId);
  const docMode = currentSpace?.kind === "document";
  const docFeatures = currentSpace?.features ?? DEFAULT_FEATURES;
  const manuscriptOwner =
    docMode && docFeatures.manuscript === "shared" ? (members[0]?.userId ?? viewAs) : viewAs;

  const manuscript = useMemo(() => {
    if (!docMode) return null;
    const metaOf = (owner: string) => metas[owner] ?? EMPTY_META;
    const itemsOf = (owner: string): ChapterItem[] => {
      const meta = metaOf(owner);
      const byNote = new Map(meta.notes.map((note) => [note.id, note]));
      const parts = new Set(meta.folders.map((folder) => folder.id));
      return entries.flatMap((entry) => {
        if (entry.note.ownerId !== owner) return [];
        const row = byNote.get(entry.note.id);
        if (row?.trashedAt || row?.archivedAt) return [];
        return [
          {
            id: entry.note.id,
            title: entry.note.title,
            words: derivedOf(entry.note).words,
            folderId: row?.folderId && parts.has(row.folderId) ? row.folderId : null,
            position: row?.position ?? null,
            movable: owner === manuscriptOwner,
          },
        ];
      });
    };
    const own = splitManuscript(itemsOf(manuscriptOwner));
    const notebook =
      manuscriptOwner === viewAs ? own.notebook : splitManuscript(itemsOf(viewAs)).notebook;
    const folders = metaOf(manuscriptOwner).folders.filter((folder) => !folder.parentId);
    return {
      chapters: own.chapters,
      notebook,
      rows: structureRows(
        own.chapters,
        folders.map((folder) => folder.id),
      ),
      parts: new Map(folders.map((folder) => [folder.id, folder.name])),
      total: own.chapters.reduce((sum, item) => sum + item.words, 0),
    };
  }, [docMode, metas, entries, manuscriptOwner, viewAs]);

  /* The table of contents, from the same rows the structure draws, with each
     chapter's headings read out of its document. Handed to the `[TOC]` block
     through `documentContents.ts`, because the block is drawn inside the
     editor where nothing from here reaches it as a prop. */
  const contents = useMemo(() => {
    if (!manuscript) return [];
    const byId = new Map(entries.map((entry) => [entry.note.id, entry.note]));
    return contentsOf(
      manuscript.rows,
      manuscript.parts,
      (id) => headingsOf(byId.get(id)?.content),
      docFeatures.numbering,
    );
  }, [manuscript, entries, docFeatures.numbering]);
  useEffect(() => setDocumentContents(contents), [contents]);

  /* Every chapter's footnotes, captions and cited headings, from the same
     projections, in the structure's order — what a cross-reference's words,
     a sheet's first footnote number and the picker are counted from. The
     notebook is there too, counted on its own, so a page of it can cite
     and be cited like a chapter. */
  const referenceChapters = useMemo(() => {
    if (!manuscript) return [];
    const byId = new Map(entries.map((entry) => [entry.note.id, entry.note]));
    const read = (id: string): ChapterTargets => {
      const content = byId.get(id)?.content;
      if (!content || typeof content !== "object") return EMPTY_TARGETS;
      let found = targetCache.get(content);
      if (!found) targetCache.set(content, (found = targetsOf(content)));
      return found;
    };
    return [
      ...manuscript.chapters.map((item, index) => ({
        id: item.id,
        title: item.title,
        number: index + 1,
        targets: read(item.id),
      })),
      ...manuscript.notebook.map((item) => ({
        id: item.id,
        title: item.title,
        number: null,
        targets: read(item.id),
      })),
    ];
  }, [manuscript, entries]);
  const page = currentSpace?.page ?? DEFAULT_PAGE;
  useEffect(
    () =>
      setDocumentReferences(referenceChapters, {
        numbered: docFeatures.numbering,
        footnotes: page.footnoteNumbering,
        language: page.labels,
      }),
    [referenceChapters, docFeatures.numbering, page.footnoteNumbering, page.labels],
  );

  /* Words today: yours, from the versions the server writes after each
     stretch of writing, so it counts what was written on any device — and
     runs up to ten minutes behind, which is how often a stretch is closed.
     ponytail: a version two people wrote in counts whole for each of them. */
  const [wordsToday, setWordsToday] = useState<number | null>(null);
  const statsShown = docMode && writingPreferences.writingStats;
  useEffect(() => {
    if (!statsShown || !session) return;
    let current = true;
    const read = () =>
      loadContributions(session, session.userId)
        .then((rows) => {
          const midnight = new Date().setHours(0, 0, 0, 0);
          const today = rows
            .filter((row) => Date.parse(row.createdAt) >= midnight)
            .reduce((sum, row) => sum + (row.wordsAdded ?? 0), 0);
          if (current) setWordsToday(today);
        })
        .catch(() => undefined);
    void read();
    const timer = window.setInterval(read, 5 * 60_000);
    return () => {
      current = false;
      window.clearInterval(timer);
    };
  }, [statsShown, session]);
  useEffect(() => {
    if (manuscript && session && !loading && !sessionStart.has(session.archiveId))
      sessionStart.set(session.archiveId, manuscript.total);
  }, [manuscript, session, loading]);

  /* Trashed notes of either scope the document reads, for its own Trash. */
  const docTrash = useMemo(() => {
    if (!docMode) return [];
    const owners = new Set([manuscriptOwner, viewAs]);
    return entries.filter((entry) => {
      if (!owners.has(entry.note.ownerId ?? "")) return false;
      const row = (metas[entry.note.ownerId ?? ""] ?? EMPTY_META).notes.find(
        (note) => note.id === entry.note.id,
      );
      return Boolean(row?.trashedAt);
    });
  }, [docMode, entries, metas, manuscriptOwner, viewAs]);

  const docSelected =
    docMode && selectedId && !docTrash.some((entry) => entry.note.id === selectedId)
      ? (entries.find((entry) => entry.note.id === selectedId) ?? null)
      : null;

  const selected = docMode ? docSelected : (visible.find((e) => e.note.id === selectedId) ?? null);

  /* The window is named after what is open in it. A Mac window's title is not
     decoration — it is what Mission Control, the Window menu and ⌘Tab's preview
     have to go on, and a row of windows all called "Napp" is a row of windows
     you have to open to tell apart. Free in the browser too, where it is the
     tab's name. */
  useEffect(() => {
    const name = selected?.note.title.trim();
    document.title = name ? `${name} — Napp` : "Napp";
  }, [selected]);

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
  const lockHolder = selected
    ? docMode
      ? ((metas[selected.note.ownerId ?? ""] ?? EMPTY_META).notes.find(
          (note) => note.id === selected.note.id,
        )?.lockedBy ?? null)
      : (lockHolders.get(selected.note.id) ?? null)
    : null;
  const canEdit = selected
    ? selectedFolderId !== TRASH &&
      canWriteArchive &&
      (lockHolder === null || lockHolder === selfId)
    : false;

  const folderLabel =
    selectedFolderId === ALL
      ? "All notes"
      : selectedFolderId === UNFILED
        ? "Unfiled"
        : selectedFolderId === REMARKS
          ? "Remarks"
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
    const entry = await createNote(s, note, { id: note.id, folderId: null });
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
    setQuiet(true);
  }, [schedule, markTyping]);

  /** The same, from the second pane, minus the announcement.
   *
   *  The writing flag lives on a *document*, and the document this page
   *  announces on is the one in the primary column — so typing in the note
   *  beside it was telling the other member you were writing in a note you had
   *  not touched. Being in the second note is still visible to her: awareness
   *  identity is published for both documents, so she sees you on the note you
   *  are actually in. It is only the flag that stops at the first pane. */
  const handleSplitEdited = useCallback(() => {
    schedule();
    setQuiet(true);
  }, [schedule]);

  /* The pointer brings the controls back — not a timer. A writer who has
     stopped typing has not necessarily stopped reading, and a toolbar that
     reappears on its own two seconds after the last keystroke arrives in the
     middle of a sentence rather than when it is wanted. */
  useEffect(() => {
    if (!quiet) return;
    const wake = () => setQuiet(false);
    window.addEventListener("pointermove", wake, { once: true });
    window.addEventListener("pointerdown", wake, { once: true });
    return () => {
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("pointerdown", wake);
    };
  }, [quiet]);

  /* Focus puts the two panes away and gives them back on the way out — the
     rail's own open state is remembered across the trip, because whether you
     had it open is a different question from whether you are focusing. */
  const restoreNavigation = useRef(true);
  /* The slide is a view transition: the new layout is worked out once, and
     what travels for the next 360ms is two pictures of it on the compositor.
     It was a transition on the slot's `width`, which re-laid the whole note —
     and re-ran its container queries — on every frame of the way, and could
     not leave the width alone while `PaneResizer` was dragging it either.
     `also` is for a change that has to land in the same frame, so the
     picture taken after it is the finished one. */
  const changeNavigation = useCallback(
    (next: boolean | ((current: boolean) => boolean), also?: () => void) => {
      const apply = () =>
        flushSync(() => {
          setNavigationOpen(next);
          also?.();
        });
      if (
        !document.startViewTransition ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        apply();
        return;
      }
      const root = document.documentElement;
      root.classList.add("is-sliding-navigation");
      document
        .startViewTransition(apply)
        .finished.finally(() => root.classList.remove("is-sliding-navigation"));
    },
    [],
  );

  const toggleFocus = useCallback(() => {
    if (focusMode) {
      changeNavigation(restoreNavigation.current, () => setFocusMode(false));
      return;
    }
    restoreNavigation.current = navigationOpen;
    changeNavigation(false, () => setFocusMode(true));
  }, [focusMode, navigationOpen, changeNavigation]);

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
      const normalizedType = file.type || attachmentType(file.name);
      // Supabase storage validates against the bucket's allowlist, which is
      // extension-based; a browser that reports `video/mov` or an empty string
      // would otherwise be rejected even though the file is a supported MOV.
      const toUpload =
        normalizedType !== file.type ? new File([file], file.name, { type: normalizedType }) : file;
      await uploadObject(current, objectId, toUpload);
      fileTypes.current.set(objectId, normalizedType);
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

  /* One owner's metadata. A note's list writes the scope on screen; a
     shared manuscript writes its owner's scope from whichever scope is on
     screen, which is why the owner is a parameter and not `viewAs`. */
  const handleMetaChangeFor = useCallback(
    (owner: string, next: Meta | ((prev: Meta) => Meta)) => {
      if (!canWriteArchive) return;
      const pending = pendingMetaRef.current.get(owner);
      const base = pending?.after ?? metasRef.current[owner] ?? EMPTY_META;
      const proposed = typeof next === "function" ? (next as (prev: Meta) => Meta)(base) : next;
      /* A note somebody else has locked keeps the metadata it had. Every
         per-note change in this page — pinning, filing, trashing, shelving —
         is one call to this function, so the lock is honoured once here
         rather than in each of them. Postgres refuses the write either way;
         what this saves is a list that shows a move the archive rejected. */
      const held = new Map(
        base.notes
          .filter((note) => note.lockedBy && note.lockedBy !== selfId)
          .map((note) => [note.id, note]),
      );
      const m: Meta =
        held.size === 0
          ? proposed
          : {
              ...proposed,
              notes: [
                ...proposed.notes.map((note) => held.get(note.id) ?? note),
                ...[...held.values()].filter(
                  (note) => !proposed.notes.some((kept) => kept.id === note.id),
                ),
              ],
            };
      pendingMetaRef.current.set(owner, {
        before: pending?.before ?? base,
        after: m,
      });
      setMetas((current) => ({ ...current, [owner]: m }));
      schedule();
    },
    [schedule, canWriteArchive, selfId],
  );

  const handleMetaChange = useCallback(
    (next: Meta | ((prev: Meta) => Meta)) => handleMetaChangeFor(viewAs, next),
    [handleMetaChangeFor, viewAs],
  );

  const handleTogglePin = useCallback(
    (noteId: string) => {
      handleMetaChange((prev) => {
        const existing = indexOf(prev).byNote.get(noteId);
        const notes: NoteMeta[] = existing
          ? prev.notes.map((note) =>
              note.id === noteId ? { ...note, pinned: !note.pinned } : note,
            )
          : [...prev.notes, { id: noteId, folderId: null, pinned: true }];
        return { ...prev, notes };
      });
    },
    [handleMetaChange],
  );

  /* Locking names one account on the row; unlocking clears it. Nobody can do
     either on somebody else's lock — `handleMetaChange` above puts the row
     back, and `notes_editor_update` refuses it regardless. */
  const handleToggleLock = useCallback(
    (noteId: string) => {
      handleMetaChange((prev) => {
        const existing = indexOf(prev).byNote.get(noteId);
        const lockedBy = existing?.lockedBy === selfId ? undefined : (selfId ?? undefined);
        const notes: NoteMeta[] = existing
          ? prev.notes.map((note) => (note.id === noteId ? { ...note, lockedBy } : note))
          : [...prev.notes, { id: noteId, folderId: null, lockedBy }];
        return { ...prev, notes };
      });
    },
    [handleMetaChange, selfId],
  );

  /* What the menus and the editor header say about one note's lock. Trash is
     left out because a note on its way out is already nobody's to write, and
     a second answer to that question would only be a second thing to keep
     agreeing with the first. */
  /* The pane beside holds a different note, so it gets a different answer.
     It used to be handed the selected note's, which was harmless while the
     only thing that answer knew was the archive — and stops being harmless
     the moment one note can be locked and the one beside it not. */
  const splitCanEdit = useCallback(
    (noteId: string) => {
      const holder = lockHolders.get(noteId) ?? null;
      return (
        canWriteArchive && selectedFolderId !== TRASH && (holder === null || holder === selfId)
      );
    },
    [canWriteArchive, selectedFolderId, lockHolders, selfId],
  );

  const lockFor = useCallback(
    (noteId: string): NoteLock | undefined => {
      if (!canWriteArchive || selectedFolderId === TRASH) return undefined;
      const holder = lockHolders.get(noteId) ?? null;
      const mine = holder !== null && holder === selfId;
      return {
        holderName: holder
          ? (members.find((member) => member.userId === holder)?.nickname ?? "the other member")
          : "",
        mine,
        onToggle: () => handleToggleLock(noteId),
      };
    },
    [canWriteArchive, selectedFolderId, lockHolders, selfId, members, handleToggleLock],
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
        setError("The browser would not give this page the clipboard");
      }
    },
    [markdownFor],
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

      const metadata: NoteMeta = { id: note.id, folderId };
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
          : [...prev.notes, { id: entry.note.id, folderId: null, archivedAt }];
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

  /* Trash is a waiting room, not a cupboard. A note that has been in it for a
     month is a note nobody came back for, and an archive whose Trash is only
     ever emptied by hand is an archive that never empties it. Thirty days is
     what the Trash itself says under its own name.

     Once a session, and only in your own scope: the other member's browser
     keeps their side, and two clients racing to delete the same rows is a
     second delete that finds nothing. */
  const swept = useRef(false);
  useEffect(() => {
    if (!session || loading || !canWriteArchive || swept.current) return;
    if (viewAs !== session.userId) return;
    const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const stale = new Set(
      activeMeta.notes
        .filter((note) => note.trashedAt && note.trashedAt < cutoff)
        .map((note) => note.id),
    );
    if (stale.size === 0) return;
    swept.current = true;
    void deleteForever(entriesRef.current.filter((entry) => stale.has(entry.note.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMeta, canWriteArchive, loading, session, viewAs]);

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
  const selectAt = useCallback(
    (id: string) => {
      setSelectedId(id);
      markRemarksSeen(id);
      setListPreferences((current) => ({
        ...current,
        [viewAs]: rememberRecent(current[viewAs] ?? createListPreferences(viewAs), id),
      }));
    },
    [markRemarksSeen, viewAs],
  );

  const moveSelection = useCallback(
    (delta: number) => {
      if (orderedVisible.length === 0) return;
      const i = orderedVisible.findIndex((e) => e.note.id === selectedId);
      const next = i === -1 ? 0 : Math.min(orderedVisible.length - 1, Math.max(0, i + delta));
      selectAt(orderedVisible[next].note.id);
    },
    [orderedVisible, selectedId, selectAt],
  );

  /* Down the headings rather than down the rows. The list is grouped — Today,
     Yesterday, last week — and in an archive of a few hundred notes those
     headings are the only landmarks in it, so they are what a key should be
     able to reach. It steps by the same groups the list draws, because it asks
     the same list. */
  const moveByGroup = useCallback(
    (delta: number) => {
      if (noteGroups.length === 0) return;
      const current = noteGroups.findIndex((group) =>
        group.entries.some((entry) => entry.note.id === selectedId),
      );
      const next = Math.min(
        noteGroups.length - 1,
        Math.max(0, (current === -1 ? 0 : current) + (current === -1 ? 0 : delta)),
      );
      selectAt(noteGroups[next].entries[0].note.id);
    },
    [noteGroups, selectedId, selectAt],
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
        setPaletteQuery("");
        setPaletteOpen(true);
        return;
      }
      /* The pen, without the menu. Above the guard below because it is a thing
         you reach for *while* writing, which is exactly when the guard says a
         key belongs to the field it was typed in. */
      /* `code`, not `key`: Option and D together are "∂" on a Mac, and a
         shortcut that has to be spelled in dead keys is a shortcut nobody
         writes down. */
      if (e.altKey && !mod && e.code === "KeyD" && selectedId && canEdit) {
        e.preventDefault();
        noteEditorRef.current?.drawOnPage();
        return;
      }
      /* A document answers ⌘N with a chapter, and walks its chapters with
         ⌥⌘↑ and ⌥⌘↓ — Word's "previous / next heading", one level up. */
      if (docKeys.current.docMode && mod) {
        if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
          e.preventDefault();
          docKeys.current.step(e.key === "ArrowDown" ? 1 : -1);
          return;
        }
        if (e.key.toLowerCase() === "n") {
          e.preventDefault();
          docKeys.current.newChapter();
          return;
        }
      }
      if (mod && e.key.toLowerCase() === "n") {
        e.preventDefault();
        void handleNew();
        return;
      }
      /* Three doors that had none, all above the `typing` guard because all
         three are things you reach for *while* writing — which is exactly when
         that guard hands the key back to the field it was typed in.

         The keys are the conventions rather than choices: ⌘, is Preferences on
         every Mac application there has ever been, and neither ⌘. nor ⌘\ means
         anything inside the text, so no formatting shortcut loses its key. */
      if (mod && e.key === ",") {
        e.preventDefault();
        setSettingsOpen(true);
        return;
      }
      if (mod && e.key === ".") {
        e.preventDefault();
        toggleFocus();
        return;
      }
      if (mod && e.key === "\\") {
        e.preventDefault();
        changeNavigation((current) => !current);
        return;
      }
      /* The shortcuts sheet, and it is a chord rather than the bare `?` it was
         for the same reason ⌘, and ⌘. above are chords: it is a thing you
         reach for while writing, so it has to be above the guard.

         But the bare `?` had a second fault the guard could never have
         answered. The desktop menu shows this item with its key beside it, and
         macOS matches a menu's key equivalents in the window server *before*
         the keystroke reaches the page — so `registerAccelerator: false`
         notwithstanding, a menu item whose accelerator is a printable
         character outranks the text field the character was being typed into.
         A question mark typed into a note opened the sheet, in the app and
         never in the browser, which is exactly the shape of a key taken above
         the renderer.

         A chord has no such failure: if the menu takes ⌘/ it performs this
         command, which is what ⌘/ means anyway. The wrong outcome is no longer
         reachable rather than merely guarded against. */
      if (mod && e.key === "/") {
        e.preventDefault();
        setShortcutsOpen(true);
        return;
      }
      if (typing) return;

      if (e.key === "Escape" && focusMode) {
        e.preventDefault();
        toggleFocus();
        return;
      }
      /* The bare keys below walk a note list, and a document has none. */
      if (docKeys.current.docMode) return;

      if (e.key === "n") {
        e.preventDefault();
        void handleNew();
      } else if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        if (e.altKey) moveByGroup(1);
        else moveSelection(1);
      } else if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        if (e.altKey) moveByGroup(-1);
        else moveSelection(-1);
      } else if (e.key === "Enter" && selectedId) {
        e.preventDefault();
        titleRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [
    moveSelection,
    moveByGroup,
    handleNew,
    saveNow,
    selectedId,
    selected,
    canEdit,
    focusMode,
    toggleFocus,
    changeNavigation,
  ]);

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
          : [...prev.notes, { id: noteId, folderId }],
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
          : [...prev.notes, { id: noteId, folderId }],
      };
    });
    if (selectedFolderId !== ALL) setSelectedFolderId(folderId ?? ALL);
  }

  const docKeys = useRef({ docMode: false, step: (_: 1 | -1) => {}, newChapter: () => {} });
  docKeys.current = {
    docMode,
    step: (direction) => stepChapter(direction),
    newChapter: () => handleNewChapter(null),
  };

  /* ── A document's own acts ──────────────────────────────────────────────
     Each is one write to one owner's metadata, through the same path a note's
     pinning and filing take; the structure is the manuscript owner's, the
     notebook is the scope on screen. */
  async function flushMeta() {
    window.clearTimeout(timerRef.current);
    window.clearTimeout(retryRef.current);
    while (inFlightRef.current) await new Promise((resolve) => setTimeout(resolve, 30));
    await drain();
  }

  async function createDocNote(place: { folderId: string | null; position: number } | null) {
    if (!canWriteArchive) return;
    const s = sessionRef.current;
    if (!s) return;
    const owner = place ? manuscriptOwner : viewAs;
    const now = new Date().toISOString();
    const note: Note = {
      id: crypto.randomUUID(),
      title: "",
      body: "",
      content: structuredClone(EMPTY_RICH_TEXT),
      contentVersion: RICH_TEXT_VERSION,
      legacyBody: null,
      photo: null,
      cover: null,
      ownerId: owner,
      createdAt: now,
      updatedAt: now,
    };
    setSaving(true);
    setError("");
    try {
      /* A part made a moment ago is still only in the pending metadata, and
         a chapter filed in it would break the folder's foreign key. */
      if (
        place?.folderId &&
        pendingMetaRef.current.get(owner)?.after.folders.some((f) => f.id === place.folderId)
      )
        await flushMeta();
      const metadata: NoteMeta = {
        id: note.id,
        folderId: place?.folderId ?? null,
        ...(place ? { position: place.position } : {}),
      };
      const entry = await createNote(s, note, metadata);
      entriesRef.current = [entry, ...entriesRef.current];
      setEntries(entriesRef.current);
      setMetas((current) => {
        const base = current[owner] ?? metasRef.current[owner] ?? EMPTY_META;
        return { ...current, [owner]: { ...base, notes: [...base.notes, metadata] } };
      });
      setSelectedId(note.id);
      if (compact) setMobileScreen("note");
      ensureDraft(note.id, { title: "", body: "", content: structuredClone(EMPTY_RICH_TEXT) }, now);
      window.setTimeout(() => titleRef.current?.focus(), 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create the chapter");
    } finally {
      setSaving(false);
    }
  }

  /** After the chapter open now, in its part — the way Word inserts a section
   *  where you are rather than at the end of the file. */
  function handleNewChapter(folderId: string | null) {
    const chapters = manuscript?.chapters ?? [];
    if (folderId) {
      const last = chapters.map((item) => item.folderId).lastIndexOf(folderId);
      const place =
        last < 0
          ? intoPart(chapters, "", folderId)
          : {
              position: positionBetween(chapters[last].position, chapters[last + 1]?.position),
              folderId,
            };
      return void createDocNote(place);
    }
    const open = chapters.findIndex((item) => item.id === selectedId);
    void createDocNote(moveTo(chapters, "", open < 0 ? chapters.length : open + 1));
  }

  function setNoteRow(owner: string, noteId: string, change: Partial<NoteMeta>) {
    handleMetaChangeFor(owner, (prev) => {
      const existing = prev.notes.some((note) => note.id === noteId);
      return {
        ...prev,
        notes: existing
          ? prev.notes.map((note) => (note.id === noteId ? { ...note, ...change } : note))
          : [...prev.notes, { id: noteId, folderId: null, ...change }],
      };
    });
  }

  function handleMoveChapter(id: string, target: StructureTarget) {
    const chapters = manuscript?.chapters ?? [];
    const rest = chapters.filter((item) => item.id !== id);
    const at = (other: string) => rest.findIndex((item) => item.id === other);
    const next =
      target.kind === "notebook"
        ? { position: undefined, folderId: null }
        : target.kind === "part"
          ? intoPart(chapters, id, target.folderId)
          : target.kind === "end"
            ? moveTo(chapters, id, rest.length)
            : {
                /* Beside a chapter is in that chapter's part: the line the
                   hand drew is next to it, whichever side. */
                ...moveTo(chapters, id, at(target.id) + (target.kind === "after" ? 1 : 0)),
                folderId: rest[at(target.id)]?.folderId ?? null,
              };
    setNoteRow(manuscriptOwner, id, next);
  }

  function handleNewPart() {
    const count = manuscript?.parts.size ?? 0;
    handleMetaChangeFor(manuscriptOwner, (prev) => ({
      ...prev,
      folders: [
        ...prev.folders,
        { id: crypto.randomUUID(), name: `Part ${count + 1}`, parentId: null },
      ],
    }));
  }

  function handleRenamePart(id: string, name: string) {
    handleMetaChangeFor(manuscriptOwner, (prev) => ({
      ...prev,
      folders: prev.folders.map((folder) => (folder.id === id ? { ...folder, name } : folder)),
    }));
  }

  /** The part goes and its chapters stay where they are in the order. */
  function handleDeletePart(id: string) {
    handleMetaChangeFor(manuscriptOwner, (prev) => ({
      ...prev,
      folders: prev.folders.filter((folder) => folder.id !== id),
      notes: prev.notes.map((note) => (note.folderId === id ? { ...note, folderId: null } : note)),
    }));
  }

  function handleTrashDocNote(id: string) {
    const owner = entries.find((entry) => entry.note.id === id)?.note.ownerId ?? viewAs;
    setNoteRow(owner, id, { trashedAt: new Date().toISOString() });
    if (selectedId === id) {
      setSelectedId(null);
      if (compact) setMobileScreen("collection");
    }
  }

  function handleRestoreDocNote(id: string) {
    const owner = entries.find((entry) => entry.note.id === id)?.note.ownerId ?? viewAs;
    setNoteRow(owner, id, { trashedAt: undefined });
  }

  /** The chapter before or after the one open. */
  function stepChapter(direction: 1 | -1) {
    const chapters = manuscript?.chapters ?? [];
    const at = chapters.findIndex((item) => item.id === selectedId);
    const next = chapters[at < 0 ? 0 : at + direction];
    if (next) handleSelectNote(next.id);
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
    /* Which way the list travels: toward the person chosen, so the order of
       the faces is the order of the pages. */
    const ordered = [...members].sort((a, b) => Number(b.isSelf) - Number(a.isSelf));
    const place = (id: string) => ordered.findIndex((member) => member.userId === id);
    setScopeDirection(place(v) > place(viewAs) ? "next" : "previous");
    saveNow();
    setViewAs(v);
    /* In a shared manuscript the switch changes whose notebook is open, not
       which document — the chapter in front of you is still the one. */
    if (!(docMode && docFeatures.manuscript === "shared")) setSelectedId(null);
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
      /* The note being left fades out while the new one settles in, instead
         of vanishing in the frame the click lands. A view transition, so the
         old page is a picture and costs nothing to fade; the new one is live
         and runs its own `page-in` underneath. */
      const root = document.documentElement;
      if (
        !compact &&
        id !== selectedIdRef.current &&
        document.startViewTransition &&
        !window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
        !root.classList.contains("is-sliding-navigation")
      ) {
        root.classList.add("is-opening-note");
        document
          .startViewTransition(() => flushSync(() => setSelectedId(id)))
          .finished.finally(() => root.classList.remove("is-opening-note"));
      } else {
        setSelectedId(id);
      }
      /* Opening the note *is* having read what was said on it — a remark
         written on it while it is open is still news the next time. */
      markRemarksSeen(id);
      setListPreferences((current) => ({
        ...current,
        [viewAs]: rememberRecent(current[viewAs] ?? createListPreferences(viewAs), id),
      }));
      if (compact) setMobileScreen("note");
    },
    [compact, markRemarksSeen, viewAs],
  );

  /* A line of the contents was pressed — on the title page or in a `[TOC]`
     block — so open its chapter and go to the heading. */
  useEffect(() => {
    const open = (event: Event) => {
      const { noteId, text, target } = (event as CustomEvent<PlaceRequest>).detail;
      handleSelectNote(noteId);
      if (target ?? text) setOpenThen({ noteId, reveal: target ?? text });
    };
    window.addEventListener(OPEN_PLACE, open);
    return () => window.removeEventListener(OPEN_PLACE, open);
  }, [handleSelectNote]);

  /* Arrived from ⌘K in another archive: open what was chosen there, in the
     scope it sits in, once this archive's notes are here. */
  useEffect(() => {
    if (!openOnArrival || loading) return;
    const entry = entries.find((candidate) => candidate.note.id === openOnArrival);
    openOnArrival = null;
    if (!entry) return;
    if (!docMode && entry.note.ownerId && entry.note.ownerId !== viewAs)
      setViewAs(entry.note.ownerId);
    setSelectedFolderId(ALL);
    handleSelectNote(entry.note.id);
  }, [loading, entries, docMode, viewAs, handleSelectNote]);

  useEffect(() => {
    if (!paletteOpen || !session) return;
    let current = true;
    loadNamedVersions(session)
      .then((versions) => current && setNamedVersions(versions))
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [paletteOpen, session]);

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
      /* `readSnapshot`, not the debounced wrapper: this one is waited on, and
         the wait is the point — the form stays busy until the roster it just
         changed has come back. */
      await readSnapshot();
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

  const archiveSheetOpen = sheets.some((sheet) => sheet.kind === "archive");
  useEffect(() => {
    if (settingsOpen || archiveSheetOpen) void refreshInvites();
  }, [settingsOpen, archiveSheetOpen, refreshInvites]);

  async function inviteLink(email: string): Promise<string> {
    if (!session) throw new Error("Sign in again first");
    const token = await createArchiveInvite(session, email);
    const link = new URL(platform().webOrigin());
    link.searchParams.set("invite", token);
    await refreshInvites();
    return link.toString();
  }

  async function withdrawInvite(inviteId: string) {
    await revokeArchiveInvite(inviteId);
    await refreshInvites();
  }

  /* The switch is asked for once a session; a missing answer only means the
     switch is not drawn, never that the archive fails to open. */
  const refreshSpaces = useCallback(async () => {
    if (!session) return;
    try {
      knownSpaces = await loadSpaces(session);
      setSpaces(knownSpaces);
    } catch {
      /* Nothing to switch to is a quiet state, not an error. */
    }
  }, [session]);
  useEffect(() => {
    void refreshSpaces();
  }, [refreshSpaces]);
  /* The archive on screen answers from the live roster rather than from the
     list the switch loaded, so somebody joining appears at once. */
  const spacesView: Space[] = spaces.map((space) =>
    space.archiveId === session?.archiveId && members.length > 0
      ? {
          ...space,
          seatLimit,
          members: members.map((member) => ({
            userId: member.userId,
            nickname: member.nickname,
            avatarObject: member.avatarObject,
          })),
        }
      : space,
  );

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

  /* One setter for all four, because they are one row. The local mirrors
     (`saveAutoLock`, `saveProofreaderPreference`) are still written, by the
     push effect above, so a browser opened offline still opens to what you
     chose here. */
  function changeFlags(patch: Partial<AccountFlags>) {
    setFlags((current) => ({ ...current, ...patch }));
  }

  /* What's New: open by itself once a release this account has not read
     is here — only after the row has been pulled, or every device would
     announce a release already read on another — and read once closed. */
  const whatsNewUnseen =
    preferencesReady && compareVersions(CURRENT_RELEASE, flags.whatsNewSeen) > 0;
  useEffect(() => {
    if (!whatsNewUnseen || loading || whatsNewShown) return;
    whatsNewShown = true;
    setWhatsNewOpen(true);
  }, [whatsNewUnseen, loading]);
  const closeWhatsNew = useCallback(() => {
    setWhatsNewOpen(false);
    setFlags((current) =>
      compareVersions(CURRENT_RELEASE, current.whatsNewSeen) > 0
        ? { ...current, whatsNewSeen: laterVersion(current.whatsNewSeen, CURRENT_RELEASE) }
        : current,
    );
  }, []);

  function handleLock() {
    saveNow();
    clearDrafts();
    void clearSession();
    navigate({ to: "/" });
  }

  /* Leaving an archive and deleting one end the same way: whatever is still
     waiting lands first, the act runs, and the window goes to another
     archive — or, with none left, to the door. */
  const goElsewhere = useCallback(
    async (current: AppSession, act: () => Promise<void>) => {
      /* Membership removal revokes the right to finish a write, so flush first
         and fail closed if any note or metadata is still waiting locally. */
      await drain();
      if (hasPending() || pendingMetaRef.current.size > 0) {
        throw new Error("Your latest changes could not be saved. Try again before leaving.");
      }

      await act();
      clearDrafts();
      const remaining = (await loadSpaces(current).catch(() => [])).filter(
        (space) => space.archiveId !== current.archiveId,
      );
      if (remaining.length > 0) {
        await chooseArchive(current, remaining[0].archiveId);
        setSheets([]);
        await leaveScreen();
        document.documentElement.dataset.arriving = "";
        onReopen();
        return;
      }
      await clearSession();
      setSession(null);
      navigate({ to: "/" });
    },
    [drain, navigate, onReopen],
  );

  const handleLeaveArchive = useCallback(async () => {
    const current = sessionRef.current;
    if (!current) throw new Error("Sign in again before leaving this archive");
    await goElsewhere(current, () => leaveArchive(current));
  }, [goElsewhere]);

  /* Its last member only; `deleteSpace` asks Postgres first and refuses
     before anything is removed. */
  const handleDeleteArchive = useCallback(async () => {
    const current = sessionRef.current;
    if (!current) throw new Error("Sign in again before deleting this archive");
    await goElsewhere(current, () => deleteSpace(current));
  }, [goElsewhere]);

  /* Writes waiting here belong to this archive, so they land before the
     window leaves it — and if they cannot, it does not leave. */
  const handleSwitchArchive = useCallback(
    async (archiveId: string) => {
      const current = sessionRef.current;
      if (!current || current.archiveId === archiveId) return;
      await drain();
      if (hasPending() || pendingMetaRef.current.size > 0)
        throw new Error("Your latest changes are still saving. Try again in a moment.");
      await chooseArchive(current, archiveId);
      setSheets([]);
      await leaveScreen();
      document.documentElement.dataset.arriving = "";
      onReopen();
    },
    [drain, onReopen],
  );

  /* Arrived: everything the archive needs is here. Each entrance is finished
     where it stands — it would otherwise play out under the fade — and the
     screen comes in once. */
  const arrived = !loading && !!session && spaces.length > 0;
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (!arrived || !("arriving" in root.dataset)) return;
    const shell = shellElement();
    delete root.dataset.arriving;
    if (!shell || stillMotion()) return;
    for (const animation of shell.getAnimations({ subtree: true }))
      if (animation.effect?.getComputedTiming().endTime !== Infinity) animation.finish();
    shell.animate([{ opacity: 0 }, { opacity: 1 }], SWITCH_IN);
  }, [arrived]);

  const switchArchive = (archiveId: string) =>
    void handleSwitchArchive(archiveId).catch((error: Error) => setStatusFlash(error.message));

  /* Who else is on this page right now, asked of the note's own document: a
     peer in this list is connected to it by construction, so there is no note
     filter to get wrong and no second channel to be out of step with.
     The roster in Settings answers "who is online"; this answers the narrower
     question you actually have while writing.

     The only switch over it is `flags.collaborators`, which is what *this*
     reader chose to be shown. It used to be gated on the archive-wide presence
     preference instead, on the sending side — so a member with that off was
     invisible in the note she was typing into and neither of you could do
     anything about it from where you were sitting. */
  const noteReaders = useMemo(() => {
    if (!flags.collaborators || !selectedId || notePeers.length === 0) return null;
    return (
      <span className="note-readers" aria-live="polite">
        {notePeers.map((peer) => {
          /* The roster is where a face and a chosen nickname live. Awareness is
             where *being here* lives, and it is the one the caret in the text
             already agrees with. A peer the roster has not loaded yet still
             appears, under the name the server stamped. */
          const member = members.find((candidate) => candidate.userId === peer.userId);
          const name = member?.nickname || peer.name;
          const palette = presencePaletteFor(writingPreferences.presencePalette);
          return (
            <MemberPresenceCard
              key={peer.userId}
              avatarUrl={avatarUrls[peer.userId] ?? null}
              name={name}
              typing={peer.typing}
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
  }, [flags.collaborators, selectedId, notePeers, members, avatarUrls, writingPreferences]);

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

  /* Which notes reached this one. Found by walking the Tiptap JSON of the
     notes already in memory rather than by asking Postgres: a link is a mark
     inside the document, so there is no column to index and no query to write,
     and the documents are here anyway because the list is drawn from them.

     Memoised, and that is not an optimisation to take back later. It is the
     only full-depth walk over every document in the archive, and it sat
     unmemoised in the render body of a component that re-renders on every
     keystroke — the typing flag, the save readout and the presence roster all
     land here. The projection only changes when a save lands, so the deps say
     so and the scan runs then. */
  const backlinks = useMemo(
    () =>
      selectedId
        ? ownedEntries
            .filter(
              (entry) =>
                entry.note.id !== selectedId &&
                !trashedIds.has(entry.note.id) &&
                linksTo(entry.note.content, selectedId),
            )
            .map((entry) => ({ id: entry.note.id, title: entry.note.title }))
        : [],
    [ownedEntries, trashedIds, selectedId],
  );

  /* ── Always leave a useful writing surface ──────────────────────────────
     The handles already stopped before either navigation pane could eat the
     editor. What they could not stop is the window itself getting smaller: a
     pane keeps the width it was stored with, so shrinking the window took the
     whole difference out of the note — at 900px the writing column was 232px
     and everything in its toolbar was on top of everything else, which is the
     "squashed in miniature" report.

     So the *shown* widths are clamped to the room there is, and the stored ones
     are left alone: widen the window again and the panes come back to where
     they were put. The list gives ground first, because it is a preview column
     and the folders are a fixed vocabulary that either fits or does not. */
  const editorReserve = 380;
  const room = Math.max(SIDEBAR_MIN + LIST_MIN, windowWidth - editorReserve - 2);
  const listShown = Math.max(LIST_MIN, Math.min(listWidth, room - SIDEBAR_MIN));
  const sidebarShown = Math.max(SIDEBAR_MIN, Math.min(sidebarWidth, room - listShown));
  const sidebarMax = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, room - listShown));
  const listMax = Math.max(LIST_MIN, Math.min(LIST_MAX, room - sidebarShown));

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
  const edited = selected?.note.updatedAt ?? "";
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
    <span className="inline-flex items-center gap-2">
      <span className="animate-spin inline-block h-2.5 w-2.5 rounded-full border border-accent border-t-transparent" />
      <span className="label text-accent">Saving</span>
    </span>
  ) : dirty ? (
    <span className="label text-ink-2">Unsaved</span>
  ) : statusFlash ? (
    <span className="label text-accent">{statusFlash}</span>
  ) : selectedId && collaborative.refusal ? (
    /* The door was answered and shut. Said rather than left as a wait, because
       a refusal that renders as "Connecting" is a wait nobody can end. */
    <span className="label text-ink-2" title={collaborative.refusal}>
      {collaborative.refusal}
    </span>
  ) : selectedId && !collaborative.ready ? (
    /* The free plan's server sleeps after fifteen idle minutes and takes about
       fifty seconds to get up, and nothing opens until it has. Saying so is
       most of the fix: an unexplained wait is indistinguishable from a fault,
       and this one was being read as "live is broken again". What you type
       meanwhile is kept and sent on arrival, which is the other half worth
       saying — so it goes in the tooltip rather than in a second line. */
    <span
      className="label text-ink-4"
      title={
        collaborative.waking
          ? "The collaboration server sleeps when nobody is writing and takes about a minute to wake. Anything you type now is kept on this device and sent when it arrives."
          : undefined
      }
    >
      {collaborative.waking ? "Waking the server" : "Connecting"}
    </span>
  ) : selectedId && collaborative.connection === "offline" ? (
    <span className="label text-ink-2" title="Changes stay on this device and sync on reconnect">
      Offline
    </span>
  ) : merge ? (
    <span className="label text-accent" title={merge.detail}>
      {merge.label}
    </span>
  ) : selected ? (
    /* The resting state of this slot, and the only place in the window the
       note's own time is said.
    
       It used to be a line centred over the title, which is a caption with no
       picture under it — and this slot, which is *about* the state of the
       note, said nothing at all until something happened to it. So the two
       swapped: the slot says when the note was last edited, and it says it in
       the list's own shorthand, because everything else that appears here is
       measured against a 7.5rem box that clips.

       It also replaces "Updated elsewhere", which was two accented seconds of
       blue and then nothing. A change made in the other window *is* a new
       time, so the time arriving is the whole announcement — and unlike the
       flash it is still there a minute later, when somebody looks up. */
    <span className="label text-ink-4" title={`Last edited ${formatDateTime(edited)}`}>
      Edited {formatStamp(edited)}
    </span>
  ) : null;

  const pinned = selected
    ? indexOf(activeMeta).byNote.get(selected.note.id)?.pinned === true
    : false;
  const recentNotes = storedPreferences.recentNoteIds
    .filter((id) => id !== selectedId)
    .map((id) => entries.find((entry) => entry.note.id === id)?.note)
    .filter((note): note is Note => Boolean(note))
    .map((note) => ({ id: note.id, title: note.title }));

  /* Which notes `[[` can reach. The backlinks that answer the other half of
     the question are computed above, in a memo. */
  const linkableNotes = ownedEntries
    .filter((entry) => !trashedIds.has(entry.note.id))
    .map((entry) => ({ id: entry.note.id, title: entry.note.title }));

  /* Nothing may be beside itself. And nothing in the trash: `canEdit` is
     computed for the note in the primary column, so a trashed note opened
     beside a live one would inherit permission to be written — which is the
     one thing Trash exists to withhold. Excluded here and again where the
     palette offers the list, so neither route can reach it. */
  const splitEntry =
    splitId && splitId !== selectedId && !trashedIds.has(splitId)
      ? (ownedEntries.find((entry) => entry.note.id === splitId) ?? null)
      : null;

  /* The pinned notes the rail lists. Trash and Archive are left out: a pin is
     a note you are coming back to, and neither of those is that. */
  const pinnedNotes = ownedEntries
    .filter(
      (entry) =>
        indexOf(activeMeta).byNote.get(entry.note.id)?.pinned &&
        !trashedIds.has(entry.note.id) &&
        !archivedIds.has(entry.note.id),
    )
    .map((entry) => ({ id: entry.note.id, title: entry.note.title }));

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
      {
        id: REMARKS,
        label: "Remarks",
        count: [...remarkedIds].filter((id) => !trashedIds.has(id)).length,
        unread: unreadRemarkCount,
      },
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
  /* Hiding the columns opens the list's strip, at its leading edge, the way
     Notes and Mail put it: the control that moves the columns stands where
     they are. Compose goes to the trailing edge. */
  const sidebarToggle = !compact && (
    <button
      type="button"
      onClick={() => changeNavigation(false)}
      aria-label="Hide the sidebar"
      title={"Hide the sidebar · ⌘\\"}
      className="toolbar-button press shrink-0"
    >
      <PanelLeftClose size={18} />
    </button>
  );

  const collectionActions = (
    <>
      <CollectionMenu
        preferences={activeListPreferences}
        onChange={handleListPreferencesChange}
        onExportAll={() => void handleExportAll()}
        onOpenPalette={() => {
          setPaletteQuery("");
          setPaletteOpen(true);
        }}
        onOpenShortcuts={() => setShortcutsOpen(true)}
        bulk={
          !canWriteArchive
            ? undefined
            : selectedFolderId === TRASH
              ? {
                  label: "Delete all",
                  confirm: "Yes, delete them now",
                  danger: true,
                  count: trashedEntries.length,
                  run: handleEmptyTrash,
                }
              : selectedFolderId === ARCHIVE
                ? {
                    label: "Remove all from Archive",
                    confirm: "Yes, move them back",
                    danger: false,
                    count: archivedEntries.length,
                    run: handleEmptyArchive,
                  }
                : undefined
        }
      />
    </>
  );

  /* One roster, ordered with yourself first, and it is local on purpose:
     `members` arrives in the order people joined and stays that way for the
     Settings roster, the avatar cache and the note's peers, all of which have
     their own reasons to keep it. Only the switch wants you at the left.

     Sorted on every render rather than memoised: this is at most eight names,
     and the switch beside it already walked the same array to find the index. */
  const roster = [...members].sort((a, b) => Number(b.isSelf) - Number(a.isSelf));

  /* What to call a member, and what to call their notes. The nickname on the
     roster row is a snapshot; your own has just been edited in Settings often
     enough that the profile wins for you. */
  const nameOf = (member: ArchiveMember) =>
    member.isSelf
      ? profile.nickname || member.nickname || session.email.split("@")[0]
      : member.nickname || "Member";
  const notesOf = (member: ArchiveMember) =>
    member.isSelf ? "Your notes" : `${member.nickname || "Another member"}'s notes`;

  /* What a document finds is its own: chapters and the notebook, in whoever's
     scope the structure keeps them; a notes archive finds the scope on screen,
     as it always has. */
  const searchable = !paletteOpen
    ? []
    : docMode && manuscript
      ? (() => {
          const ids = new Set(
            [...manuscript.chapters, ...manuscript.notebook].map((item) => item.id),
          );
          return entries.filter((entry) => ids.has(entry.note.id));
        })()
      : ownedEntries;

  /* Opening what was found. In a document the structure's own path — the
     notes list's scope and filter are not on screen there — and then, if a
     place inside it was found, going to that place. */
  const openFound =
    (id: string, then?: { reveal?: string | PlaceTarget; history?: string }) => () => {
      if (docMode) {
        handleSelectNote(id);
        if (compact) {
          setFoldersOpen(false);
          setMobileScreen("note");
        }
      } else {
        setQuery("");
        setSelectedFolderId(ALL);
        handleSelectNote(id);
      }
      if (then) setOpenThen({ noteId: id, ...then });
    };
  const middle = () => ({
    x: window.innerWidth / 2,
    y: window.innerHeight / 3,
    width: 1,
    height: 1,
  });

  const paletteCommands: Command[] = ((): Command[] => {
    if (!paletteOpen) return [];
    const open = (id: string) => openFound(id);
    const stamp = (entry: NoteEntry) => Date.parse(entry.note.updatedAt);
    const chapters = manuscript?.chapters ?? [];
    return [
      ...(docMode && manuscript
        ? [
            {
              id: "go:title",
              group: "Go to",
              name: "Title page",
              keywords: "cover front document",
              icon: <Chapters size={16} />,
              run: () => setSelectedId(null),
            },
          ]
        : scopes.map((scope) => ({
            id: `scope:${scope.id}`,
            group: "Go to",
            name: scope.label,
            icon:
              scope.id === TRASH ? (
                <Trash2 size={16} />
              ) : scope.id === REMARKS ? (
                <MessageSquare size={16} />
              ) : scope.id === ARCHIVE ? (
                <Archive size={16} />
              ) : scope.id === ALL ? (
                <NotebookText size={16} />
              ) : (
                <Folder size={16} />
              ),
            run: () => handleSelectFolder(scope.id),
          }))),
      /* The running text is found by the Text group below, with the line it
         is in; here a note is found by its name. */
      ...(docMode && manuscript
        ? [
            ...chapters.map((item, index) => ({
              id: `note:${item.id}`,
              group: "Chapters",
              name: item.title || "Untitled",
              hint: [
                `Chapter ${index + 1}`,
                item.folderId ? manuscript.parts.get(item.folderId) : undefined,
              ]
                .filter(Boolean)
                .join(" · "),
              icon: <FileText size={16} />,
              run: open(item.id),
            })),
            ...manuscript.notebook.map((item) => ({
              id: `note:${item.id}`,
              group: "Notebook",
              name: item.title || "Untitled",
              icon: <NotebookText size={16} />,
              run: open(item.id),
            })),
            ...[...manuscript.parts].flatMap(([partId, name]) => {
              const first = chapters.find((item) => item.folderId === partId);
              return first
                ? [
                    {
                      id: `part:${partId}`,
                      group: "Parts",
                      searchOnly: true,
                      name,
                      hint: first.title || "Untitled",
                      icon: <Folder size={16} />,
                      run: open(first.id),
                    },
                  ]
                : [];
            }),
          ]
        : ownedEntries.map((entry) => ({
            id: `note:${entry.note.id}`,
            group: "Notes",
            name: entry.note.title || "Untitled",
            hint: derivedOf(entry.note).preview || undefined,
            at: stamp(entry),
            icon: <FileText size={16} />,
            run: open(entry.note.id),
          }))),
      /* What was said, searchable with everything else. A remark is the one
         thing in this archive that was not reachable from here — and it is
         the kind of thing you go looking for by its words rather than by the
         note it is on. Opening one is opening its note in the scope that
         opens conversations with it, which is the path that already exists. */
      ...archiveComments.flatMap((remark) => {
        const entry = searchable.find((candidate) => candidate.note.id === remark.noteId);
        if (!entry) return [];
        const title = entry.note.title || "Untitled";
        return [
          {
            id: `remark:${remark.id}`,
            group: "Remarks",
            name: remark.body,
            hint: title,
            keywords: `${remark.body} ${title}`.toLowerCase(),
            icon: <MessageSquare size={16} />,
            run: docMode
              ? () => {
                  openFound(remark.noteId)();
                  setOpenThen({ noteId: remark.noteId, comments: true });
                }
              : () => {
                  setQuery("");
                  setSelectedFolderId(REMARKS);
                  handleSelectNote(remark.noteId);
                },
          },
        ];
      }),
      ...roster.map((member) => ({
        id: `person:${member.userId}`,
        group: "People",
        searchOnly: true,
        name: nameOf(member),
        icon: <UserRound size={16} />,
        run: () => openSheet({ ...middle(), kind: "person", userId: member.userId }),
      })),
      ...namedVersions.flatMap((version) => {
        const entry = entries.find((candidate) => candidate.note.id === version.noteId);
        if (!entry || !version.label) return [];
        return [
          {
            id: `version:${version.id}`,
            group: "Versions",
            searchOnly: true,
            name: version.label,
            hint: `${entry.note.title || "Untitled"} · ${formatDateTime(version.createdAt)}`,
            at: Date.parse(version.createdAt),
            icon: <History size={16} />,
            run: openFound(version.noteId, { history: version.id }),
          },
        ];
      }),
      ...spaces
        .filter((space) => space.archiveId !== session?.archiveId)
        .map((space) => ({
          id: `archive:${space.archiveId}`,
          group: "Archives",
          searchOnly: true,
          name: space.name,
          keywords: "archive space switch",
          icon: <Layers size={16} />,
          run: () => switchArchive(space.archiveId),
        })),
      {
        id: "new",
        group: "Do",
        name: docMode ? "New chapter" : "New note",
        hint: "⌘N",
        icon: <SquarePen size={16} />,
        run: () => (docMode ? handleNewChapter(null) : void handleNew()),
      },
      ...(selectedId && !docMode
        ? ownedEntries
            .filter(
              (entry) =>
                entry.note.id !== selectedId &&
                entry.note.id !== splitId &&
                !trashedIds.has(entry.note.id),
            )
            .map((entry) => ({
              id: `split:${entry.note.id}`,
              group: "Open beside",
              name: entry.note.title || "Untitled",
              keywords: `split side by side beside ${derivedOf(entry.note).haystack}`,
              icon: <Columns2 size={16} />,
              run: () => setSplitId(entry.note.id),
            }))
        : []),
      ...(splitEntry
        ? [
            {
              id: "unsplit",
              group: "Do",
              name: "Close the second note",
              icon: <Columns2 size={16} />,
              run: () => setSplitId(null),
            },
          ]
        : []),
      {
        id: "focus",
        group: "Do",
        name: focusMode ? "Leave focus" : "Focus mode",
        hint: focusMode ? "Esc" : "One column, nothing else",
        keywords: "zen distraction free writing",
        icon: focusMode ? <Minimize2 size={16} /> : <Maximize2 size={16} />,
        run: toggleFocus,
      },
      {
        id: "settings",
        group: "Do",
        name: "Settings",
        icon: <Settings size={16} />,
        run: () => setSettingsOpen(true),
      },
      {
        id: "export",
        group: "Do",
        name: "Export all as Markdown",
        icon: <FolderDown size={16} />,
        run: () => void handleExportAll(),
      },
      {
        id: "whats-new",
        group: "Do",
        name: "What's New",
        icon: <Sparkle size={16} />,
        run: () => setWhatsNewOpen(true),
      },
      {
        id: "shortcuts",
        group: "Do",
        name: "Keyboard shortcuts",
        hint: "\u2318/",
        icon: <Keyboard size={16} />,
        run: () => setShortcutsOpen(true),
      },
      {
        id: "lock",
        group: "Do",
        name: "Lock & sign out",
        icon: <Lock size={16} />,
        run: () => handleLock(),
      },
      /* Every section of Settings, by its name and by the rows inside it. */
      ...settingsSectionsFor(docMode ? "document" : "notes")
        .flatMap((group) => group.items)
        .map((item) => ({
          id: `settings:${item.id}`,
          group: "Settings",
          searchOnly: true,
          name: item.name,
          keywords: `settings ${item.keywords}`,
          icon: item.icon,
          run: () => {
            setSettingsSection(item.id);
            setSettingsOpen(true);
          },
        })),
    ];
  })();

  /* What only a typed query finds: the headings a note is divided by and the
     line a word occurs in. From memory, on every keystroke — `haystack` is
     already folded, so a note that does not hold the word costs one
     `includes`. */
  const paletteSearch = (q: string): Command[] => {
    const found: Command[] = [];
    const references = referenceSnapshot();
    let lines = 0;
    for (const entry of searchable) {
      const id = entry.note.id;
      const title = entry.note.title || "Untitled";
      const at = Date.parse(entry.note.updatedAt);
      /* A footnote's words are an attribute, outside the text the haystack
         is made of, so they are asked before it can rule the note out. */
      for (const target of references.counted.get(id)?.targets ?? []) {
        if (target.kind !== "footnote" || !fold(target.text).includes(q)) continue;
        found.push({
          id: `footnote:${id}:${target.index}`,
          group: "Footnotes",
          name: target.text.length > 90 ? `${target.text.slice(0, 89)}…` : target.text,
          hint: `${REFERENCE_WORDS[references.settings.language].footnote} ${target.number} · ${title}`,
          rank: 4,
          at,
          icon: <Footnote size={16} />,
          run: openFound(id, {
            reveal: { kind: "footnote", id: target.id, index: target.index },
          }),
        });
      }
      if (!derivedOf(entry.note).haystack.includes(q)) continue;
      headingsOf(entry.note.content).forEach((heading, index) => {
        if (!fold(heading.text).includes(q)) return;
        found.push({
          id: `section:${id}:${index}`,
          group: "Sections",
          name: heading.text,
          hint: title,
          rank: 3,
          at,
          icon: <Heading2 size={16} />,
          run: openFound(id, { reveal: heading.text }),
        });
      });
      // ponytail: the first thirty notes that hold the word; a ranked cap if an archive outgrows it.
      const snippet = lines < 30 ? snippetOf(entry.note.body, q) : null;
      if (snippet) {
        lines += 1;
        found.push({
          id: `text:${id}`,
          group: "Text",
          name: title,
          snippet,
          rank: 6,
          at,
          icon: <Pilcrow size={16} />,
          run: openFound(id, { reveal: snippet.match }),
        });
      }
    }
    return found;
  };

  /* The titles in the other archives, which are not in memory. Choosing one
     is changing archive, and the note is opened when the new one arrives. */
  const paletteRemote = async (q: string): Promise<Command[]> => {
    const others = spaces.filter((space) => space.archiveId !== session?.archiveId);
    const far = await findInOtherArchives(
      others.map((space) => space.archiveId),
      q,
    );
    const folded = fold(q);
    return far.map((note) => {
      const match = nameMatch(note.title, folded);
      return {
        id: `far:${note.noteId}`,
        group: "Other archives",
        name: note.title || "Untitled",
        hint: others.find((space) => space.archiveId === note.archiveId)?.name,
        rank: match < 0 ? 2 : match,
        at: Date.parse(note.updatedAt),
        icon: <FileText size={16} />,
        run: () => {
          openOnArrival = note.noteId;
          switchArchive(note.archiveId);
        },
      };
    });
  };

  /* ── Whose notes ───────────────────────────────────────────────────────────
     Faces, and no names. It carried both, side by side, for each member: two
     drawings of one person touching each other — which is the fault the
     profile button had at forty pixels, committed again at four. A portrait
     already is the name.

     Losing the names is what lets it stop being as wide as the pane. Shrunk to
     its contents it is sixty-six pixels, which fits in the window's own strip
     beside the traffic lights — so the column goes back to one band of chrome
     over its rows instead of two, and the row under it stops being the second
     of two slabs of identical width. That stacking, not the colour, was what
     made "All notes" unreadable.

     It stays a switch rather than becoming a menu: one track, one travelling
     thumb, and the difference between a control that throws and two buttons
     that light up. Yours is always the first slot, so the thumb rests where
     the hand expects it whether you made this archive or were invited to it.

     What the faces no longer say, the column beside this one does: the tally
     under the folder's name carries the member when the member is not you. */
  const archiveSwitch = (
    <div
      role="group"
      aria-label="Scope"
      style={
        {
          "--switch-count": Math.max(roster.length, 1),
          "--switch-index": Math.max(
            roster.findIndex((member) => member.userId === viewAs),
            0,
          ),
        } as React.CSSProperties
      }
      className="archive-switch shrink-0"
    >
      <span className="archive-switch-thumb" aria-hidden="true" />
      {roster.map((member) => (
        <button
          key={member.userId}
          type="button"
          /* A press throws the switch; a press held asks the face who it is.
             The faces stopped carrying names when the switch shrank to fit the
             title bar, so this is the window's only answer to that question —
             and holding is where a portrait keeps its answer on a phone, which
             has no second button to ask with. A pointer may also right-click,
             the way everything else here is asked. */
          onClick={() => {
            if (heldRef.current) return void (heldRef.current = false);
            handleViewChange(member.userId);
          }}
          onPointerDown={(event) => holdStart(event, member.userId)}
          onPointerUp={holdEnd}
          onPointerLeave={holdEnd}
          onPointerCancel={holdEnd}
          onContextMenu={(event) => {
            event.preventDefault();
            holdEnd();
            openSheet({
              ...faceOrigin(event.currentTarget),
              kind: "person",
              userId: member.userId,
            });
          }}
          aria-pressed={viewAs === member.userId}
          aria-label={notesOf(member)}
          title={notesOf(member)}
          className={viewAs === member.userId ? "is-active" : ""}
        >
          <Avatar
            url={avatarUrls[member.userId] ?? null}
            name={nameOf(member)}
            email=""
            compact
            online={flags.presence && onlineMemberIds.has(member.userId)}
          />
        </button>
      ))}
    </div>
  );

  /* ── Whose notes, on the desktop ─────────────────────────────────────────
     The switch above fits a phone's header and a title bar, and that was the
     trouble with it in the window: two faces at twenty pixels, squeezed beside
     the traffic lights, which is a control and not a person. The sidebar has
     the room to show the people this archive is shared between, so it does —
     the way iMessage shows the conversations you pinned: a face large enough
     to recognise, a name under it, whether they are here, and whether they
     are writing in the note in front of you. The ring is the person's colour:
     yours is the accent, everybody else's the presence colour their caret
     already wears in the note, so one colour means one person throughout.

     Typing is read from the note's own awareness, so the bubble means "in
     this note, now" and never a guess about some other page. */
  const presenceColor = presencePaletteFor(writingPreferences.presencePalette).color;
  const typingIds = new Set(notePeers.filter((peer) => peer.typing).map((peer) => peer.userId));
  const hereIds = new Set(notePeers.map((peer) => peer.userId));
  /* The notes somebody else has open, for the dot on their rows. The note
     open here is answered by awareness, which is certain; every other note by
     the presence channel, which is the only thing that can see it. */
  const peerNoteIds = new Set<string>();
  if (flags.collaborators) {
    for (const [userId, noteId] of present)
      if (noteId && userId !== session?.userId) peerNoteIds.add(noteId);
    if (selectedId && hereIds.size > 0) peerNoteIds.add(selectedId);
  }
  const peopleShelf = (
    <div
      role="group"
      aria-label="Whose notes"
      className="people-shelf"
      style={
        {
          "--count": roster.length,
          "--index": Math.max(
            0,
            roster.findIndex((member) => member.userId === viewAs),
          ),
        } as React.CSSProperties
      }
    >
      <span className="people-thumb" aria-hidden="true" />
      {roster.map((member) => {
        const active = viewAs === member.userId;
        const online =
          !member.isSelf &&
          ((flags.presence && onlineMemberIds.has(member.userId)) || hereIds.has(member.userId));
        const typing = !member.isSelf && flags.collaborators && typingIds.has(member.userId);
        return (
          <button
            key={member.userId}
            type="button"
            onClick={() => {
              if (heldRef.current) return void (heldRef.current = false);
              handleViewChange(member.userId);
            }}
            onPointerDown={(event) => holdStart(event, member.userId)}
            onPointerUp={holdEnd}
            onPointerLeave={holdEnd}
            onPointerCancel={holdEnd}
            onContextMenu={(event) => {
              event.preventDefault();
              holdEnd();
              openSheet({
                ...faceOrigin(event.currentTarget),
                kind: "person",
                userId: member.userId,
              });
            }}
            aria-pressed={active}
            aria-label={notesOf(member)}
            title={notesOf(member)}
            className={`people-face ${active ? "is-active" : ""}`}
            style={
              {
                "--face": member.isSelf ? "var(--accent)" : presenceColor,
              } as React.CSSProperties
            }
          >
            <span className="people-face-portrait">
              <Avatar url={avatarUrls[member.userId] ?? null} name={nameOf(member)} email="" />
              {online && <span className="people-face-here" aria-label="Here now" />}
            </span>
            <span className="people-face-name">{member.isSelf ? "You" : nameOf(member)}</span>
            {typing && (
              <span className="people-face-typing" aria-label="Writing">
                <i />
                <i />
                <i />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );

  /* A door out of a sheet: the note, in whoever's scope it sits, and then
     its history or its conversation if that is what was pressed. */
  function openFromSheet(noteId: string, then?: { history?: string | true; comments?: boolean }) {
    const entry = entries.find((one) => one.note.id === noteId);
    if (!entry) return;
    setSheets([]);
    if (entry.note.ownerId && entry.note.ownerId !== viewAs) handleViewChange(entry.note.ownerId);
    handleOpenRecent(noteId);
    if (then) setOpenThen({ noteId, ...then });
  }

  const personOf = (userId: string) => {
    const member = members.find((one) => one.userId === userId);
    return member ? { userId, name: nameOf(member), avatarUrl: avatarUrls[userId] ?? null } : null;
  };

  function renderNoteSheet(sheet: SheetOrigin & { noteId: string }, key: string) {
    if (!session) return null;
    const entry = entries.find((one) => one.note.id === sheet.noteId);
    if (!entry) return null;
    const index = indexOf(activeMeta);
    const meta = index.byNote.get(entry.note.id);
    const folder = meta?.folderId ? index.byFolder.get(meta.folderId) : undefined;
    const titled = (id: string) => ({
      id,
      title: entries.find((one) => one.note.id === id)?.note.title ?? "",
    });
    const linksOut = [...linkedNoteIds(entry.note.content)].filter(
      (id) => id !== entry.note.id && entries.some((one) => one.note.id === id),
    );
    return (
      <NoteSheet
        key={key}
        session={session}
        origin={sheet}
        resolveImage={resolveImage}
        personOf={personOf}
        note={{
          id: entry.note.id,
          title: entry.note.title,
          photoObjectId: entry.note.photo?.objectId ?? null,
          folder: folder ? { id: folder.id, name: folder.name } : null,
          owner: entry.note.ownerId ? personOf(entry.note.ownerId) : null,
          pinned: meta?.pinned === true,
          archived: archivedIds.has(entry.note.id),
          trashed: trashedIds.has(entry.note.id),
          lockedBy: lockHolders.get(entry.note.id) ?? null,
          words: derivedOf(entry.note).words,
          openRemarks: new Set(
            archiveComments
              .filter((remark) => remark.noteId === entry.note.id && !remark.resolvedAt)
              .map((remark) => remark.threadId),
          ).size,
          createdAt: entry.note.createdAt,
          updatedAt: entry.note.updatedAt,
          linkedFrom: entries
            .filter(
              (one) =>
                one.note.id !== entry.note.id &&
                !trashedIds.has(one.note.id) &&
                linksTo(one.note.content, entry.note.id),
            )
            .map((one) => titled(one.note.id)),
          linksTo: linksOut.map(titled),
        }}
        onOpenNote={openFromSheet}
        onOpenFolder={(folderId) => {
          setSheets([]);
          if (entry.note.ownerId && entry.note.ownerId !== viewAs)
            handleViewChange(entry.note.ownerId);
          handleSelectFolder(folderId);
        }}
        onOpenPerson={(userId, from) => pushSheet({ ...faceOrigin(from), kind: "person", userId })}
        onSetPhoto={
          canWriteArchive &&
          !trashedIds.has(entry.note.id) &&
          (lockHolders.get(entry.note.id) ?? session.userId) === session.userId
            ? (file, crop) => void handleNotePhoto(entry.note.id, file, crop)
            : undefined
        }
      />
    );
  }

  /* A folder and everything under it, counted the way the sidebar counts a
     closed one. */
  function renderFolderSheet(sheet: SheetOrigin & { folderId: string }, key: string) {
    if (!session) return null;
    const folders = activeMeta.folders;
    const folder = folders.find((one) => one.id === sheet.folderId);
    if (!folder) return null;
    const within = new Set([folder.id]);
    for (let grew = true; grew; ) {
      grew = false;
      for (const one of folders)
        if (one.parentId && within.has(one.parentId) && !within.has(one.id)) {
          within.add(one.id);
          grew = true;
        }
    }
    const index = indexOf(activeMeta);
    const notes = ownedEntries.filter((entry) => {
      const meta = index.byNote.get(entry.note.id);
      return !!meta?.folderId && within.has(meta.folderId) && !meta.trashedAt && !meta.archivedAt;
    });
    const threads = new Map<string, Set<string>>();
    for (const remark of archiveComments)
      if (!remark.resolvedAt && notes.some((entry) => entry.note.id === remark.noteId))
        threads.set(remark.noteId, (threads.get(remark.noteId) ?? new Set()).add(remark.threadId));
    const parent = folder.parentId ? folders.find((one) => one.id === folder.parentId) : undefined;
    const pushFolder = (folderId: string, from: Element) =>
      pushSheet({ ...faceOrigin(from), kind: "folder", folderId });
    return (
      <FolderSheet
        key={key}
        session={session}
        origin={sheet}
        personOf={personOf}
        folder={{
          id: folder.id,
          name: folder.name,
          parent: parent ? { id: parent.id, name: parent.name } : null,
          children: folders
            .filter((one) => one.parentId === folder.id)
            .map((one) => ({ id: one.id, name: one.name })),
          notes: notes.map((entry) => ({
            id: entry.note.id,
            title: entry.note.title,
            updatedAt: entry.note.updatedAt,
            words: derivedOf(entry.note).words,
          })),
          remarks: [...threads].map(([noteId, ids]) => ({
            noteId,
            title: entries.find((entry) => entry.note.id === noteId)?.note.title ?? "",
            threads: ids.size,
          })),
        }}
        onShowFolder={(folderId) => {
          setSheets([]);
          handleSelectFolder(folderId);
        }}
        onOpenFolder={pushFolder}
        onOpenNote={openFromSheet}
        onOpenPerson={(userId, from) => pushSheet({ ...faceOrigin(from), kind: "person", userId })}
      />
    );
  }

  /* The archive on screen: its people, its seats, who is waiting to come in.
     The current archive's faces come from the live roster rather than the
     list the switch loaded, so somebody joining appears here at once. */
  function renderArchiveSheet(sheet: SheetOrigin, key: string) {
    const space = spacesView.find((one) => one.archiveId === session?.archiveId);
    if (!session || !space) return null;
    const live = entries.filter((entry) => !trashedIds.has(entry.note.id));
    return (
      <ArchiveSheet
        key={key}
        origin={sheet}
        space={space}
        selfId={session.userId}
        avatarUrls={avatarUrls}
        notes={live.length}
        words={live.reduce((sum, entry) => sum + derivedOf(entry.note).words, 0)}
        invites={invites}
        onRename={async (name) => {
          await renameSpace(session, name);
          await refreshSpaces();
        }}
        onSeats={async (seats) => {
          await setSpaceSeats(session, seats);
          setSeatLimit(seats);
          await refreshSpaces();
        }}
        onOptions={saveDocumentOptions}
        onCreateInvite={inviteLink}
        onRevokeInvite={withdrawInvite}
        onOpenPerson={(userId, from) => pushSheet({ ...faceOrigin(from), kind: "person", userId })}
        onLeave={handleLeaveArchive}
        onDelete={handleDeleteArchive}
      />
    );
  }

  /* Who that is, and what they have been doing. Grown out of the face the
     hand held — see `.person-sheet` in the stylesheet — because a sheet that
     answers a gesture should look like it came from it. */
  function renderPersonSheet(sheet: SheetOrigin & { userId: string }, key: string) {
    if (!session) return null;
    const member = roster.find((one) => one.userId === sheet.userId);
    if (!member) return null;
    /* Where they are: the note open here is answered by awareness, which is
       certain; any other by the presence channel, which is opt-in. */
    const inHere = !member.isSelf && hereIds.has(member.userId) && selectedId;
    const elsewhere = flags.presence ? present.get(member.userId) : null;
    const nowId = member.isSelf ? null : inHere ? selectedId : (elsewhere ?? null);
    const nowEntry = nowId ? entries.find((entry) => entry.note.id === nowId) : undefined;
    return (
      <PersonSheet
        key={key}
        session={session}
        userId={member.userId}
        name={nameOf(member)}
        avatarUrl={avatarUrls[member.userId] ?? null}
        isSelf={member.isSelf}
        joinedAt={member.joinedAt}
        color={member.isSelf ? "var(--accent)" : presenceColor}
        noteCount={
          entries.filter(
            (entry) => entry.note.ownerId === member.userId && !trashedIds.has(entry.note.id),
          ).length
        }
        now={
          nowEntry
            ? {
                noteId: nowEntry.note.id,
                title: nowEntry.note.title,
                typing: flags.collaborators && typingIds.has(member.userId),
              }
            : null
        }
        origin={sheet}
        titleOf={(noteId) => entries.find((entry) => entry.note.id === noteId)?.note.title ?? null}
        onOpenNote={(noteId, withHistory) =>
          openFromSheet(noteId, withHistory ? { history: true } : undefined)
        }
        onSetAvatar={member.isSelf ? (file, crop) => void handleAvatarPick(file, crop) : undefined}
      />
    );
  }

  const sheetStack = session && sheets.length > 0 && (
    <SheetStack
      onBack={() => setSheets((stack) => stack.slice(0, -1))}
      onClose={() => setSheets([])}
    >
      {sheets.map((sheet, index) => {
        /* The place in the stack is part of the key: a folder's sheet can
           push its parent's, which may already be under it. */
        const key = `${index}:${sheet.kind}`;
        if (sheet.kind === "note") return renderNoteSheet(sheet, `${key}:${sheet.noteId}`);
        if (sheet.kind === "folder") return renderFolderSheet(sheet, `${key}:${sheet.folderId}`);
        if (sheet.kind === "archive") return renderArchiveSheet(sheet, key);
        if (sheet.kind === "new-archive")
          return (
            <NewArchiveSheet
              key={key}
              origin={sheet}
              onCreate={async (name, kind, features) => {
                const archiveId = await createSpace(
                  name,
                  kind,
                  kind === "document" ? features : undefined,
                );
                setSettingsOpen(false);
                await handleSwitchArchive(archiveId);
              }}
            />
          );
        return renderPersonSheet(sheet, `${key}:${sheet.userId}`);
      })}
    </SheetStack>
  );

  /* Asked for in Settings, or the window is on an archive that is not the
     first — the one an account starts with. Away from it, the switch is the
     only thing on screen saying which archive this is, and the way back. */
  const spaceSwitch = session &&
    (flags.spaceSwitch ||
      (spacesView.length > 0 && spacesView[0].archiveId !== session.archiveId)) && (
      <SpaceSwitch
        spaces={spacesView}
        currentId={session.archiveId}
        onSwitch={switchArchive}
        onInfo={(origin) => openSheet({ ...origin, kind: "archive" })}
        onCreate={(origin) => openSheet({ ...origin, kind: "new-archive" })}
      />
    );

  const viewedMember = members.find((member) => member.userId === viewAs);
  const sidebar = (
    <Sidebar
      onWhatsNew={() => {
        setFoldersOpen(false);
        setWhatsNewOpen(true);
      }}
      whatsNewUnseen={whatsNewUnseen}
      scopes={scopes}
      folders={activeMeta.folders}
      selectedId={selectedFolderId}
      canWrite={canWriteArchive}
      pinned={pinnedNotes}
      selectedNoteId={selectedId}
      onSelectNote={handleOpenRecent}
      onSelect={(id) => {
        handleSelectFolder(id);
        setFoldersOpen(false);
      }}
      onCreateFolder={handleCreateFolder}
      onRenameFolder={handleRenameFolder}
      onDeleteFolder={handleDeleteFolder}
      onFolderInfo={(folderId, origin) => openSheet({ ...origin, kind: "folder", folderId })}
      onClose={() => (compact ? setFoldersOpen(false) : changeNavigation(false))}
      closeInStrip={compact}
      onSettings={() => {
        setFoldersOpen(false);
        setSettingsOpen(true);
      }}
      onLock={handleLock}
      spaceSwitch={spaceSwitch}
      peopleShelf={peopleShelf}
      scopeLabel={viewedMember ? nameOf(viewedMember) : "My notes"}
    />
  );

  /* Whose notes the window is pointed at, said in the roster's own words. It
     used to read "Jacopo's notes" or the partner's, which was the last place
     in the interface still assuming an archive holds exactly two people. */
  const readingLabel = viewedMember ? notesOf(viewedMember) : "This archive";
  /* Only when it is somebody else's. Your own name under your own notes is the
     possessive the switch just stopped saying. */
  const scopeTag = viewedMember && !viewedMember.isSelf ? nameOf(viewedMember) : undefined;

  /* The document's page and options are the archive's: written for every
     member, from the bar, from the archive's sheet or from Settings alike. */
  function savePageSetup(next: PageSetup) {
    if (!session) return;
    setSpaces((current) =>
      current.map((space) =>
        space.archiveId === session.archiveId ? { ...space, page: next } : space,
      ),
    );
    void setPageSetup(session, next).catch((reason) =>
      setError(reason instanceof Error ? reason.message : "Could not set up the page"),
    );
  }

  async function saveDocumentOptions(kind: ArchiveKind, features: DocumentFeatures) {
    if (!session) return;
    if (kind !== currentSpace?.kind) await setSpaceKind(session, kind);
    await setDocumentFeatures(session, features);
    await refreshSpaces();
  }

  /* Both keyboard sheets travel with the settings panel, because both layouts
     mount that and neither wants a second copy of this. */
  const keyboardSheets = (
    <>
      <CommandPalette
        open={paletteOpen}
        commands={paletteCommands}
        search={paletteSearch}
        remote={paletteRemote}
        initialQuery={paletteQuery}
        onClose={() => setPaletteOpen(false)}
      />
      <ShortcutSheet
        open={shortcutsOpen}
        kind={docMode ? "document" : "notes"}
        onClose={() => setShortcutsOpen(false)}
      />
      <WhatsNewSheet open={whatsNewOpen} seen={flags.whatsNewSeen} onClose={closeWhatsNew} />
    </>
  );

  /* Mounted only while it is open, which is what makes the lazy import above
     worth anything: rendered always, with `open` false, it would fetch its
     chunk on the way to the first note. The panel drew nothing when closed
     anyway. */
  const settingsPanel = settingsOpen && (
    <Suspense fallback={null}>
      <SettingsPanel
        open={settingsOpen}
        initialSection={settingsSection}
        kind={docMode ? "document" : "notes"}
        document={
          docMode && currentSpace
            ? {
                features: docFeatures,
                page: currentSpace.page,
                disabled: !canWriteArchive,
                onOptions: (kind, features) => void saveDocumentOptions(kind, features),
                onPage: savePageSetup,
              }
            : undefined
        }
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
        presenceEnabled={flags.presence}
        collaboratorsVisible={flags.collaborators}
        profileBusy={profileBusy}
        profileError={profileError}
        onNicknameSave={(nickname) => void persistProfile({ ...profile, nickname })}
        onAvatarPick={(file, crop) => void handleAvatarPick(file, crop)}
        onAvatarRemove={() => void handleAvatarRemove()}
        onCreateInvite={async (email) => {
          return inviteLink(email);
        }}
        onRevokeInvite={withdrawInvite}
        onLeaveArchive={handleLeaveArchive}
        spaces={spacesView}
        currentArchiveId={session.archiveId}
        onSwitchArchive={async (archiveId) => {
          setSettingsOpen(false);
          await handleSwitchArchive(archiveId);
        }}
        onNewArchive={(from) => openSheet({ ...faceOrigin(from), kind: "new-archive" })}
        onPresenceEnabledChange={(presence) => changeFlags({ presence })}
        onCollaboratorsVisibleChange={(collaborators) => changeFlags({ collaborators })}
        spaceSwitchShown={flags.spaceSwitch}
        onSpaceSwitchShownChange={(spaceSwitch) => changeFlags({ spaceSwitch })}
        proofreaderEnabled={proofreaderEnabled}
        autocorrectEnabled={autocorrectEnabled}
        writingPreferences={writingPreferences}
        onProofreaderEnabledChange={(proofreader) => changeFlags({ proofreader })}
        onAutocorrectEnabledChange={(autocorrect) => changeFlags({ autocorrect })}
        onWritingPreferencesChange={setWritingPreferences}
        /* Straight through the one profile writer: this is a column on the row,
         and Postgres reads it back to decide what the other member may fetch. */
        onHideArchivedChange={(hideArchived) => void persistProfile({ ...profile, hideArchived })}
        onAutoLockChange={(autoLock) => changeFlags({ autoLock })}
        onClose={() => {
          setSettingsOpen(false);
          setSettingsSection(undefined);
        }}
        onLock={handleLock}
      />
    </Suspense>
  );

  /* What the header says about the note, beside the pill of things it can do:
     whether the last write landed. Who else is reading starts the header,
     beside the window navigation. */
  const noteStatus = selected ? (
    <span className="block min-w-0 truncate">
      {canWriteArchive ? saveReadout : <span className="readout text-ink-4">View only</span>}
    </span>
  ) : null;

  const notePresence = selected ? noteReaders : null;

  /* Adding a cover is one of the acts the note's own menu carries. Offered
     only while there is not one: a cover carries its own Change and Remove. */
  const addCover =
    selected && canWriteArchive && !selected.note.cover
      ? () =>
          void handleUpdatePageProperties({
            photo: selected.note.photo,
            cover: { kind: "preset", id: COVER_PRESETS[0].id, position: 0.5 },
          }).catch(() => undefined)
      : undefined;

  const noteActions = selected ? (
    <>
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
          lock={lockFor(selected.note.id)}
          pinned={pinned}
          folders={activeMeta.folders}
          recent={recentNotes}
          focusMode={focusMode}
          onToggleFocus={toggleFocus}
          onAddCover={addCover}
          onOpenBeside={() => {
            setPaletteQuery("beside ");
            setPaletteOpen(true);
          }}
          onCopyMarkdown={() => void handleCopyMarkdown(selected)}
          onExportMarkdown={() => handleExportMarkdown(selected)}
          onPrint={() => void platform().print()}
          onSavePdf={() => noteEditorRef.current?.savePdf()}
          onTogglePin={() => handleTogglePin(selected.note.id)}
          onFind={() => noteEditorRef.current?.openFind()}
          onHistory={() => noteEditorRef.current?.openHistory()}
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
        lock={lockFor(selected.note.id)}
        point={editorMenuPoint}
        onClose={() => setEditorMenuPoint(null)}
        pinned={pinned}
        folders={activeMeta.folders}
        recent={recentNotes}
        focusMode={focusMode}
        onToggleFocus={toggleFocus}
        onOpenBeside={() => {
          setPaletteQuery("beside ");
          setPaletteOpen(true);
        }}
        onCopyMarkdown={() => void handleCopyMarkdown(selected)}
        onExportMarkdown={() => handleExportMarkdown(selected)}
        onPrint={() => void platform().print()}
        onSavePdf={() => noteEditorRef.current?.savePdf()}
        onTogglePin={() => handleTogglePin(selected.note.id)}
        onFind={() => noteEditorRef.current?.openFind()}
        onHistory={() => noteEditorRef.current?.openHistory()}
        onMove={(folderId) => handleMoveNote(selected.note.id, folderId)}
        onRecent={handleOpenRecent}
        onDelete={() => handleMoveToTrash(selected)}
      />
    ) : null;

  /* ── The writing screen ───────────────────────────────────────────────────
     A document archive draws this instead of the notes: the structure where
     the folders and the list were, and the chapter on a page where the note
     was. Settings, sheets and the palette are the same ones. */
  if (docMode && manuscript) {
    const chapterAt = selected
      ? manuscript.chapters.findIndex((item) => item.id === selected.note.id)
      : -1;
    const chapter = manuscript.chapters[chapterAt];
    const partName = chapter?.folderId ? manuscript.parts.get(chapter.folderId) : undefined;
    const notebookName =
      viewedMember && !viewedMember.isSelf ? `${nameOf(viewedMember)}'s notebook` : "Notebook";
    const before = chapterAt > 0 ? manuscript.chapters[chapterAt - 1] : undefined;
    const after = chapterAt >= 0 ? manuscript.chapters[chapterAt + 1] : undefined;

    const openFromStructure = (id: string) => {
      handleSelectNote(id);
      if (compact) {
        setFoldersOpen(false);
        setMobileScreen("note");
      }
    };

    const turn =
      before || after ? (
        <nav className="manuscript-turn" aria-label="Chapters">
          {before ? (
            <button type="button" className="press" onClick={() => handleSelectNote(before.id)}>
              <ChevronLeft size={16} />
              <span>
                <small>Chapter {chapterAt}</small>
                {before.title || "Untitled"}
              </span>
            </button>
          ) : (
            <span />
          )}
          {after ? (
            <button
              type="button"
              className="press is-next"
              onClick={() => handleSelectNote(after.id)}
            >
              <span>
                <small>Chapter {chapterAt + 2}</small>
                {after.title || "Untitled"}
              </span>
              <ChevronRight size={16} />
            </button>
          ) : null}
        </nav>
      ) : null;

    const chapterItems: MenuItem[] = selected
      ? [
          {
            kind: "item",
            id: "history",
            label: "Versions…",
            icon: <History size={16} />,
            run: () => noteEditorRef.current?.openHistory(),
          },
          {
            kind: "item",
            id: "focus",
            label: focusMode ? "Leave focus mode" : "Focus mode",
            hint: keyName("⌘."),
            icon: <Maximize2 size={16} />,
            run: toggleFocus,
          },
          { kind: "separator" },
          { kind: "label", label: chapterAt >= 0 ? "This chapter" : "This page" },
          {
            kind: "item",
            id: "pdf",
            label: "Save as PDF",
            icon: <FileDown size={16} />,
            run: () => noteEditorRef.current?.savePdf(),
          },
          {
            kind: "item",
            id: "docx",
            label: "Save as Word",
            icon: <FileText size={16} />,
            run: () => noteEditorRef.current?.saveDocx(),
          },
          {
            kind: "item",
            id: "print",
            label: "Print…",
            icon: <Printer size={16} />,
            run: () => void platform().print(),
          },
          {
            kind: "item",
            id: "markdown",
            label: "Copy as Markdown",
            icon: <Copy size={16} />,
            run: () => void handleCopyMarkdown(selected),
          },
          ...(canWriteArchive
            ? [
                { kind: "separator" as const },
                {
                  kind: "item" as const,
                  id: "trash",
                  label: "Move to Trash",
                  danger: true,
                  icon: <Trash2 size={16} />,
                  run: () => handleTrashDocNote(selected.note.id),
                },
              ]
            : []),
        ]
      : [];

    const docActions = selected ? (
      <>
        <PageSetupButton page={page} disabled={!canWriteArchive} onChange={savePageSetup} />
        <WritingMenuButton label="Chapter actions" items={chapterItems} />
      </>
    ) : null;

    const structure = (
      <StructurePane
        header={
          <>
            <div
              className={`sidebar-topbar flex h-13 shrink-0 items-center gap-2 px-2 ${
                compact ? "has-close" : ""
              }`}
            >
              {compact && (
                <button
                  type="button"
                  onClick={() => setFoldersOpen(false)}
                  aria-label="Close the structure"
                  className="toolbar-button press shrink-0"
                >
                  <X size={16} />
                </button>
              )}
            </div>
            <div className="structure-people">
              {spaceSwitch}
              {peopleShelf}
            </div>
          </>
        }
        footer={
          <div className="sidebar-footer">
            <WritingMenuButton
              label="Trash"
              className="sidebar-footer-button press"
              icon={
                <span className="sidebar-glyph" data-tone="trash">
                  <Trash2 size={16} />
                </span>
              }
              items={trashItems(
                docTrash.map((entry) => ({ id: entry.note.id, title: entry.note.title })),
                handleRestoreDocNote,
                (id) => {
                  const entry = docTrash.find((one) => one.note.id === id);
                  if (entry) void deleteForever([entry]);
                },
              )}
            >
              <span>Trash</span>
              {docTrash.length > 0 && <small className="ml-auto">{docTrash.length}</small>}
            </WritingMenuButton>
            <WhatsNewButton
              unseen={whatsNewUnseen}
              onOpen={() => {
                setFoldersOpen(false);
                setWhatsNewOpen(true);
              }}
            />
            <button
              type="button"
              className="sidebar-footer-button press"
              onClick={() => {
                setFoldersOpen(false);
                setSettingsOpen(true);
              }}
            >
              <span className="sidebar-glyph" data-tone="settings">
                <Settings size={16} />
              </span>
              <span>Settings</span>
            </button>
          </div>
        }
        documentName={currentSpace?.name ?? ""}
        total={manuscript.total}
        goal={docFeatures.wordGoal}
        rows={manuscript.rows}
        parts={manuscript.parts}
        notebook={manuscript.notebook}
        notebookName={notebookName}
        selectedId={selectedId}
        canWrite={canWriteArchive}
        onOpen={openFromStructure}
        onNewChapter={handleNewChapter}
        onNewPart={handleNewPart}
        onNewNote={() => void createDocNote(null)}
        onRenamePart={handleRenamePart}
        onDeletePart={handleDeletePart}
        onMove={handleMoveChapter}
        onTrash={handleTrashDocNote}
        onInfo={(id, point) =>
          openSheet({ x: point.x, y: point.y, width: 1, height: 1, kind: "note", noteId: id })
        }
        headings={contents.find((entry) => entry.id === selectedId)?.headings}
        stats={
          statsShown
            ? {
                today: wordsToday,
                session:
                  manuscript.total - (sessionStart.get(session.archiveId) ?? manuscript.total),
              }
            : undefined
        }
        onHeading={(text) => selectedId && openPlace({ noteId: selectedId, text })}
      />
    );

    /* What the page shows when no chapter is open: the title page, which
       says what the document is and where you stopped. */
    const lastChapter = [...manuscript.chapters].sort(
      (a, b) =>
        Date.parse(entries.find((e) => e.note.id === b.id)?.note.updatedAt ?? "") -
        Date.parse(entries.find((e) => e.note.id === a.id)?.note.updatedAt ?? ""),
    )[0];
    const titlePage = (
      <section className="editor-shell manuscript-shell flex min-w-0 flex-1 flex-col">
        <div className="manuscript-bar shrink-0">
          {!navigationOpen && !compact && (
            <button
              type="button"
              onClick={() => changeNavigation(true)}
              aria-label="Show the structure"
              className="ribbon-tool press"
            >
              <PanelLeftOpen size={16} />
            </button>
          )}
          {compact && (
            <button
              type="button"
              onClick={() => setFoldersOpen(true)}
              aria-label="Structure"
              className="ribbon-tool press"
            >
              <Structure size={18} />
            </button>
          )}
        </div>
        <div className="manuscript-desk min-h-0 flex-1">
          <article
            className="manuscript-sheet is-title-page"
            style={pageStyle(page)}
            data-tone={writingPreferences.sheetTone}
          >
            <h1>{currentSpace?.name}</h1>
            <p>
              {manuscript.chapters.length === 1
                ? "1 chapter"
                : `${manuscript.chapters.length} chapters`}
              {" · "}
              {manuscript.total.toLocaleString()}
              {docFeatures.wordGoal ? ` of ${docFeatures.wordGoal.toLocaleString()}` : ""} words
            </p>
            {lastChapter ? (
              <button
                type="button"
                className="manuscript-continue press"
                onClick={() => openFromStructure(lastChapter.id)}
              >
                Continue “{lastChapter.title || "Untitled"}”
              </button>
            ) : (
              canWriteArchive && (
                <button
                  type="button"
                  className="manuscript-continue press"
                  onClick={() => handleNewChapter(null)}
                >
                  Begin the first chapter
                </button>
              )
            )}
            {manuscript.chapters.length > 0 && (
              <ContentsList
                entries={contents}
                onOpen={(noteId, text) => openPlace({ noteId, text })}
              />
            )}
          </article>
        </div>
      </section>
    );

    const chapterEditor = selected ? (
      <Suspense fallback={<div className="manuscript-shell min-w-0 flex-1" />}>
        <NoteEditor
          ref={noteEditorRef}
          key={selected.note.id}
          mobile={compact}
          entry={selected}
          syncRevision={syncRevision}
          canEdit={canEdit}
          lock={lockFor(selected.note.id)}
          proofreaderEnabled={proofreaderEnabled}
          autocorrectEnabled={autocorrectEnabled}
          viewingAsPartner={false}
          partnerName={partnerName}
          titleRef={titleRef}
          onEdited={handleEdited}
          onNew={() => handleNewChapter(null)}
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
                  provider: flags.collaborators ? collaborative.provider : null,
                }
              : null
          }
          headerStatus={noteStatus}
          headerLead={
            <>
              {compact ? (
                <button
                  type="button"
                  onClick={() => {
                    setMobileScreen("collection");
                    setFoldersOpen(true);
                  }}
                  aria-label="Structure"
                  className="ribbon-tool press"
                >
                  <Structure size={18} />
                </button>
              ) : (
                !navigationOpen && (
                  <button
                    type="button"
                    onClick={() => changeNavigation(true)}
                    aria-label="Show the structure"
                    title={"Show the structure · ⌘\\"}
                    className="ribbon-tool press"
                  >
                    <PanelLeftOpen size={16} />
                  </button>
                )
              )}
            </>
          }
          headerActions={<>{docActions}</>}
          synced={collaborative.ready}
          session={session}
          commentAuthors={commentAuthors}
          linkable={linkableNotes}
          onOpenNote={handleOpenRecent}
          manuscript={{
            page,
            eyebrow:
              chapterAt >= 0
                ? [partName, `Chapter ${chapterAt + 1}`].filter(Boolean).join(" · ")
                : notebookName,
            footer: turn,
            footnotes: docFeatures.footnotes,
            numbered: docFeatures.numbering && chapterAt >= 0 ? chapterAt + 1 : null,
            writing: {
              focus: focusMode ? writingPreferences.focusScope : "off",
              typewriter: writingPreferences.typewriter,
            },
            topLevel: topLevel(headingsOf(selected.note.content).map((heading) => heading.level)),
          }}
        />
      </Suspense>
    ) : (
      titlePage
    );

    if (compact)
      return (
        <div
          className="mobile-workspace writing-shell overflow-hidden"
          style={{ height: "100dvh" }}
        >
          <main
            className="h-full overflow-hidden"
            style={{ paddingTop: "env(safe-area-inset-top)" }}
          >
            {chapterEditor}
          </main>
          {foldersOpen && (
            <div className="mobile-nav-layer" role="presentation">
              <button
                type="button"
                aria-label="Close the structure"
                className="settings-scrim"
                onClick={() => setFoldersOpen(false)}
              />
              <div className="mobile-nav-drawer">{structure}</div>
            </div>
          )}
          {settingsPanel}
          {keyboardSheets}
          {sheetStack}
        </div>
      );

    const structureWidth = Math.max(sidebarShown, 272);
    return (
      <div
        className={`workspace-shell writing-shell h-screen overflow-hidden ${
          focusMode ? "is-focus" : ""
        } ${focusMode && quiet ? "is-quiet" : ""}`}
      >
        <div className="workspace-grid flex h-full min-h-0">
          <div
            className={`pane-slide ${navigationOpen ? "" : "is-collapsed"}`}
            style={{ width: navigationOpen ? structureWidth + 1 : 0 }}
            aria-hidden={!navigationOpen}
            inert={!navigationOpen}
          >
            <div
              className="pane-slide-track flex h-full min-h-0"
              style={{ width: structureWidth + 1 }}
            >
              <div className="pane-frame" style={{ width: structureWidth }}>
                {structure}
              </div>
              <PaneResizer
                label="Resize the structure"
                value={structureWidth}
                min={272}
                max={sidebarMax}
                defaultValue={SIDEBAR_DEFAULT}
                onChange={setSidebarWidth}
              />
            </div>
          </div>
          {chapterEditor}
        </div>
        {settingsPanel}
        {keyboardSheets}
        {sheetStack}
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
                      <FolderTree size={20} />
                    </button>
                    <button
                      type="button"
                      aria-label="Settings"
                      className="toolbar-button press shrink-0"
                      onClick={() => setSettingsOpen(true)}
                    >
                      <Settings size={20} />
                    </button>
                    <span className="ml-auto flex min-w-0">{archiveSwitch}</span>
                  </div>
                </header>
                {/* Keyed on the scope, so changing whose notes these are re-runs
                    the list's own entrance instead of swapping the rows in
                    place. Nothing is lost by the remount: `handleViewChange`
                    already clears the query, the folder and the selection. */}
                <NoteList
                  key={viewAs}
                  archiveId={session.archiveId}
                  mobile
                  entries={visible}
                  groups={noteGroups}
                  view="gallery"
                  toolbarActions={collectionActions}
                  filters={activeFilters}
                  meta={activeMeta}
                  showFolder={!activeMeta.folders.some((folder) => folder.id === selectedFolderId)}
                  selectedId={selectedId}
                  query={query}
                  loading={loading}
                  busy={saving}
                  canWrite={canWriteArchive}
                  folderLabel={folderLabel}
                  scopeLabel={scopeTag}
                  trashMode={selectedFolderId === TRASH}
                  unreadIds={unreadRemarkNotes}
                  peerNoteIds={peerNoteIds}
                  peerColor={presenceColor}
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
                  lockOf={lockFor}
                  onInfo={(noteId, origin) => openSheet({ ...origin, kind: "note", noteId })}
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
                    lock={selected ? lockFor(selected.note.id) : undefined}
                    startWithComments={selectedFolderId === REMARKS}
                    proofreaderEnabled={proofreaderEnabled}
                    autocorrectEnabled={autocorrectEnabled}
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
                            provider: flags.collaborators ? collaborative.provider : null,
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
                    headerStatus={noteStatus}
                    headerPresence={notePresence}
                    headerActions={noteActions}
                    synced={collaborative.ready}
                    session={session}
                    commentAuthors={commentAuthors}
                    linkable={linkableNotes}
                    backlinks={backlinks}
                    onOpenNote={handleOpenRecent}
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
        {sheetStack}
      </div>
    );
  }

  return (
    <div
      className={`workspace-shell h-screen overflow-hidden ${focusMode ? "is-focus" : ""} ${
        focusMode && quiet ? "is-quiet" : ""
      }`}
    >
      <DndContext
        key="desktop-dnd"
        sensors={sensors}
        onDragStart={(e: DragStartEvent) => setDragId(e.active.id as string)}
        onDragCancel={() => setDragId(null)}
        onDragEnd={handleDragEnd}
      >
        <div className="workspace-grid flex h-full min-h-0">
          {/* Held open and closed, never thrown away.
              `⌘\` used to mount and unmount these two columns, so the whole
              left side of the window appeared and vanished between one frame
              and the next — and because there is nothing to animate on the way
              out of a component that no longer exists, no amount of easing
              could have softened it. Mounted always, the pair slides as one
              piece — see `changeNavigation` for how. The track's width never
              changes, which is what stops every folder name and every note
              title reflowing while it goes.

              Clipped only while it is away. The sidebar's own menu is wider
              than the column it hangs in — 14.5rem against a 248px minimum —
              so a clip that was always on would cut it in half whenever
              somebody narrowed the pane. Closing, there is nothing left to
              cut; opening, the track is off to the left of the window and the
              window clips it for us. */}
          <div
            className={`pane-slide ${navigationOpen ? "" : "is-collapsed"}`}
            style={{ width: navigationOpen ? sidebarShown + listShown + 2 : 0 }}
            aria-hidden={!navigationOpen}
            inert={!navigationOpen}
          >
            <div
              className="pane-slide-track flex h-full min-h-0"
              style={{ width: sidebarShown + listShown + 2 }}
            >
              <div className="pane-frame" style={{ width: sidebarShown }}>
                {sidebar}
              </div>
              <PaneResizer
                label="Resize folders sidebar"
                value={sidebarShown}
                min={SIDEBAR_MIN}
                max={sidebarMax}
                defaultValue={SIDEBAR_DEFAULT}
                onChange={setSidebarWidth}
              />
              <div
                className="pane-frame"
                data-scope-direction={scopeDirection ?? undefined}
                style={{ width: listShown }}
              >
                {/* Keyed on the scope, so changing whose notes these are re-runs
                    the list's own entrance instead of swapping the rows in
                    place. Nothing is lost by the remount: `handleViewChange`
                    already clears the query, the folder and the selection. */}
                <NoteList
                  key={viewAs}
                  archiveId={session.archiveId}
                  entries={visible}
                  groups={noteGroups}
                  view="list"
                  leading={sidebarToggle}
                  toolbarActions={collectionActions}
                  filters={activeFilters}
                  meta={activeMeta}
                  showFolder={!activeMeta.folders.some((folder) => folder.id === selectedFolderId)}
                  selectedId={selectedId}
                  query={query}
                  loading={loading}
                  busy={saving}
                  canWrite={canWriteArchive}
                  folderLabel={folderLabel}
                  scopeLabel={scopeTag}
                  trashMode={selectedFolderId === TRASH}
                  unreadIds={unreadRemarkNotes}
                  peerNoteIds={peerNoteIds}
                  peerColor={presenceColor}
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
                  lockOf={lockFor}
                  onInfo={(noteId, origin) => openSheet({ ...origin, kind: "note", noteId })}
                  onMoveToFolder={handleMoveNote}
                  onSetPhoto={handleNotePhoto}
                  resolveImage={resolveImage}
                />
              </div>
              <PaneResizer
                label="Resize notes list"
                value={listShown}
                min={LIST_MIN}
                max={listMax}
                defaultValue={LIST_DEFAULT}
                onChange={setListWidth}
              />
            </div>
          </div>

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
              lock={selected ? lockFor(selected.note.id) : undefined}
              startWithComments={selectedFolderId === REMARKS}
              proofreaderEnabled={proofreaderEnabled}
              autocorrectEnabled={autocorrectEnabled}
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
                      provider: flags.collaborators ? collaborative.provider : null,
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
                    {/* With the columns away this strip is the only chrome in
                        the window, so it carries what the columns did: getting
                        them back, a new note, and finding one — the three acts
                        nobody should have to reopen a column for. One capsule,
                        like every group of toolbar items here. */}
                    <span className="editor-tool-group glass-toolbar flex items-center">
                      <button
                        type="button"
                        onClick={() => changeNavigation(true)}
                        aria-label="Show the sidebar"
                        title={"Show the sidebar · ⌘\\"}
                        className="toolbar-button press"
                      >
                        <PanelLeftOpen size={18} />
                      </button>
                      {canWriteArchive && (
                        <button
                          type="button"
                          onClick={handleNew}
                          aria-label="New note"
                          title="New note · ⌘N"
                          className="toolbar-button press"
                        >
                          <SquarePen size={18} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setPaletteQuery("");
                          setPaletteOpen(true);
                        }}
                        aria-label="Search notes"
                        title="Search · ⌘K"
                        className="toolbar-button press"
                      >
                        <Search size={18} />
                      </button>
                    </span>
                  </>
                ) : null
              }
              headerStatus={noteStatus}
              /* The faces on the sidebar's shelf say who is here and who is
                 writing; the header does not say it a second time. */
              headerPresence={null}
              headerActions={noteActions}
              synced={collaborative.ready}
              session={session}
              commentAuthors={commentAuthors}
              linkable={linkableNotes}
              backlinks={backlinks}
              onOpenNote={handleOpenRecent}
            />
          </Suspense>

          {/* The second note. It closes itself and does nothing else from its
              own header: one note is the one you are working in, and giving
              both a full set of page controls would mean two of everything
              claiming to be the note. */}
          {splitEntry && (
            <>
              <div className="split-seam" />
              <Suspense fallback={<div className="soft-pane pane-page min-w-0 flex-1" />}>
                <NoteEditor
                  key={`split:${splitEntry.note.id}`}
                  entry={splitEntry}
                  syncRevision={syncRevision}
                  canEdit={splitCanEdit(splitEntry.note.id)}
                  lock={lockFor(splitEntry.note.id)}
                  proofreaderEnabled={proofreaderEnabled}
                  autocorrectEnabled={autocorrectEnabled}
                  viewingAsPartner={viewAs === "u2"}
                  partnerName={partnerName}
                  titleRef={splitTitleRef}
                  onEdited={handleSplitEdited}
                  onNew={handleNew}
                  onImportMarkdown={() => importRef.current?.click()}
                  onUploadImage={handleUploadImage}
                  onUploadFile={handleUploadFile}
                  resolveImage={resolveImage}
                  resolveFile={resolveFile}
                  onUpdatePageProperties={handleUpdatePageProperties}
                  collaboration={
                    (splitCollaborative.ready || splitCollaborative.cached) &&
                    splitCollaborative.doc
                      ? { document: splitCollaborative.doc, provider: null }
                      : null
                  }
                  synced={splitCollaborative.ready}
                  session={session}
                  linkable={linkableNotes}
                  onOpenNote={handleOpenRecent}
                  headerActions={
                    <button
                      type="button"
                      onClick={() => setSplitId(null)}
                      aria-label="Close the second note"
                      title="Close the second note"
                      className="toolbar-button press"
                    >
                      <X size={16} />
                    </button>
                  }
                />
              </Suspense>
            </>
          )}
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
      {sheetStack}
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
