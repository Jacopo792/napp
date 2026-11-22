import { ArchiveSheet, NewArchiveSheet } from "@/components/ArchiveSheet";
import { ChapterBoard } from "@/components/ChapterBoard";
import { CommandPalette, ShortcutSheet } from "@/components/CommandPalette";
import { FolderSheet } from "@/components/FolderSheet";
import { GoogleDriveImport } from "@/components/GoogleDriveImport";
import {
  Board,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileDown,
  FileText,
  FolderTree,
  History,
  Maximize2,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Printer,
  Search,
  Settings,
  SquarePen,
  Structure,
  Trash2,
  X,
} from "@/components/icons";
import { NoteList, type ActiveFilter, type PeerFace } from "@/components/NoteList";
import { NoteSheet } from "@/components/NoteSheet";
import { PaneResizer } from "@/components/PaneResizer";
import { PersonSheet } from "@/components/PersonSheet";
import { removeBlockedMember } from "@/lib/storeSafety";
import type { SettingsSection } from "@/components/settingsSections";
import { SheetStack } from "@/components/Sheet";
import { Sidebar, type Scope } from "@/components/Sidebar";
import { SpaceSwitch } from "@/components/SpaceSwitch";
import { SpotlightLesson } from "@/components/SpotlightLesson";
import { StructurePane, type ChapterItem, type StructureTarget } from "@/components/StructurePane";
import { TrashSheet } from "@/components/TrashSheet";
import { UpdateNotice } from "@/components/UpdateNotice";
import { Avatar, CollectionMenu, NoteContextMenu, NoteMenu } from "@/components/WorkspaceMenus";
import { PageSetupButton, MenuButton as WritingMenuButton } from "@/components/WritingMenus";
import { MemberPresenceCard } from "@/features/editor/components/MemberPresenceCard";
import type { NoteEditorHandle } from "@/features/editor/components/NoteEditor";
import { attachmentType } from "@/features/editor/lib/attachments";
import {
  EMPTY_RICH_TEXT,
  RICH_TEXT_VERSION,
  richTextToPlainText,
} from "@/features/editor/lib/content";
import {
  clearDrafts,
  dropDraft,
  ensureDraft,
  isDirty,
  readDraft,
  replaceDraft,
} from "@/features/editor/lib/draft";
import { exportFileName } from "@/features/editor/lib/exchange";
import {
  DEFAULT_FLAGS,
  flagsOf,
  heldRemarksSeen,
  localPreferences,
  mergeRemarksSeen,
  preferencesWith,
  pullAccountPreferences,
  pushAccountPreferences,
  subscribeToAccountPreferences,
  unsubscribeFromAccountPreferences,
  watchLocalStores,
  type AccountFlags,
} from "@/lib/accountPreferences";
import { departArchive, enterArchive, type ArchiveDeparture } from "@/lib/archiveExit";
import { useAutoLock } from "@/lib/autoLock";
import { acquireAvatarUrl, invalidateAvatarUrl } from "@/lib/avatarCache";
import { captureNote, takeCapture } from "@/lib/capture";
import { useCollaborationPeers, useCollaborativeNote, wakeCollaboration } from "@/lib/collab";
import type { NoteRef, RemarksSeen } from "@/lib/comments";
import type { MenuPoint } from "@/lib/contextMenu";
import { derivedOf, indexOf, linkedNoteIds, linksTo, mentionOf } from "@/lib/derived";
import { OPEN_PLACE, openPlace, type Place, type PlaceRequest } from "@/lib/documentContents";
import { mergeRemoteEntries, type NoteEntry } from "@/lib/entries";
import { FOLDER_DRAG, moveFolder } from "@/lib/folderOrder";
import { fold } from "@/lib/format";
import { loadContributions, loadNamedVersions, type NamedVersion } from "@/lib/history";
import { prepareAvatar, prepareImageForNote, type AvatarCrop } from "@/lib/image";
import {
  createListPreferences,
  groupEntries,
  loadListPreferences,
  preferencesForFolder,
  rememberRecent,
  saveListPreferences,
  type ListPreferences,
  type ListPreferencesV1,
} from "@/lib/listPreferences";
import { intoPart, manuscriptOf, moveTo, positionBetween, topLevel } from "@/lib/manuscript";
import { forgetStoredImage, useIsCompact, useWindowWidth } from "@/lib/media";
import { readableMedia } from "@/lib/mediaTextShape";
import type { MenuItem } from "@/lib/menuShape";
import { MetaQueue, keepLockedNotes, noteMoves } from "@/lib/metaQueue";
import { aimNote, captureRows, markPinned, sendNotes, settleBack, turnView } from "@/lib/motion";
import { COVER_PRESETS } from "@/lib/pageProperties";
import { LIST_DEFAULT, LIST_MIN, SIDEBAR_DEFAULT, SIDEBAR_MIN } from "@/lib/paneLayout";
import { ALL, ARCHIVE, REMARKS, TRASH, UNFILED } from "@/lib/scopes";
import {
  addAccount,
  chooseArchive,
  clearSession,
  otherAccounts,
  restoreSession,
  switchAccount,
  type AppSession,
} from "@/lib/session";
import { SESSION_KEY } from "@/lib/sessionRestore";
import { keyName, windowCommand } from "@/lib/shortcuts";
import {
  createSpace,
  deleteSpace,
  loadSpaces,
  renameSpace,
  setDocumentFeatures,
  setPageSetup,
  setSpaceKind,
  setSpaceSeats,
  type Space,
} from "@/lib/spaces";
import {
  ARCHIVE_PRESETS,
  DEFAULT_FEATURES,
  DEFAULT_PAGE,
  withLiveRoster,
  type ArchiveKind,
  type DocumentFeatures,
  type PageSetup,
} from "@/lib/spaceShape";
import { headingsOf, snippetOf } from "@/lib/spotlight";
import {
  createNote,
  deleteAvatar,
  deleteNotes,
  downloadImage,
  downloadObject,
  leaveArchive,
  loadArchive,
  loadProfile,
  persistMetaDiff,
  saveProfile,
  updateNoteProperties,
  uploadAvatar,
  uploadImage,
  uploadObject,
  type ArchiveMember,
  type ArchiveSnapshot,
  type Profile,
} from "@/lib/supabase";
import { subscribeToArchive, unsubscribeFromArchive } from "@/lib/sync";
import { isTemplateFolder } from "@/lib/templates";
import { EMPTY_META, type Meta, type Note, type NoteLock, type NoteMeta } from "@/lib/types";
import { visibleEntries } from "@/lib/visibleNotes";
import {
  CURRENT_RELEASE,
  compareVersions,
  laterVersion,
  rememberSpotlightLearned,
  rememberWhatsNewSeen,
} from "@/lib/whatsNew";
import { RETRY_MIN_MS, waitUntilIdle } from "@/lib/writeDrain";
import {
  presencePaletteFor,
  setWritingPreferences,
  useWritingPreferences,
} from "@/lib/writingPreferences";
import { platform } from "@/platform";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  type DropAnimationFunction,
} from "@dnd-kit/core";
import { useNavigate } from "@tanstack/react-router";
import type { JSONContent } from "@tiptap/core";
import {
  Suspense,
  cloneElement,
  lazy,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { useArchiveInvites } from "./useArchiveInvites";
import { useArchiveRemarks } from "./useArchiveRemarks";
import { useArchiveWrites, writesWaiting } from "./useArchiveWrites";
import { useDocumentReferences } from "./useDocumentReferences";
import { useMediaIndexing } from "./useMediaIndexing";
import { useNoteExchange } from "./useNoteExchange";
import { useNotesLayout } from "./useNotesLayout";
import { usePresence } from "./usePresence";
import { workspacePalette } from "./workspacePalette";
/* Lazily, and only once it is opened. Settings is one panel behind one button
   that nobody presses on the way to a note, and it was riding in the same
   chunk as the archive. */
const SettingsPanel = lazy(() =>
  import("@/components/SettingsPanel").then((module) => ({ default: module.SettingsPanel })),
);

const BOOK_PRESET = ARCHIVE_PRESETS.find((preset) => preset.id === "book")!;
const SWITCH_KEYS = ["numbering", "footnotes", "citations", "review"] as const;

/** One sheet in the stack: what it is about. */
type SheetEntry =
  | { kind: "note"; noteId: string }
  | { kind: "person"; userId: string }
  | { kind: "folder"; folderId: string }
  /* Without an id, the archive on screen; with one, any its maker edits. */
  | { kind: "archive"; archiveId?: string; fromSettings?: boolean }
  | { kind: "new-archive"; fromSettings?: boolean }
  | { kind: "trash" };

const NoteEditor = lazy(() =>
  import("@/features/editor/components/NoteEditor").then((m) => ({ default: m.NoteEditor })),
);
/* The archive's general chat: the note chat with no note under it. */
const GeneralChat = lazy(() =>
  import("@/features/editor/components/NoteComments").then((m) => ({ default: m.NoteComments })),
);
const NO_QUOTES = new Map<string, string>();
const nothing = () => undefined;

/* How long a press has to be held before it stops being a press and becomes a
   question. Long enough not to fire on a slow tap, short enough that nobody
   wonders whether it is going to. */
const HOLD_MS = 420;

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

/** What fades: the screen together with the wallpaper behind it. Fading the
 *  screen alone uncovered the picture at full strength for a beat — a book
 *  hides it behind an opaque page — and the window flashed it between two
 *  archives. Between them now is only the window's own surface. */
const switchLayer = () => document.getElementById("root");

/** Fades the screen out, and resolves even in a window too hidden to animate. */
function leaveScreen(): Promise<void> {
  const layer = switchLayer();
  if (!layer || !shellElement() || stillMotion()) return Promise.resolve();
  const fade = layer.animate([{ opacity: 1 }, { opacity: 0 }], { ...SWITCH_OUT, fill: "forwards" });
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
  const [seatLimit, setSeatLimit] = useState(8);
  /** Every archive this account is in, for the switch and its sheet. */
  const [spaces, setSpaces] = useState<Space[]>(knownSpaces);

  const [entries, setEntries] = useState<NoteEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string>(ALL);
  const [query, setQuery] = useState("");
  const [driveDestination, setDriveDestination] = useState<string | null>(null);

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
  /* A write that did not land, which the readout offers to retry, apart from
     every other failure: those say what went wrong for a moment and go. One
     slot for both read an import or a refused clipboard as "Save failed". */
  const [saveError, setSaveError] = useState("");
  const [error, setError] = useState("");
  const {
    mediaTexts,
    indexingMedia,
    indexMedia: indexAttachments,
  } = useMediaIndexing(session, setError, setStatusFlash);

  const [dragId, setDragId] = useState<string | null>(null);
  const {
    navigationOpen,
    changeNavigation,
    focusMode,
    toggleFocus,
    setDockedPanel,
    listOpen,
    sidebarShown,
    listShown,
    sidebarMax,
    listMax,
    setSidebarWidth,
    setListWidth,
  } = useNotesLayout(windowWidth, compact);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  /* Named versions, for ⌘K: read when the palette opens, because a name is
     given rarely and the list is a request the archive's own load does not make. */
  const [namedVersions, setNamedVersions] = useState<NamedVersion[]>([]);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
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
  const [scopeDirection, setScopeDirection] = useState<"next" | "previous" | null>(null);
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
    reveal?: Place;
  } | null>(null);

  /* A hold, and the two refs it needs. The timer is one, because it has to be
     cancelled by a hand that moved away; and whether it fired is the other,
     because the press that ends a hold is still a press and would throw the
     switch on its way out. */
  const holdRef = useRef<number | undefined>(undefined);
  const heldRef = useRef(false);

  function holdStart(event: React.PointerEvent, userId: string) {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    heldRef.current = false;
    window.clearTimeout(holdRef.current);
    holdRef.current = window.setTimeout(() => {
      heldRef.current = true;
      openSheet({ kind: "person", userId });
    }, HOLD_MS);
  }

  function holdEnd() {
    window.clearTimeout(holdRef.current);
  }

  useEffect(() => () => window.clearTimeout(holdRef.current), []);

  /** The phone has no room for a permanent sidebar, so it gets the same one
   *  as a drawer — the destinations are identical, only the staging differs. */
  const [foldersOpen, setFoldersOpen] = useState(false);
  /* The chapters as cards in place of the page — a document's corkboard. */
  const [boardOpen, setBoardOpen] = useState(false);
  /* The page left, read while the next one renders — so a chapter knows
     whether it was turned to forwards or back. */
  const lastOpened = useRef<string | null>(null);
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
  /* New takes the selection before its INSERT finishes, so typing cannot
     reach the previous note. Only join collaboration once the catalogue has
     the saved row: the server correctly refuses an id that does not exist yet,
     and that refusal otherwise stays cached in the held provider. */
  const collaborativeId = useMemo(
    () => (entries.some((entry) => entry.note.id === selectedId) ? selectedId : null),
    [entries, selectedId],
  );
  const collaborative = useCollaborativeNote(collaborativeId, collaborationIdentity);
  /* Awareness is per document, so the second note announces you on the second
     note and nowhere else. It used to be told not to announce at all, back when
     presence was one archive-wide channel carrying a single `noteId` that two
     open editors would have spent the session arguing over. */
  const splitCollaborative = useCollaborativeNote(splitId, collaborationIdentity);
  /* Who is on this note, asked of the note's own document rather than of a
     second channel that has to be told which note that is. A peer in this
     list is connected to this note by construction. */
  const notePeers = useCollaborationPeers(collaborative.provider, session?.userId ?? null);

  /* Follow: keep one collaborator's caret in view while they write — Figma's
     and Google Docs' follow. It ends the moment the reader takes the page
     back (a wheel, a touch, a key), when the person leaves the note, or when
     the note changes: following is something you are doing now, not a
     setting. */
  const [following, setFollowing] = useState<string | null>(null);
  useEffect(() => setFollowing(null), [selectedId]);
  useEffect(() => {
    if (following && !notePeers.some((peer) => peer.userId === following)) setFollowing(null);
  }, [following, notePeers]);
  useEffect(() => {
    const awareness = collaborative.provider?.awareness;
    if (!following || !awareness) return;
    let frame = 0;
    const chase = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const caret = document.querySelector<HTMLElement>(
          `.rich-text-content [data-caret-user="${CSS.escape(following)}"]`,
        );
        if (!caret) return;
        const box = caret.getBoundingClientRect();
        if (box.top < 80 || box.bottom > window.innerHeight - 80)
          caret.scrollIntoView({ block: "center", behavior: "smooth" });
      });
    };
    const stop = () => setFollowing(null);
    const keys = (event: KeyboardEvent) => {
      if (!event.metaKey && !event.ctrlKey) stop();
    };
    chase();
    awareness.on("change", chase);
    window.addEventListener("wheel", stop, { passive: true });
    window.addEventListener("touchmove", stop, { passive: true });
    window.addEventListener("keydown", keys);
    return () => {
      cancelAnimationFrame(frame);
      awareness.off("change", chase);
      window.removeEventListener("wheel", stop);
      window.removeEventListener("touchmove", stop);
      window.removeEventListener("keydown", keys);
    };
  }, [following, collaborative.provider]);

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
  const pendingMetaRef = useRef(new MetaQueue());
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

  /* The signed-in account's own profile, read once the session exists and
     again whenever Settings opens, so a switch changed on another device is
     shown as it is rather than as this window last saw it. */
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
    /* `settingsOpen` only to read again on opening; closing reads too, harmlessly. */
  }, [session, settingsOpen]);

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

  /* Signing out, locking or switching account in another tab removes the
     saved session. `storage` only fires in the tabs that did not do it, and
     those are the ones still showing an archive that has just been closed. */
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== SESSION_KEY || event.newValue) return;
      setSession(null);
      void navigate({ to: "/", replace: true });
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [navigate]);

  /**
   * Folds a remote snapshot into the page. The rule is that unpushed local work
   * wins: a remote body only reaches the editor when nothing is queued for that
   * note, and remote metadata is skipped while a metadata write is waiting.
   */
  const applySnapshot = useCallback((snapshot: ArchiveSnapshot, remote = true) => {
    const { entries: next, changed: changedIds } = mergeRemoteEntries(
      entriesRef.current,
      snapshot.entries,
      isDirty,
    );
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
    const safetyChanged = () => {
      setSheets([]);
      refreshRemote();
    };
    window.addEventListener("napp:safety-change", safetyChanged);
    return () => window.removeEventListener("napp:safety-change", safetyChanged);
  }, [refreshRemote]);

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
      .catch(() => localPreferences({}, session.userId))
      .then((preferences) => {
        if (!live) return;
        setFlags(flagsOf(preferences));
        setRemarksSeen((current) => mergeRemarksSeen(current, preferences.remarksSeen));
        setPreferencesReady(true);
      });
    const channel = subscribeToAccountPreferences(session, (preferences) => {
      if (!live) return;
      /* A row that arrives late never un-reads a release read here. */
      setFlags((current) => ({
        ...flagsOf(preferences),
        whatsNewSeen: laterVersion(current.whatsNewSeen, preferences.whatsNewSeen),
      }));
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

  const { present, onlineMemberIds, markTyping } = usePresence(
    session,
    preferencesReady && flags.presence,
    selectedId,
    selectedIdRef,
    collaborative.provider,
  );

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

  /* What "Chats in notes" lists (see `visibleEntries`): this scope's notes,
     not the trash. Only news there is news this person can go and read. */
  const reachableRemarkNotes = useMemo(
    () => new Set(ownedEntries.map((entry) => entry.note.id).filter((id) => !trashedIds.has(id))),
    [ownedEntries, trashedIds],
  );

  const {
    archiveComments,
    saidThreads,
    markRemarksSeen,
    refreshRemarks,
    remarkedIds,
    unreadRemarkNotes,
    unreadRemarkCount,
    unreadGeneralCount,
  } = useArchiveRemarks(session, remarksSeen, setRemarksSeen, awake, reachableRemarkNotes);

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
  const mediaHaystacks = useMemo(
    () =>
      new Map(
        entries.map((entry) => [
          entry.note.id,
          fold(
            readableMedia(entry.note.content)
              .map((media) => mediaTexts.get(media.id) || "")
              .join("\n"),
          ),
        ]),
      ),
    [entries, mediaTexts],
  );

  const visible = useMemo(
    () =>
      visibleEntries(ownedEntries, {
        meta: activeMeta,
        scope: selectedFolderId,
        query,
        trashedIds,
        archivedIds,
        remarkedIds,
        mediaHaystacks,
      }),
    [
      ownedEntries,
      activeMeta,
      trashedIds,
      archivedIds,
      remarkedIds,
      selectedFolderId,
      query,
      mediaHaystacks,
    ],
  );

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
     everything not placed. Each member writes their own, and the switch
     beside the faces chooses whose. Nothing here changes what a notes
     archive reads or writes. */
  const currentSpace = spaces.find((space) => space.archiveId === session?.archiveId);
  const docMode = currentSpace?.kind === "document";
  const docFeatures = currentSpace?.features ?? DEFAULT_FEATURES;

  const manuscript = useMemo(
    () => (docMode ? manuscriptOf(entries, metas, viewAs, viewAs) : null),
    [docMode, metas, entries, viewAs],
  );

  const page = currentSpace?.page ?? DEFAULT_PAGE;
  const contents = useDocumentReferences({
    manuscript,
    entries,
    docFeatures,
    page,
    docMode,
    session,
  });

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

  /* Trashed notes of the book on screen, for its own Trash. */
  const docTrash = useMemo(() => {
    if (!docMode) return [];
    return entries.filter((entry) => {
      if (entry.note.ownerId !== viewAs) return false;
      const row = (metas[entry.note.ownerId ?? ""] ?? EMPTY_META).notes.find(
        (note) => note.id === entry.note.id,
      );
      return Boolean(row?.trashedAt);
    });
  }, [docMode, entries, metas, viewAs]);

  const docSelected =
    docMode && selectedId && !docTrash.some((entry) => entry.note.id === selectedId)
      ? (entries.find((entry) => entry.note.id === selectedId) ?? null)
      : null;

  const selected = docMode ? docSelected : (visible.find((e) => e.note.id === selectedId) ?? null);
  const selectedNoteId = selected?.note.id ?? null;
  useEffect(() => {
    lastOpened.current = selectedNoteId;
  }, [selectedNoteId]);

  /* A book opens on the chapter last written in. It had a title page with a
     Continue button, which was one more press between the window and the
     writing and said nothing the structure beside it did not. */
  useEffect(() => {
    if (!docMode || !manuscript || docSelected || loading) return;
    const updated = (id: string) =>
      Date.parse(entries.find((entry) => entry.note.id === id)?.note.updatedAt ?? "") || 0;
    const last = [...manuscript.chapters].sort((a, b) => updated(b.id) - updated(a.id))[0];
    if (last && last.id !== selectedId) setSelectedId(last.id);
  }, [docMode, manuscript, docSelected, loading, entries, selectedId]);

  /* A list opens on a note, as Apple Notes does: the one last opened in it, or
     else the most recently edited. Choosing it only selects — it is not an
     edit, and it marks nothing read. The Trash and a search stay as they are,
     and a phone shows the list first. */
  useEffect(() => {
    if (docMode || compact || loading || selectedId || query || selectedFolderId === TRASH) return;
    const remembered = listPreferences[viewAs]?.recentNoteIds.find((id) =>
      visible.some((entry) => entry.note.id === id),
    );
    const latest = [...visible].sort((a, b) => b.note.updatedAt.localeCompare(a.note.updatedAt))[0];
    const id = remembered ?? latest?.note.id;
    if (id) setSelectedId(id);
  }, [
    docMode,
    compact,
    loading,
    selectedId,
    query,
    selectedFolderId,
    listPreferences,
    viewAs,
    visible,
  ]);

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
            ? "Recently Deleted"
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

  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(""), 6000);
    return () => window.clearTimeout(timer);
  }, [error]);

  const { drain, settleWrites, schedule, saveNow } = useArchiveWrites({
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
  });

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

  /* A book's structure is its corkboard, laid in place of the sheet: the
     same window turned over (`turnView`) while the cards settle in. */
  const toggleBoard = useCallback(
    () => turnView(() => flushSync(() => setBoardOpen((open) => !open))),
    [],
  );

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
         rather than in each of them. */
      const m = keepLockedNotes(base, proposed, selfId);
      pendingMetaRef.current.stage(owner, base, m);
      /* Where each note went, read while its row is still where it was: the
         row is thrown at that place in the sidebar, and the rows left behind
         are measured so they can close over the gap. */
      const moves = noteMoves(base, m, selectedFolderId === ALL);
      captureRows();
      sendNotes(moves);
      setMetas((current) => ({ ...current, [owner]: m }));
      schedule();
    },
    [schedule, canWriteArchive, selfId, selectedFolderId],
  );

  const handleMetaChange = useCallback(
    (next: Meta | ((prev: Meta) => Meta)) => handleMetaChangeFor(viewAs, next),
    [handleMetaChangeFor, viewAs],
  );

  const handleTogglePin = useCallback(
    (noteId: string) => {
      markPinned(noteId);
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

  const indexMedia = () =>
    indexAttachments({
      entries,
      canWriteArchive,
      resolveFile,
      resolveImage,
      contentOf: (entry) =>
        selected?.note.id === entry.note.id
          ? (noteEditorRef.current?.getContent() ?? entry.note.content)
          : entry.note.content,
    });

  async function flushPendingFolder(s: AppSession, folderId: string) {
    // A locally created folder may not have reached Postgres yet.
    const pending = pendingMetaRef.current.get(viewAs);
    if (!pending?.after.folders.some((folder) => folder.id === folderId)) return;
    window.clearTimeout(timerRef.current);
    window.clearTimeout(retryRef.current);
    await waitUntilIdle(() => inFlightRef.current);
    await pendingMetaRef.current.flush(viewAs, (before, after) =>
      persistMetaDiff(s, viewAs, before, after),
    );
    setDirty(writesWaiting(pendingMetaRef.current));
  }

  const {
    handleCopyMarkdown,
    handleExportMarkdown,
    handleExportAll,
    handleImportFiles,
    importDriveFile,
  } = useNoteExchange({
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
  });

  /** A new note, empty or started from a template or the day. */
  const handleNewFrom = useCallback(
    async (seed?: { title: string; content: JSONContent }) => {
      if (!canWriteArchive) return;
      const s = sessionRef.current;
      if (!s) return;
      /* Every scope that is not a folder starts with two underscores — Remarks
       and Updates were once filed under as if they were folders, and the
       insert was refused by the folder's foreign key. */
      const folderId = selectedFolderId.startsWith("__") ? null : selectedFolderId;
      const content = structuredClone(seed?.content ?? EMPTY_RICH_TEXT);

      const note: Note = {
        id: crypto.randomUUID(),
        title: seed?.title ?? "",
        body: seed ? richTextToPlainText(content) : "",
        content,
        contentVersion: RICH_TEXT_VERSION,
        legacyBody: null,
        photo: null,
        cover: null,
        ownerId: viewAs,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      /* Take the selection now, not when the insert lands: until then the old
         note is neither open nor focused, so a keystroke can reach nobody
         else's text and the list's auto-open has nothing to fill. */
      (document.activeElement as HTMLElement | null)?.blur();
      setSelectedId(note.id);
      setSaving(true);
      setError("");
      try {
        if (folderId !== null) await flushPendingFolder(s, folderId);

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
          { title: note.title, body: note.body, content: structuredClone(content) },
          note.updatedAt,
        );
        /* The editor mounts on the next commit; focus it as soon as it is there. */
        if (!seed) {
          let frames = 0;
          const focusTitle = () => {
            if (titleRef.current) titleRef.current.focus();
            else if (frames++ < 30) requestAnimationFrame(focusTitle);
          };
          requestAnimationFrame(focusTitle);
        }
      } catch (e) {
        setSelectedId((current) => (current === note.id ? null : current));
        setError(e instanceof Error ? e.message : "Failed to create note");
      } finally {
        setSaving(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [viewAs, selectedFolderId, canWriteArchive],
  );

  /* Never handed an argument: it is bound straight to buttons, and a click
     event arriving as the seed would become the note. */
  const handleNew = useCallback(() => handleNewFrom(), [handleNewFrom]);

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

        captureRows();
        sendNotes([...doomed].map((id) => ({ id, to: null, leaves: true })));
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
      const command = windowCommand(
        { key: e.key, code: e.code, mod: e.metaKey || e.ctrlKey, alt: e.altKey, shift: e.shiftKey },
        {
          typing,
          inText: !!el?.isContentEditable,
          linkable:
            !!el?.closest(".rich-text-content") && !(window.getSelection()?.isCollapsed ?? true),
          noteOpen: !!selected,
          noteSelected: !!selectedId,
          canEdit,
          document: docKeys.current.docMode,
          structure: docMode && !compact,
          focusMode,
        },
      );
      if (!command) return;
      e.preventDefault();
      switch (command) {
        case "save":
          return saveNow();
        case "find":
          return noteEditorRef.current?.openFind();
        case "search":
          searchRef.current?.focus();
          return searchRef.current?.select();
        case "link":
          return noteEditorRef.current?.openLink();
        case "palette":
          /* Pressing it is the one thing that ends the first-launch lesson. */
          setFlags((current) => {
            if (current.spotlightLearned) return current;
            rememberSpotlightLearned();
            return { ...current, spotlightLearned: true };
          });
          setPaletteQuery("");
          return setPaletteOpen(true);
        case "draw":
          return noteEditorRef.current?.drawOnPage();
        case "previous-chapter":
          return docKeys.current.step(-1);
        case "next-chapter":
          return docKeys.current.step(1);
        case "new-chapter":
          return docKeys.current.newChapter();
        case "new":
          return void handleNew();
        case "settings":
          return setSettingsOpen(true);
        case "focus":
          return toggleFocus();
        case "structure":
          return toggleBoard();
        case "navigation":
          return changeNavigation((current) => !current);
        case "shortcuts":
          return setShortcutsOpen(true);
        case "search-field":
          return searchRef.current?.focus();
        case "down":
          return moveSelection(1);
        case "up":
          return moveSelection(-1);
        case "next-group":
          return moveByGroup(1);
        case "previous-group":
          return moveByGroup(-1);
        case "open-title":
          return titleRef.current?.focus();
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
    toggleBoard,
    docMode,
    compact,
  ]);

  // ── Drag a note onto a folder ───────────────────────────────────────────
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  /* Whether the drag that just ended landed somewhere. Read by the drop
     animation, which dnd-kit runs after this handler: a note let go over a
     place has been thrown into it already (`sendNotes`), and one let go over
     nothing goes back to the row it came from. */
  const landedRef = useRef(false);
  const dropBack = useCallback<DropAnimationFunction>(
    ({ active, dragOverlay }) =>
      landedRef.current ? undefined : settleBack(dragOverlay.node, active.rect),
    [],
  );

  function handleDragEnd(e: DragEndEvent) {
    setDragId(null);
    landedRef.current = Boolean(e.over);
    const over = e.over?.id as string | undefined;
    if (!over) return;
    const activeId = e.active.id as string;
    if (activeId.startsWith(FOLDER_DRAG)) {
      const dragged = activeId.slice(FOLDER_DRAG.length);
      handleMetaChange((prev) => {
        const folders = moveFolder(prev.folders, dragged, over);
        return folders ? { ...prev, folders } : prev;
      });
      return;
    }
    const noteId = activeId;
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
    await waitUntilIdle(() => inFlightRef.current);
    await drain();
  }

  async function createDocNote(
    place: { folderId: string | null; position: number } | null,
    content: JSONContent = EMPTY_RICH_TEXT,
  ) {
    if (!canWriteArchive) return;
    const s = sessionRef.current;
    if (!s) return;
    const owner = viewAs;
    const now = new Date().toISOString();
    const body = richTextToPlainText(content);
    const note: Note = {
      id: crypto.randomUUID(),
      title: "",
      body,
      content: structuredClone(content),
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
      ensureDraft(note.id, { title: "", body, content: structuredClone(content) }, now);
      window.setTimeout(() => titleRef.current?.focus(), 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create the chapter");
    } finally {
      setSaving(false);
    }
  }

  /** Chosen words in a chapter, carried into a new note in the notebook: the
   *  quotation is a link back to the chapter, and pressing it lights the
   *  words there again. */
  function continueAsNote(chapterId: string, quote: string) {
    void createDocNote(null, {
      type: "doc",
      content: [
        {
          type: "blockquote",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: quote,
                  marks: [{ type: "noteLink", attrs: { noteId: chapterId } }],
                },
              ],
            },
          ],
        },
        { type: "paragraph" },
      ],
    });
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

  /* A book opens on its writing, never on an empty desk: the first chapter,
     or — in your own book with none yet — a first chapter made for you. One
     attempt per empty book, so a refused insert does not repeat. */
  const firstChapterFor = useRef<string | null>(null);
  const bookKey = `${session?.archiveId}:${viewAs}`;
  const firstChapterId = manuscript?.chapters[0]?.id ?? null;
  const newChapterRef = useRef(handleNewChapter);
  useLayoutEffect(() => {
    newChapterRef.current = handleNewChapter;
  });
  useEffect(() => {
    if (!docMode || loading || !manuscript || selectedId) return;
    if (firstChapterId) {
      firstChapterFor.current = null;
      setSelectedId(firstChapterId);
    } else if (canWriteArchive && viewAs === selfId && firstChapterFor.current !== bookKey) {
      firstChapterFor.current = bookKey;
      newChapterRef.current(null);
    }
  }, [
    docMode,
    loading,
    manuscript,
    selectedId,
    firstChapterId,
    canWriteArchive,
    viewAs,
    selfId,
    bookKey,
  ]);

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
    setNoteRow(viewAs, id, next);
  }

  function handleNewPart(chapterId: string) {
    const count = manuscript?.parts.size ?? 0;
    const id = crypto.randomUUID();
    handleMetaChangeFor(viewAs, (prev) => ({
      ...prev,
      folders: [...prev.folders, { id, name: `Part ${count + 1}`, parentId: null }],
    }));
    /* The chapter stays where it is in the order; the part begins at it. */
    setNoteRow(viewAs, chapterId, { folderId: id });
  }

  function handleRenamePart(id: string, name: string) {
    handleMetaChangeFor(viewAs, (prev) => ({
      ...prev,
      folders: prev.folders.map((folder) => (folder.id === id ? { ...folder, name } : folder)),
    }));
  }

  /** The part goes and its chapters stay where they are in the order. */
  function handleDeletePart(id: string) {
    handleMetaChangeFor(viewAs, (prev) => ({
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

  function handleTrashDocNotes(ids: string[]) {
    const trashedAt = new Date().toISOString();
    const byOwner = new Map<string, Set<string>>();
    for (const id of ids) {
      const owner = entries.find((entry) => entry.note.id === id)?.note.ownerId ?? viewAs;
      byOwner.set(owner, (byOwner.get(owner) ?? new Set()).add(id));
    }
    for (const [owner, chosen] of byOwner)
      handleMetaChangeFor(owner, (prev) => ({
        ...prev,
        notes: prev.notes.map((note) => (chosen.has(note.id) ? { ...note, trashedAt } : note)),
      }));
    if (selectedId && ids.includes(selectedId)) {
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
        const from = selectedIdRef.current;
        /* Aimed inside the callback: by then the old page is already a
           picture, so the direction never restarts its entrance. */
        document
          .startViewTransition(() =>
            flushSync(() => {
              aimNote(from, id);
              setSelectedId(id);
            }),
          )
          .finished.finally(() => root.classList.remove("is-opening-note"));
      } else {
        aimNote(selectedIdRef.current, id);
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

  /* Chosen from a searched list: the note opens at the words that put it
     there, lit for a moment, as Spotlight's text results already do. */
  const handleSelectFromList = useCallback(
    (id: string) => {
      handleSelectNote(id);
      const q = fold(query.trim());
      const body = q ? entriesRef.current.find((entry) => entry.note.id === id)?.note.body : "";
      const hit = body ? snippetOf(body, q) : null;
      if (hit) setOpenThen({ noteId: id, reveal: hit.match });
    },
    [handleSelectNote, query],
  );

  /* A line of the contents was pressed — on the title page or in a `[TOC]`
     block — so open its chapter and go to the heading. */
  useEffect(() => {
    const open = (event: Event) => {
      const { noteId, text, target, passage, blockId } = (event as CustomEvent<PlaceRequest>)
        .detail;
      handleSelectNote(noteId);
      const reveal: Place | undefined = blockId
        ? { blockId }
        : passage
          ? { passage }
          : (target ?? text);
      if (reveal) setOpenThen({ noteId, reveal });
    };
    window.addEventListener(OPEN_PLACE, open);
    return () => window.removeEventListener(OPEN_PLACE, open);
  }, [handleSelectNote]);

  /* Shared in from another app (see `lib/capture.ts`): a new note, once the
     archive it lands in is open and may be written. */
  useEffect(() => {
    if (loading || !canWriteArchive) return;
    const capture = takeCapture();
    if (capture) void handleNewFrom(captureNote(capture));
  }, [loading, canWriteArchive, handleNewFrom]);

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

  /** A link to a note, pressed. One made by Continue as note carries the
   *  words it was continued from, and those are what it goes back to. */
  function handleOpenRecent(id: string, passage?: string) {
    setQuery("");
    setSelectedFolderId(ALL);
    if (passage) openPlace({ noteId: id, passage });
    else handleSelectNote(id);
  }

  function handleMobileBack() {
    saveNow();
    setSelectedId(null);
    setMobileScreen("collection");
  }

  /* One writer for the profile, optimistic so the field does not snap back
     under the cursor, and rolled back with the reason if the write is refused.
     Only the changed field is written, so a stale copy cannot undo another
     device's change. The archive is refreshed afterwards because the roster —
     and so the scope switch — carries the nickname that just changed. */
  async function persistProfile(change: Partial<Profile>) {
    if (!session) return;
    const previous = profile;
    setProfile((current) => ({ ...current, ...change }));
    setProfileBusy(true);
    setProfileError("");
    try {
      await saveProfile(session, change);
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

  const archiveSheet = sheets.find((sheet) => sheet.kind === "archive");
  /* An archive edited from the list in Settings need not be the one on
     screen: its invitations are asked of it. Postgres decides either way. */
  const editedArchiveId = archiveSheet?.kind === "archive" ? archiveSheet.archiveId : undefined;
  const inviteSession = useMemo(
    () =>
      session && editedArchiveId && editedArchiveId !== session.archiveId
        ? { ...session, archiveId: editedArchiveId }
        : session,
    [session, editedArchiveId],
  );
  const { invites, inviteLink, withdrawInvite } = useArchiveInvites(
    inviteSession,
    settingsOpen || Boolean(archiveSheet),
  );

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
  const spacesView = withLiveRoster(spaces, session?.archiveId, members, seatLimit);
  /* The archive an account starts with — the first it joined. It stays
     notes and is never deleted from here; Postgres refuses the last one. */
  const defaultArchiveId = spaces[0]?.archiveId;

  async function handleAvatarPick(file: File, crop?: AvatarCrop) {
    if (!session) return;
    setProfileBusy(true);
    setProfileError("");
    try {
      const blob = await prepareAvatar(file, crop);
      const objectId = await uploadAvatar(session, blob);
      const replaced = profile.avatarObject;
      await persistProfile({ avatarObject: objectId });
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
    await persistProfile({ avatarObject: null });
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
     announce a release already read on another — and read the moment it is
     open, so the New on the sidebar row goes with it. The sheet still marks
     what was new, from the reading it was opened with. */
  const whatsNewUnseen =
    preferencesReady && compareVersions(CURRENT_RELEASE, flags.whatsNewSeen) > 0;
  /* What's New is a page of Settings; opening the page is reading it. */
  const markWhatsNewRead = useCallback(() => {
    setFlags((current) => {
      if (compareVersions(CURRENT_RELEASE, current.whatsNewSeen) <= 0) return current;
      const whatsNewSeen = laterVersion(current.whatsNewSeen, CURRENT_RELEASE);
      rememberWhatsNewSeen(whatsNewSeen);
      return { ...current, whatsNewSeen };
    });
  }, []);
  const openWhatsNew = useCallback(() => {
    setSettingsSection("whats-new");
    setSettingsOpen(true);
  }, []);
  useEffect(() => {
    if (!whatsNewUnseen || loading || whatsNewShown) return;
    whatsNewShown = true;
    openWhatsNew();
  }, [whatsNewUnseen, loading, openWhatsNew]);

  async function handleLock(removeLocalContent = true) {
    if (
      removeLocalContent &&
      !window.confirm(
        "Sign out and remove this account’s local notes? Changes that have not reached the server will be deleted.",
      )
    )
      return;
    saveNow();
    try {
      if (!removeLocalContent) {
        // An inactivity lock hides the archive immediately, even offline.
        // Its recoverable Yjs stores are deliberately retained.
        const signingOut = clearSession();
        navigate({ to: "/" });
        await signingOut;
        return;
      }
      await drain();
      await clearSession({ removeLocalContent });
      clearDrafts();
      navigate({ to: "/" });
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Could not sign out. Try again.";
      if (removeLocalContent) window.alert(message);
      else setError(message);
    }
  }

  function handleSwitchAccount(userId: string) {
    saveNow();
    clearDrafts();
    void switchAccount(userId).catch(() => navigate({ to: "/" }));
  }

  function handleAddAccount() {
    saveNow();
    clearDrafts();
    void addAccount().then(() => navigate({ to: "/" }));
  }

  /* The way out of the archive on screen; the sequence is `archiveExit.ts`. */
  const archiveExit = useCallback(
    (current: AppSession): ArchiveDeparture => ({
      settle: settleWrites,
      waiting: () => writesWaiting(pendingMetaRef.current),
      enter: async (archiveId) => {
        await chooseArchive(current, archiveId);
        setSheets([]);
        await leaveScreen();
        document.documentElement.dataset.arriving = "";
        onReopen();
      },
      remaining: async () => (await loadSpaces(current)).map((space) => space.archiveId),
      clearDrafts,
      signOut: async () => {
        await clearSession();
        setSession(null);
        navigate({ to: "/" });
      },
    }),
    [settleWrites, navigate, onReopen],
  );

  const handleLeaveArchive = useCallback(async () => {
    const current = sessionRef.current;
    if (!current) throw new Error("Sign in again before leaving this archive");
    await departArchive(current.archiveId, () => leaveArchive(current), archiveExit(current));
  }, [archiveExit]);

  /* Its last member only; `deleteSpace` asks Postgres first and refuses
  /* Blocking someone still in this archive
     offers to remove them (its creator only, enforced by the RPC) or to leave. */
  useEffect(() => {
    const afterBlock = (event: Event) => {
      const blocked = (event as CustomEvent<{ blocked?: string }>).detail?.blocked;
      const member = members.find((one) => one.userId === blocked && !one.isSelf);
      if (!member || !session || !currentSpace) return;
      const name = member.nickname || "this member";
      const archive = currentSpace.name || "this archive";
      void (async () => {
        try {
          if (
            currentSpace.createdBy === session.userId &&
            window.confirm(`You still share ${archive}. Remove ${name} from it?`)
          ) {
            await removeBlockedMember(session.archiveId, member.userId);
            refreshRemote();
          } else if (window.confirm(`You still share ${archive}. Leave it?`)) {
            await handleLeaveArchive();
          }
        } catch (reason) {
          window.alert(reason instanceof Error ? reason.message : "Could not complete");
        }
      })();
    };
    window.addEventListener("napp:safety-change", afterBlock);
    return () => window.removeEventListener("napp:safety-change", afterBlock);
  }, [members, session, currentSpace, handleLeaveArchive, refreshRemote]);

     before anything is removed. Another archive than this one goes without
     the window moving. */
  const handleDeleteArchive = useCallback(
    async (archiveId: string) => {
      const current = sessionRef.current;
      if (!current) throw new Error("Sign in again before deleting this archive");
      if (archiveId !== current.archiveId) {
        await deleteSpace(archiveId);
        await refreshSpaces();
        return;
      }
      await departArchive(current.archiveId, () => deleteSpace(archiveId), archiveExit(current));
    },
    [archiveExit, refreshSpaces],
  );

  const handleSwitchArchive = useCallback(
    async (archiveId: string) => {
      const current = sessionRef.current;
      if (!current) return;
      await enterArchive(current.archiveId, archiveId, archiveExit(current));
    },
    [archiveExit],
  );

  /* Arrived: everything the archive needs is here. Each entrance is finished
     where it stands — it would otherwise play out under the fade — and the
     screen comes in once. */
  const arrived = !loading && !!session && spaces.length > 0;
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (!arrived || !("arriving" in root.dataset)) return;
    const shell = shellElement();
    const layer = switchLayer();
    delete root.dataset.arriving;
    /* The way out held the layer at nothing; that fill must not outlast it. */
    for (const animation of layer?.getAnimations() ?? []) animation.cancel();
    if (!shell || !layer || stillMotion()) return;
    for (const animation of shell.getAnimations({ subtree: true }))
      if (animation.effect?.getComputedTiming().endTime !== Infinity) animation.finish();
    layer.animate([{ opacity: 0 }, { opacity: 1 }], SWITCH_IN);
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
              following={following === peer.userId}
              onFollow={(on) => setFollowing(on ? peer.userId : null)}
            />
          );
        })}
      </span>
    );
  }, [
    flags.collaborators,
    selectedId,
    notePeers,
    members,
    avatarUrls,
    writingPreferences,
    following,
  ]);

  /* Who may sign a remark: the archive's own roster, with the avatars already
     resolved for the sidebar. Comments name people, and a comment from "an id"
     is not a conversation. */
  /** The general chat while it is open, and where it was opened from. */
  const [generalChat, setGeneralChat] = useState<{
    origin: DOMRect | null;
    quote?: NoteRef;
  } | null>(null);
  const closeGeneralChat = useCallback(() => setGeneralChat(null), []);
  const markGeneralSeen = useCallback(() => {
    if (session) markRemarksSeen(session.archiveId);
  }, [session, markRemarksSeen]);
  /** Chosen words of a note, carried into the general chat to be talked about. */
  const discussInChat = useCallback((quote: NoteRef, origin: DOMRect | null) => {
    setFoldersOpen(false);
    setGeneralChat({ origin, quote });
  }, []);
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

  /* Which notes name this one in plain words and do not link to it —
     Obsidian's unlinked mentions. Found by walking the Tiptap JSON of the notes
     already in memory: a link and a name are both inside the document, so
     there is no column to index. Memoised, and that is not an optimisation to
     take back: it is a full-depth walk over every document in the archive, in
     a component that re-renders on every keystroke, and the projection only
     changes when a save lands. A note that already links here is not a
     mention. (The foot's "Linked from" list was taken out in 0.9.37; the note
     sheet still says what links here.) */
  const selectedTitle =
    ownedEntries.find((entry) => entry.note.id === selectedId)?.note.title ?? "";
  const mentions = useMemo(() => {
    if (!selectedId || !selectedTitle) return [];
    const found: { id: string; title: string; words: string }[] = [];
    for (const entry of ownedEntries) {
      if (entry.note.id === selectedId || trashedIds.has(entry.note.id)) continue;
      if (linksTo(entry.note.content, selectedId)) continue;
      const words = mentionOf(entry.note.content, selectedTitle);
      if (words) found.push({ id: entry.note.id, title: entry.note.title, words });
    }
    return found;
  }, [ownedEntries, trashedIds, selectedId, selectedTitle]);

  /* Last hook in the body, and deliberately above the `!session` return so the
     order never changes between renders. */
  useAutoLock(autoLock, () => void handleLock(false));

  if (!session) return null;

  const dragEntry = dragId ? entries.find((e) => e.note.id === dragId) : null;
  const dragFolder = dragId?.startsWith(FOLDER_DRAG)
    ? activeMeta.folders.find((folder) => folder.id === dragId.slice(FOLDER_DRAG.length))
    : null;

  /* Each state is keyed, so a new one is a new element and fades in
     (`.note-status`) rather than swapping its words in place.

     The states have very different lengths, so the readout is given one slot of
     a fixed width below and every state is measured against the widest of them.
     Left to size itself it slid back and forth by 55px on each debounce, which
     is the one thing in the toolbar that moves while you are looking at it. The
     write error is carried in the tooltip for the same reason. */
  const saveReadout = collaborative.refusal ? (
    <span key="refused" className="label text-danger" title={collaborative.refusal}>
      Unavailable
    </span>
  ) : saveError ? (
    <button
      key="failed"
      onClick={saveNow}
      title={`${saveError}\nClick to retry the write now`}
      className="flex items-center gap-2 text-left"
    >
      <span className="label text-danger underline-offset-2 hover:underline">Save failed</span>
    </button>
  ) : error ? (
    <span key={`error:${error}`} className="label text-danger" title={error}>
      {error}
    </span>
  ) : saving ? (
    <span key="saving" className="inline-flex items-center gap-2">
      <span className="animate-spin inline-block h-2.5 w-2.5 rounded-full border border-accent border-t-transparent" />
      <span className="label text-accent">Saving</span>
    </span>
  ) : dirty ? (
    <span key="unsaved" className="label text-ink-2">
      Unsaved
    </span>
  ) : statusFlash ? (
    <span key={`flash:${statusFlash}`} className="label text-accent">
      {statusFlash}
    </span>
  ) : selectedId && collaborative.refusal ? (
    /* The door was answered and shut. Said rather than left as a wait, because
       a refusal that renders as "Connecting" is a wait nobody can end. */
    <span key="refusal" className="label text-ink-2" title={collaborative.refusal}>
      {collaborative.refusal}
    </span>
  ) : selectedId && !collaborative.ready ? (
    /* Nothing opens until the collaboration server has answered, and while it
       restarts (during a deployment) that can take most of a minute. Saying so
       matters: an unexplained wait is indistinguishable from a fault. What you
       type meanwhile is kept and sent on arrival, which is the other half worth
       saying — so it goes in the tooltip rather than in a second line. */
    <span
      key={collaborative.waking ? "waking" : "connecting"}
      className="label text-ink-4"
      title={
        collaborative.waking
          ? "The collaboration server is taking longer than usual to answer. Anything you type now is kept on this device and sent when it arrives."
          : undefined
      }
    >
      {collaborative.waking ? "Waking the server" : "Connecting"}
    </span>
  ) : selectedId && collaborative.connection === "offline" ? (
    <span
      key="offline"
      className="label text-ink-2"
      title="Changes stay on this device and sync on reconnect"
    >
      Offline
    </span>
  ) : merge ? (
    <span key={`merge:${merge.label}`} className="label text-accent" title={merge.detail}>
      {merge.label}
    </span>
  ) : null;
  /* At rest the slot says nothing. It used to say "Edited 15:19", which the
     note's own row in the list already says in the same words a hand's width
     away — two places saying one thing is one too many, and Jacopo asked for
     the toolbar's copy to go. The slot speaks only when something is
     happening to the note: saving, a failure, the server waking. */

  const pinned = selected
    ? indexOf(activeMeta).byNote.get(selected.note.id)?.pinned === true
    : false;
  const recentNotes = storedPreferences.recentNoteIds
    .filter((id) => id !== selectedId)
    .map((id) => entries.find((entry) => entry.note.id === id)?.note)
    .filter((note): note is Note => Boolean(note))
    .map((note) => ({ id: note.id, title: note.title }));

  /* Which notes `[[` can reach. */
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
      { id: TRASH, label: "Recently Deleted", count: trash },
    ];
  })();
  /* The notes in a folder named Templates or Modelli, in this scope. */
  const templateFolders = new Set(
    activeMeta.folders.filter((folder) => isTemplateFolder(folder.name)).map((f) => f.id),
  );
  const templates = ownedEntries.filter((entry) => {
    const meta = indexOf(activeMeta).byNote.get(entry.note.id);
    return meta?.folderId && templateFolders.has(meta.folderId) && !trashedIds.has(entry.note.id);
  });

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
  /* The list stays when the folders go, so the one control for them stays
     where it was too, at the list's leading edge, and says which way it goes. */
  const sidebarToggle = !compact && (
    <button
      type="button"
      onClick={() => changeNavigation((open) => !open)}
      aria-label={navigationOpen ? "Hide the sidebar" : "Show the sidebar"}
      title={navigationOpen ? "Hide the sidebar · ⌘\\" : "Show the sidebar · ⌘\\"}
      aria-pressed={navigationOpen}
      className="toolbar-button press shrink-0"
    >
      {navigationOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
    </button>
  );

  const prepareDriveImport = platform().prepareDriveImport;
  const driveDestinationKey = [session.userId, session.archiveId, viewAs, selectedFolderId].join(
    ":",
  );
  const canImportDrive =
    prepareDriveImport &&
    canWriteArchive &&
    viewAs &&
    ![TRASH, ARCHIVE, REMARKS].includes(selectedFolderId);
  const collectionMenu = (title?: React.ReactNode) => (
    <>
      <CollectionMenu
        title={title}
        preferences={activeListPreferences}
        onChange={handleListPreferencesChange}
        onIndexMedia={canWriteArchive ? () => void indexMedia() : undefined}
        indexingMedia={indexingMedia}
        onExportAll={() => void handleExportAll()}
        onImportDrive={canImportDrive ? () => setDriveDestination(driveDestinationKey) : undefined}
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
  const collectionActions = collectionMenu();

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

  const viewedMember = members.find((member) => member.userId === viewAs);
  const driveImportDialog =
    prepareDriveImport && canImportDrive && driveDestination === driveDestinationKey ? (
      <GoogleDriveImport
        key={driveDestinationKey}
        destination={[
          spacesView.find((space) => space.archiveId === session.archiveId)?.name ??
            "Current archive",
          viewedMember ? notesOf(viewedMember) : "Notes",
          selectedFolderId.startsWith("__") ? "Unfiled" : folderLabel,
        ].join(" / ")}
        members={roster.filter((member) => !member.isSelf).map(nameOf)}
        prepare={prepareDriveImport}
        importFile={importDriveFile}
        onClose={() => setDriveDestination(null)}
      />
    ) : null;

  /* Opening what was found. In a document the structure's own path — the
     notes list's scope and filter are not on screen there — and then, if a
     place inside it was found, going to that place. */
  const openFound = (id: string, then?: { reveal?: Place; history?: string }) => () => {
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

  const { paletteCommands, paletteSearch, paletteRemote } = workspacePalette(
    {
      paletteOpen,
      docMode,
      manuscript,
      entries,
      ownedEntries,
      scopes,
      archiveComments,
      roster,
      namedVersions,
      spaces,
      archiveId: session?.archiveId,
      templates,
      canWriteArchive,
      selectedId,
      splitId,
      trashedIds,
      splitEntry,
      focusMode,
      indexingMedia,
      mediaTexts,
    },
    {
      openFound,
      setSelectedId,
      handleSelectFolder,
      handleSelectNote,
      setQuery,
      setSelectedFolderId,
      setOpenThen,
      nameOf,
      openSheet,
      switchArchive,
      handleNewChapter,
      handleNew,
      handleNewFrom,
      setSplitId,
      toggleFocus,
      setSettingsOpen,
      indexMedia,
      handleExportAll,
      openWhatsNew,
      setShortcutsOpen,
      handleLock,
      setSettingsSection,
      openInArchive: (archiveId, noteId) => {
        openOnArrival = noteId;
        switchArchive(archiveId);
      },
    },
  );

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
            openSheet({ kind: "person", userId: member.userId });
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
  /* The notes somebody else has open, for the face on their rows. The note
     open here is answered by awareness, which is certain; every other note by
     the presence channel, which is the only thing that can see it. */
  const peerNotes = new Map<string, PeerFace>();
  const peerTypingNoteIds = new Set<string>();
  const peerFace = (userId: string): PeerFace => {
    const member = roster.find((one) => one.userId === userId);
    return { name: member ? nameOf(member) : "", avatarUrl: avatarUrls[userId] ?? null };
  };
  if (flags.collaborators) {
    for (const [userId, noteId] of present)
      if (noteId && userId !== session?.userId) peerNotes.set(noteId, peerFace(userId));
    const [hereId] = hereIds;
    if (selectedId && hereId) peerNotes.set(selectedId, peerFace(hereId));
    if (selectedId && typingIds.size > 0) peerTypingNoteIds.add(selectedId);
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
              openSheet({ kind: "person", userId: member.userId });
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
              {typing ? (
                <span className="people-face-typing" aria-label="Writing">
                  <i />
                  <i />
                  <i />
                </span>
              ) : (
                online && <span className="people-face-here" aria-label="Here now" />
              )}
            </span>
            <span className="people-face-name">{member.isSelf ? "You" : nameOf(member)}</span>
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

  function renderNoteSheet(sheet: { noteId: string }, key: string) {
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
        onOpenPerson={(userId) => pushSheet({ kind: "person", userId })}
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
  function renderFolderSheet(sheet: { folderId: string }, key: string) {
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
    const pushFolder = (folderId: string) => pushSheet({ kind: "folder", folderId });
    return (
      <FolderSheet
        key={key}
        session={session}
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
        onOpenPerson={(userId) => pushSheet({ kind: "person", userId })}
      />
    );
  }

  /* An archive's sheet: its people, its seats, who is waiting to come in.
     The archive on screen takes its faces from the live roster rather than
     the list the switch loaded, so somebody joining appears here at once;
     another archive, opened from Settings by its maker, has only that list,
     so its counts and its people's sheets are left out. */
  function renderArchiveSheet(sheet: { archiveId?: string }, key: string) {
    const archiveId = sheet.archiveId ?? session?.archiveId;
    const space = spacesView.find((one) => one.archiveId === archiveId);
    if (!session || !space) return null;
    const here = space.archiveId === session.archiveId;
    const target = here ? session : { ...session, archiveId: space.archiveId };
    const live = here ? entries.filter((entry) => !trashedIds.has(entry.note.id)) : null;
    return (
      <ArchiveSheet
        key={key}
        space={space}
        selfId={session.userId}
        avatarUrls={avatarUrls}
        notes={live?.length}
        words={live?.reduce((sum, entry) => sum + derivedOf(entry.note).words, 0)}
        invites={invites}
        onRename={async (name) => {
          await renameSpace(target, name);
          await refreshSpaces();
        }}
        onSeats={async (seats) => {
          await setSpaceSeats(target, seats);
          if (here) setSeatLimit(seats);
          await refreshSpaces();
        }}
        isDefault={space.archiveId === defaultArchiveId}
        onKind={(kind) => saveArchiveKind(kind, target, space)}
        onOptions={(features) => saveDocumentOptions(features, target)}
        onCreateInvite={inviteLink}
        onRevokeInvite={withdrawInvite}
        onOpenPerson={here ? (userId) => pushSheet({ kind: "person", userId }) : undefined}
        onLeave={here ? handleLeaveArchive : undefined}
        onDelete={() => handleDeleteArchive(space.archiveId)}
      />
    );
  }

  /* Who that is, and what they have been doing. */
  function renderPersonSheet(sheet: { userId: string }, key: string) {
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
      onBackOut={
        sheets[0] && "fromSettings" in sheets[0] && sheets[0].fromSettings
          ? () => {
              setSheets([]);
              setSettingsSection("spaces");
              setSettingsOpen(true);
            }
          : undefined
      }
    >
      {sheets.map((sheet, index) => {
        /* The place in the stack is part of the key: a folder's sheet can
           push its parent's, which may already be under it. */
        const key = `${index}:${sheet.kind}`;
        if (sheet.kind === "note") return renderNoteSheet(sheet, `${key}:${sheet.noteId}`);
        if (sheet.kind === "folder") return renderFolderSheet(sheet, `${key}:${sheet.folderId}`);
        if (sheet.kind === "archive") return renderArchiveSheet(sheet, key);
        if (sheet.kind === "trash")
          return (
            <TrashSheet
              key={key}
              items={docTrash.map((entry) => ({ id: entry.note.id, title: entry.note.title }))}
              canWrite={canWriteArchive}
              onRestore={handleRestoreDocNote}
              onDelete={(id) => {
                const entry = docTrash.find((one) => one.note.id === id);
                if (entry) void deleteForever([entry]);
              }}
            />
          );
        if (sheet.kind === "new-archive")
          return (
            <NewArchiveSheet
              key={key}
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

  /* Always shown: everything under it belongs to the archive it names, and
     it is the way to another — in a book, the only way back to the notes. */
  const spaceSwitch = session && (
    <SpaceSwitch
      spaces={spacesView}
      currentId={session.archiveId}
      defaultId={defaultArchiveId}
      onSwitch={switchArchive}
      onInfo={() => openSheet({ kind: "archive" })}
      onSettings={() => {
        setFoldersOpen(false);
        setSettingsSection(docMode ? "document" : "spaces");
        setSettingsOpen(true);
      }}
      onCreate={() => openSheet({ kind: "new-archive" })}
      onDelete={(archiveId) =>
        void handleDeleteArchive(archiveId).catch((reason) =>
          setError(reason instanceof Error ? reason.message : "The archive could not be deleted"),
        )
      }
    />
  );

  const sidebar = (
    <Sidebar
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
      onFolderInfo={(folderId) => openSheet({ kind: "folder", folderId })}
      onClose={() => (compact ? setFoldersOpen(false) : changeNavigation(false))}
      closeInStrip={compact}
      onSettings={() => {
        setFoldersOpen(false);
        setSettingsOpen(true);
      }}
      onGeneralChat={
        session
          ? (origin) => {
              setFoldersOpen(false);
              setGeneralChat({ origin });
            }
          : undefined
      }
      generalUnread={unreadGeneralCount}
      onLock={() => void handleLock()}
      accountEmail={session?.email ?? ""}
      accounts={() => (session ? otherAccounts(session.userId) : [])}
      onSwitchAccount={handleSwitchAccount}
      onAddAccount={handleAddAccount}
      spaceSwitch={spaceSwitch ? cloneElement(spaceSwitch, { bare: true }) : null}
      people={
        roster.length > 1
          ? roster.map((member) => ({
              userId: member.userId,
              label: member.isSelf ? "You" : nameOf(member),
              face: (
                <span className="sidebar-face-pic">
                  <Avatar
                    url={avatarUrls[member.userId] ?? null}
                    name={nameOf(member)}
                    email=""
                    compact
                    online={
                      !member.isSelf &&
                      ((flags.presence && onlineMemberIds.has(member.userId)) ||
                        hereIds.has(member.userId))
                    }
                  />
                </span>
              ),
            }))
          : []
      }
      viewAs={viewAs}
      onPerson={(userId) => {
        handleViewChange(userId);
        setFoldersOpen(false);
      }}
      onPersonInfo={(userId) => openSheet({ kind: "person", userId })}
      scopeLabel={currentSpace?.name ?? "My notes"}
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

  async function saveDocumentOptions(features: DocumentFeatures, target = session) {
    if (!target) return;
    await setDocumentFeatures(target, features);
    await refreshSpaces();
  }

  /* Notes into a book or back, from the archive's own sheet. A book that has
     never had a tool switched on gets the book's set. */
  async function saveArchiveKind(kind: ArchiveKind, target = session, space = currentSpace) {
    if (!target || !space) return;
    await setSpaceKind(target, kind);
    const { features } = space;
    if (kind === "document" && !SWITCH_KEYS.some((key) => features[key]))
      await setDocumentFeatures(target, { ...BOOK_PRESET.features });
    await refreshSpaces();
  }

  /* Both keyboard sheets travel with the settings panel, because both layouts
     mount that and neither wants a second copy of this. */
  /* Once per account, after What's New has had its turn: the Spotlight's
     shortcut, until it is pressed. */
  const spotlightLesson =
    preferencesReady &&
    !flags.spotlightLearned &&
    !loading &&
    !settingsOpen &&
    !paletteOpen &&
    !shortcutsOpen;
  const keyboardSheets = (
    <>
      {spotlightLesson && <SpotlightLesson />}
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
      {generalChat && session && (
        <Suspense fallback={null}>
          <GeneralChat
            key={session.archiveId}
            session={session}
            noteId={session.archiveId}
            general={generalChat}
            canEdit={canWriteArchive}
            authors={commentAuthors}
            quotes={NO_QUOTES}
            pendingThread={null}
            onPendingHandled={nothing}
            focusThread={null}
            onFocusHandled={nothing}
            onClose={closeGeneralChat}
            onRead={markGeneralSeen}
            onReveal={nothing}
            onRemoveAnchor={nothing}
            notes={linkableNotes}
            quoteDraft={generalChat.quote ?? null}
            onOpenNote={(ref) => handleOpenRecent(ref.note, ref.quote)}
            onOpenPerson={(userId) => pushSheet({ kind: "person", userId })}
          />
        </Suspense>
      )}
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
                onOptions: (features) => void saveDocumentOptions(features),
                onPage: savePageSetup,
              }
            : undefined
        }
        email={session.email}
        onAccountDeleted={() => {
          clearDrafts();
          setSession(null);
          void navigate({ to: "/" });
        }}
        reading={readingLabel}
        autoLock={autoLock}
        profile={profile}
        avatarUrl={avatarUrls[session.userId] ?? null}
        joinedAt={members.find((member) => member.isSelf)?.joinedAt}
        memberCount={members.length}
        presenceEnabled={flags.presence}
        collaboratorsVisible={flags.collaborators}
        profileBusy={profileBusy}
        profileError={profileError}
        onNicknameSave={(nickname) => void persistProfile({ nickname })}
        onAvatarPick={(file, crop) => void handleAvatarPick(file, crop)}
        onAvatarRemove={() => void handleAvatarRemove()}
        selfId={session.userId}
        avatarUrls={avatarUrls}
        invites={invites}
        onCreateInvite={inviteLink}
        onRevokeInvite={withdrawInvite}
        onLeaveArchive={async () => {
          await handleLeaveArchive();
          setSettingsOpen(false);
        }}
        spaces={spacesView}
        currentArchiveId={session.archiveId}
        onSwitchArchive={async (archiveId) => {
          setSettingsOpen(false);
          await handleSwitchArchive(archiveId);
        }}
        onNewArchive={() => {
          /* Settings stands over the sheets; the new archive is the next
             thing in front of you, so Settings steps aside for it. */
          setSettingsOpen(false);
          openSheet({ kind: "new-archive", fromSettings: true });
        }}
        onEditArchive={(archiveId) => {
          setSettingsOpen(false);
          openSheet({ kind: "archive", archiveId, fromSettings: true });
        }}
        defaultArchiveId={defaultArchiveId}
        onDeleteArchive={handleDeleteArchive}
        onPresenceEnabledChange={(presence) => changeFlags({ presence })}
        onCollaboratorsVisibleChange={(collaborators) => changeFlags({ collaborators })}
        proofreaderEnabled={proofreaderEnabled}
        autocorrectEnabled={autocorrectEnabled}
        writingPreferences={writingPreferences}
        onProofreaderEnabledChange={(proofreader) => changeFlags({ proofreader })}
        onAutocorrectEnabledChange={(autocorrect) => changeFlags({ autocorrect })}
        onWritingPreferencesChange={setWritingPreferences}
        /* Straight through the one profile writer: this is a column on the row,
         and Postgres reads it back to decide what the other member may fetch. */
        onHideArchivedChange={(hideArchived) => void persistProfile({ hideArchived })}
        onAutoLockChange={(autoLock) => changeFlags({ autoLock })}
        onClose={() => {
          setSettingsOpen(false);
          setSettingsSection(undefined);
        }}
        onLock={() => void handleLock()}
        onWhatsNewRead={markWhatsNewRead}
        whatsNewSeen={flags.whatsNewSeen}
        whatsNewUnseen={whatsNewUnseen}
      />
    </Suspense>
  );

  /* What the header says about the note, beside the pill of things it can do:
     whether the last write landed. Who else is reading starts the header,
     beside the window navigation. */
  const noteStatus = selected ? (
    <span className="note-status block min-w-0 truncate">
      {canWriteArchive ? saveReadout : <span className="readout text-ink-4">View only</span>}
    </span>
  ) : null;

  const notePresence = selected ? noteReaders : null;

  /* With no note open there is no header to say what just happened, so the
     list's tally says it instead, for as long as the header would have. */
  const listNotice = selected ? null : error ? (
    <span key={`error:${error}`} className="list-notice text-danger" title={error}>
      {error}
    </span>
  ) : statusFlash ? (
    <span key={`flash:${statusFlash}`} className="list-notice text-accent">
      {statusFlash}
    </span>
  ) : null;

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

  const noteActions =
    selected && canWriteArchive ? (
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
        onHistory={() => noteEditorRef.current?.openHistory()}
        onMove={(folderId) => handleMoveNote(selected.note.id, folderId)}
        onRecent={handleOpenRecent}
        onDelete={canEdit ? () => handleMoveToTrash(selected) : undefined}
      />
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
        onHistory={() => noteEditorRef.current?.openHistory()}
        onMove={(folderId) => handleMoveNote(selected.note.id, folderId)}
        onRecent={handleOpenRecent}
        onDelete={canEdit ? () => handleMoveToTrash(selected) : undefined}
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
      viewedMember && !viewedMember.isSelf ? `${nameOf(viewedMember)}'s notes` : "Notes";
    const before = chapterAt > 0 ? manuscript.chapters[chapterAt - 1] : undefined;
    const after = chapterAt >= 0 ? manuscript.chapters[chapterAt + 1] : undefined;

    const openFromStructure = (id: string) => {
      if (boardOpen && !compact) toggleBoard();
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

    const saveBook = async () => {
      setError("");
      try {
        const chapters = manuscript.chapters.map((item) => {
          const entry = entries.find((one) => one.note.id === item.id);
          if (!entry) throw new Error("A chapter could not be loaded");
          const content =
            selected?.note.id === item.id
              ? noteEditorRef.current?.getContent()
              : entry.note.content;
          if (!content) throw new Error("Wait for the open chapter to load before exporting");
          return { id: item.id, title: item.title, content };
        });
        const { exportEpub } = await import("@/features/editor/lib/exportNote");
        const title = currentSpace?.name || "Untitled";
        const blob = await exportEpub(title, chapters, page.labels, resolveImage);
        await platform().saveFile(exportFileName(title).replace(/\.md$/, "") + ".epub", blob);
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "Could not export book");
      }
    };

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
                  label: chapterAt >= 0 ? "Delete chapter" : "Delete page",
                  danger: true,
                  icon: <Trash2 size={16} />,
                  run: () => handleTrashDocNote(selected.note.id),
                },
              ]
            : []),
        ]
      : [];

    const docActions = selected ? (
      <PageSetupButton page={page} disabled={!canWriteArchive} onChange={savePageSetup} />
    ) : null;

    /* Pages' arrangement: the window's chrome is one strip across the top —
       which book, which chapter, who else is in it — and ⋯ holds only what
       acts on the open page; the book's own acts are in its contents menu. Settings and What's New are reached
       the way the notes archive reaches them, from the archive switch. */
    const pageLabel = (item: ChapterItem) => item.title || item.preview || "Untitled";
    const chapterMenu: MenuItem[] = [
      ...manuscript.rows.map(
        (row): MenuItem =>
          row.kind === "part"
            ? { kind: "label", label: manuscript.parts.get(row.folderId) ?? "" }
            : {
                kind: "item",
                id: `chapter:${row.item.id}`,
                label: `${row.number}   ${pageLabel(row.item)}`,
                checked: row.item.id === selected?.note.id,
                run: () => openFromStructure(row.item.id),
              },
      ),
      ...(manuscript.notebook.length
        ? [
            { kind: "separator" as const },
            { kind: "label" as const, label: notebookName },
            ...manuscript.notebook.map(
              (item): MenuItem => ({
                kind: "item",
                id: `note:${item.id}`,
                label: pageLabel(item),
                checked: item.id === selected?.note.id,
                run: () => openFromStructure(item.id),
              }),
            ),
          ]
        : []),
      ...(canWriteArchive
        ? [
            { kind: "separator" as const },
            {
              kind: "item" as const,
              id: "new-chapter",
              label: "New chapter",
              icon: <Plus size={16} />,
              run: () => handleNewChapter(null),
            },
          ]
        : []),
      /* What acts on the whole book stands with its contents. */
      { kind: "separator" },
      {
        kind: "item",
        id: "epub",
        label: "Save book as EPUB",
        icon: <FileDown size={16} />,
        run: () => void saveBook(),
      },
      ...(canWriteArchive
        ? [
            {
              kind: "item" as const,
              id: "ocr",
              label: indexingMedia ? "Reading images and PDFs…" : "Make images and PDFs searchable",
              icon: <Search size={16} />,
              run: () => void indexMedia(),
            },
          ]
        : []),
    ];
    const titlebar = compact ? null : (
      <div className={`manuscript-titlebar ${boardOpen ? "is-board" : ""}`}>
        {/* The two views by name. This was one unlabelled grid icon, which said
            neither that there was a second view nor how to come back from it. */}
        <span className="book-view-switch" role="radiogroup" aria-label="View">
          {(["Write", "Board"] as const).map((view) => {
            const chosen = (view === "Board") === boardOpen;
            return (
              <button
                key={view}
                type="button"
                role="radio"
                aria-checked={chosen}
                title={`${view} · ⌘\\`}
                className={`press ${chosen ? "is-active" : ""}`}
                onClick={() => !chosen && toggleBoard()}
              >
                {view === "Board" ? <Board size={14} /> : <Pencil size={14} />}
                {view}
              </button>
            );
          })}
        </span>
        {spaceSwitch || <span className="manuscript-titlebar-book">{currentSpace?.name}</span>}
        {/* On the board no chapter is open, so none is named. */}
        {!boardOpen && (
          <WritingMenuButton
            label="Chapters"
            icon={null}
            className="manuscript-titlebar-chapter press"
            items={chapterMenu}
          >
            <span>
              {chapterAt >= 0 ? `${chapterAt + 1} · ` : ""}
              {chapter ? pageLabel(chapter) : selected?.note.title || "Contents"}
            </span>
            <ChevronDown size={12} />
          </WritingMenuButton>
        )}
        <span className="manuscript-titlebar-end">
          {error || saveError ? (
            <span className="label text-danger" title={error || saveError} role="status">
              {error || "Save failed"}
            </span>
          ) : statusFlash ? (
            <span className="label text-accent" role="status">
              {statusFlash}
            </span>
          ) : null}
          <UpdateNotice />
          {roster.length > 1 && peopleShelf}
          {/* The bin is a place, as in the notes archive's rail, not an act on
              the page; so it is a button of its own, and ⋯ is the page's menu. */}
          <button
            type="button"
            className="toolbar-button press manuscript-trash"
            aria-label={docTrash.length ? `Trash, ${docTrash.length}` : "Trash"}
            title="Trash"
            onClick={() => openSheet({ kind: "trash" })}
          >
            <Trash2 size={16} />
            {docTrash.length > 0 && (
              <span className="manuscript-trash-count">{docTrash.length}</span>
            )}
          </button>
          {chapterItems.length > 0 && <WritingMenuButton label="More" items={chapterItems} />}
        </span>
      </div>
    );

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
            {compact && (
              <div className="structure-people">
                {spaceSwitch}
                {roster.length > 1 && peopleShelf}
              </div>
            )}
          </>
        }
        footer={
          compact && (
            <div className="sidebar-footer">
              <UpdateNotice />
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
              <button
                type="button"
                className="sidebar-footer-button press"
                onClick={(event) => {
                  setFoldersOpen(false);
                  openSheet({ kind: "trash" });
                }}
              >
                <span className="sidebar-glyph" data-tone="trash">
                  <Trash2 size={16} />
                </span>
                <span>Trash</span>
                {docTrash.length > 0 && <small className="ml-auto">{docTrash.length}</small>}
              </button>
            </div>
          )
        }
        documentName={currentSpace?.name ?? ""}
        total={compact ? manuscript.total : undefined}
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
        onRenamePart={handleRenamePart}
        onDeletePart={handleDeletePart}
        onMove={handleMoveChapter}
        onChapter={(id, chapter) => setNoteRow(viewAs, id, { chapter })}
        onTrash={handleTrashDocNote}
        onTrashAll={handleTrashDocNotes}
        onInfo={(id) => openSheet({ kind: "note", noteId: id })}
        headings={contents.find((entry) => entry.id === selectedId)?.headings}
        stats={statsShown ? { today: wordsToday } : undefined}
        onHeading={(text) => selectedId && openPlace({ noteId: selectedId, text })}
        board={{
          open: boardOpen,
          toggle: () => {
            setBoardOpen((open) => !open);
            if (compact) setFoldersOpen(false);
          },
        }}
      />
    );

    const chapterBoard = (
      <ChapterBoard
        titlebar={titlebar}
        notebook={compact ? undefined : manuscript.notebook}
        notebookName={notebookName}
        actions={
          compact
            ? undefined
            : {
                onOpen: openFromStructure,
                onInfo: (id) => openSheet({ kind: "note", noteId: id }),
                onMove: handleMoveChapter,
                onNewPart: handleNewPart,
                onNewChapter: handleNewChapter,
                onDeletePart: handleDeletePart,
                onTrash: handleTrashDocNote,
              }
        }
        onRenamePart={handleRenamePart}
        lead={
          compact ? (
            <button
              type="button"
              onClick={() => setFoldersOpen(true)}
              aria-label="Structure"
              className="ribbon-tool press"
            >
              <Structure size={18} />
            </button>
          ) : undefined
        }
        rows={manuscript.rows}
        parts={manuscript.parts}
        canWrite={canWriteArchive}
        onOpen={openFromStructure}
        onMove={handleMoveChapter}
        onChapter={(id, chapter) => setNoteRow(viewAs, id, { chapter })}
      />
    );

    /* No chapter is open only while there is none to open — see the effect
       that opens the last one written in. The desk then offers the first. */
    const titlePage = (
      <section className="editor-shell manuscript-shell flex min-w-0 flex-1 flex-col">
        {titlebar}
        <div className="manuscript-bar shrink-0">
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
        <div className="manuscript-desk manuscript-empty min-h-0 flex-1" />
      </section>
    );

    const pageEditor = selected ? (
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
          onSetPhoto={handleNotePhoto}
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
              ) : null}
            </>
          }
          headerActions={<>{docActions}</>}
          synced={collaborative.ready}
          session={session}
          commentAuthors={commentAuthors}
          linkable={linkableNotes}
          onOpenNote={handleOpenRecent}
          onRemarksChanged={refreshRemarks}
          onRemarksRead={markRemarksSeen}
          onOpenPerson={(userId) => pushSheet({ kind: "person", userId })}
          onDiscussInChat={canWriteArchive ? discussInChat : undefined}
          saidThreads={saidThreads}
          onContinueAsNote={
            chapterAt >= 0 && canWriteArchive
              ? (quote) => continueAsNote(selected.note.id, quote)
              : undefined
          }
          /* Research is a note, not a page of the book: it opens as one, so
             the two kinds never look the same. */
          manuscript={
            chapterAt >= 0
              ? {
                  page,
                  book: currentSpace?.name ?? "",
                  eyebrow: [partName, `Chapter ${chapterAt + 1}`].filter(Boolean).join(" · "),
                  footer: turn,
                  footnotes: docFeatures.footnotes,
                  citations: docFeatures.citations,
                  review: docFeatures.review,
                  goal: chapter?.chapter?.goal,
                  arrive: (() => {
                    const from = manuscript.chapters.findIndex(
                      (item) => item.id === lastOpened.current,
                    );
                    if (from < 0 || from === chapterAt) return undefined;
                    return from < chapterAt ? "next" : "previous";
                  })(),
                  titlebar,
                  bookWords: {
                    total: manuscript.total,
                    goal: docFeatures.wordGoal,
                    today: statsShown ? wordsToday : null,
                  },
                  numbered: docFeatures.numbering ? chapterAt + 1 : null,
                  topLevel: topLevel(
                    headingsOf(selected.note.content).map((heading) => heading.level),
                  ),
                }
              : undefined
          }
        />
      </Suspense>
    ) : (
      titlePage
    );
    /* A page that is not a chapter — research — opens as a note, which has no
       titlebar of its own. Without this one the book could not be left. */
    const chapterEditor =
      selected && chapterAt < 0 && titlebar ? (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {titlebar}
          {pageEditor}
        </div>
      ) : (
        pageEditor
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
            {boardOpen ? chapterBoard : chapterEditor}
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

    return (
      <div
        className={`workspace-shell writing-shell h-screen overflow-hidden ${
          focusMode ? "is-focus" : ""
        } ${focusMode && quiet ? "is-quiet" : ""}`}
      >
        <div className="workspace-grid flex h-full min-h-0">
          {boardOpen ? chapterBoard : chapterEditor}
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
                  titleMenu={collectionMenu}
                  filters={activeFilters}
                  meta={activeMeta}
                  selectedId={selectedId}
                  query={query}
                  loading={loading}
                  busy={saving}
                  canWrite={canWriteArchive}
                  folderLabel={folderLabel}
                  allNotes={selectedFolderId === ALL}
                  scopeLabel={scopeTag}
                  notice={listNotice}
                  trashMode={selectedFolderId === TRASH}
                  unreadIds={unreadRemarkNotes}
                  peerNotes={peerNotes}
                  peerTypingNoteIds={peerTypingNoteIds}
                  archiveMode={selectedFolderId === ARCHIVE}
                  searchRef={searchRef}
                  onQueryChange={setQuery}
                  onSelect={handleSelectFromList}
                  onNew={handleNew}
                  onMoveToTrash={handleMoveToTrash}
                  onRestore={handleRestore}
                  onArchiveChange={handleArchiveChange}
                  onDeleteForever={handleDeleteForever}
                  onTogglePin={handleTogglePin}
                  lockOf={lockFor}
                  onInfo={(noteId) => openSheet({ kind: "note", noteId })}
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
                    onSetPhoto={handleNotePhoto}
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
                    mentions={mentions}
                    onOpenNote={handleOpenRecent}
                    onRemarksChanged={refreshRemarks}
                    onRemarksRead={markRemarksSeen}
                    onOpenPerson={(userId) => pushSheet({ kind: "person", userId })}
                    onDiscussInChat={canWriteArchive ? discussInChat : undefined}
                    saidThreads={saidThreads}
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
        {driveImportDialog}
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
          {/* Two slides, not one. `⌘\` and the toggle take the folders away
              and leave the list where it is — hiding the sidebar used to take
              the notes with it, which is not what "sidebar" says. Focus mode
              is what takes both. */}
          <div
            className={`pane-slide is-sidebar ${navigationOpen ? "" : "is-collapsed"}`}
            style={{ width: navigationOpen ? sidebarShown + 1 : 0 }}
            aria-hidden={!navigationOpen}
            inert={!navigationOpen}
          >
            <div
              className="pane-slide-track flex h-full min-h-0"
              style={{ width: sidebarShown + 1 }}
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
            </div>
          </div>
          <div
            className={`pane-slide is-list ${listOpen ? "" : "is-collapsed"}`}
            style={{ width: listOpen ? listShown + 1 : 0 }}
            aria-hidden={!listOpen}
            inert={!listOpen}
          >
            <div className="pane-slide-track flex h-full min-h-0" style={{ width: listShown + 1 }}>
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
                  toolbarActions={collectionActions}
                  titleMenu={collectionMenu}
                  filters={activeFilters}
                  meta={activeMeta}
                  selectedId={selectedId}
                  query={query}
                  loading={loading}
                  busy={saving}
                  canWrite={canWriteArchive}
                  folderLabel={folderLabel}
                  allNotes={selectedFolderId === ALL}
                  scopeLabel={scopeTag}
                  notice={listNotice}
                  trashMode={selectedFolderId === TRASH}
                  unreadIds={unreadRemarkNotes}
                  peerNotes={peerNotes}
                  peerTypingNoteIds={peerTypingNoteIds}
                  archiveMode={selectedFolderId === ARCHIVE}
                  searchRef={searchRef}
                  onQueryChange={setQuery}
                  onSelect={handleSelectFromList}
                  onNew={handleNew}
                  onMoveToTrash={handleMoveToTrash}
                  onRestore={handleRestore}
                  onArchiveChange={handleArchiveChange}
                  onDeleteForever={handleDeleteForever}
                  onTogglePin={handleTogglePin}
                  lockOf={lockFor}
                  onInfo={(noteId) => openSheet({ kind: "note", noteId })}
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
              onDockedPanel={setDockedPanel}
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
              onSetPhoto={handleNotePhoto}
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
                listOpen ? (
                  sidebarToggle
                ) : (
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
                )
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
              mentions={mentions}
              onOpenNote={handleOpenRecent}
              onRemarksChanged={refreshRemarks}
              onRemarksRead={markRemarksSeen}
              onOpenPerson={(userId) => pushSheet({ kind: "person", userId })}
              onDiscussInChat={canWriteArchive ? discussInChat : undefined}
              saidThreads={saidThreads}
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
                  onSetPhoto={handleNotePhoto}
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
                  onRemarksChanged={refreshRemarks}
                  onRemarksRead={markRemarksSeen}
                  onOpenPerson={(userId) => pushSheet({ kind: "person", userId })}
                  onDiscussInChat={canWriteArchive ? discussInChat : undefined}
                  saidThreads={saidThreads}
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

        <DragOverlay dropAnimation={dropBack}>
          {dragEntry || dragFolder ? (
            <div className="drag-chip w-56 px-3 py-2">
              <p className="readout truncate text-ink">
                {dragFolder ? dragFolder.name : dragEntry?.note.title || "Untitled"}
              </p>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      {settingsPanel}
      {keyboardSheets}
      {editorMenu}
      {sheetStack}
      {driveImportDialog}
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
