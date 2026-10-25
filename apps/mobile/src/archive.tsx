import { indexOf } from "@/lib/derived";
import type { Note } from "@/lib/types";
import { updateNoteProperties } from "@/lib/supabase";
import { traceStartup } from "./startupTrace";
/* The archive the phone is open on, held once for every screen: the session,
 * the snapshot Postgres returned, the Realtime channel that says it moved, and
 * the one way metadata changes. Every screen reads it; none of them loads it.
 *
 * What it does is the core's — session.ts, supabase.ts, sync.ts, noteActs.ts —
 * and the palette is the core's derivation of the account's own appearance,
 * pulled from the account the way the web pulls it. */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Alert, AppState, useColorScheme } from "react-native";
import {
  localPreferences,
  pullAccountPreferences,
  pushAccountPreferences,
  subscribeToAccountPreferences,
  type AccountPreferences,
} from "@/lib/accountPreferences";
import { currentAppearance, setAppearance } from "@/lib/appearance";
import { phonePreferences as phoneView } from "@/lib/preferenceShape";
import { currentAxes, setAxes } from "@/lib/axes";
import { currentWritingPreferences, setWritingPreferences } from "@/lib/writingPreferences";
import {
  pauseAccount as leaveForAccount,
  resumeAccount,
  chooseArchive,
  notesArchives,
  SignInAgain,
  type AuthenticationResult,
} from "@/lib/session";
import { loadSpaces, type Space } from "@/lib/spaces";
import { loadProfile, saveProfile, type Profile } from "@/lib/supabase";
import { appearanceTokens, phonePaletteOf, phoneSide, useAppearance } from "@/lib/appearance";
import { honourLocks } from "@/lib/noteActs";
import { clearSession, type AppSession } from "@/lib/session";
import { removeAccountContent } from "@/lib/accountContent";
import { signOutWithDeviceCleanup } from "@/lib/accountExit";
import { loadArchive, persistMetaDiff, type ArchiveSnapshot } from "@/lib/supabase";
import { subscribeToArchive, unsubscribeFromArchive } from "@/lib/sync";
import {
  subscribeToPresence,
  unsubscribeFromPresence,
  announceNote,
  type Presence,
} from "@/lib/presence";
import { EMPTY_META, type Meta } from "@/lib/types";
import { adoptArchiveCache, noteCache } from "@/lib/noteStore";
import type { Face } from "./Avatar";

interface Archive {
  session: AppSession;
  snapshot: ArchiveSnapshot | null;
  error: string;
  /** One owner's metadata, changed: on screen at once, then in Postgres. */
  act: (owner: string, change: (prev: Meta) => Meta) => void;
  metaOf: (owner: string) => Meta;
  signOut: () => Promise<void>;
  addAccount: () => Promise<void>;
  /** Tears this account down and opens whatever `action` signs into. */
  changeAccount: (action: () => Promise<AuthenticationResult | null>) => Promise<void>;
  /** The same account under a new session record (an address just linked). */
  adoptSession: (session: AppSession) => void;
  switchAccount: (userId: string) => Promise<void>;
  spaces: Space[];
  preferences: AccountPreferences;
  preferencesReady: boolean;
  updatePreferences: (patch: Partial<AccountPreferences>) => void;
  switchArchive: (id: string) => Promise<void>;
  profile: Profile | null;
  updateProfile: (next: Profile) => Promise<void>;
  refresh: () => void;
  updateArtwork: (noteId: string, patch: Partial<Pick<Note, "photo" | "cover">>) => Promise<void>;
  present: Presence;
  setOpenNote: (id: string | null) => void;
  /** The other members who made a note or have written in it — never one who
   *  is only reading it, which on a note of yours says they changed it. Empty
   *  when the reader has turned "Collaborators in notes" off. */
  facesOf: (noteId: string) => Face[];
  /** The first paint came from this phone's copy of the archive. */
  warm: boolean;
}

const Context = createContext<Archive | null>(null);

export function useArchive(): Archive {
  const archive = useContext(Context);
  if (!archive) throw new Error("useArchive() outside an ArchiveProvider");
  return archive;
}

export function ArchiveProvider({
  session,
  onSession,
  onAccountChange,
  children,
}: {
  session: AppSession;
  onSession: (session: AppSession) => void;
  onAccountChange: (action: () => Promise<AuthenticationResult | null>) => Promise<void>;
  children: React.ReactNode;
}) {
  const [present, setPresentState] = useState<Presence>(new Map());
  /* Only the other members, and only when where they are has changed. The
     channel says "sync" for every track, ours included — opening a note and
     closing it was each a new Map, and so a render of every screen mounted
     under the provider at the very moment the hand was reaching for the next
     thing. Nothing reads where this account is; the faces are the others'. */
  const setPresent = useCallback(
    (next: Presence) =>
      setPresentState((prev) => {
        const others = new Map([...next].filter(([userId]) => userId !== session.userId));
        if (others.size === prev.size && [...others].every(([id, at]) => prev.get(id) === at))
          return prev;
        return others;
      }),
    [session.userId],
  );
  const [openNote, setOpenNote] = useState<string | null>(null);
  useEffect(() => {
    traceStartup("provider mount");
    return () => traceStartup("provider unmount");
  }, []);
  const noteRef = useRef(openNote);
  noteRef.current = openNote;
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  /* The account's row as it stands, and the phone's reading of it: every
     screen sees the phone's own look in `appearance` and `axes`. */
  const preferencesRef = useRef(localPreferences({}, session.userId));
  const [preferences, setPreferences] = useState(() => phoneView(preferencesRef.current));
  const [preferencesReady, setPreferencesReady] = useState(false);
  /* What this phone saw of the archive last time, drawn at once and replaced
     when Postgres answers: the launch waited ~6 s for a catalogue the phone
     already had. Its notes also seed the core's note cache, so the first read
     asks only for the payloads that moved — the phone has no IndexedDB to
     keep them in as the web does. */
  const [warm] = useState(() => {
    traceStartup("warmUp…");
    const kept = warmUp(session);
    traceStartup("warm " + Boolean(kept));
    return kept;
  });
  const [snapshot, setSnapshot] = useState<ArchiveSnapshot | null>(warm);
  const latest = useRef(snapshot);
  latest.current = snapshot;
  const revision = useRef(0);
  const writes = useRef(Promise.resolve());
  const [error, setError] = useState("");
  /* Coming back to the foreground is the phone's version of the three signals
     in Notes.tsx: whatever happened while away was never announced, and the
     channel held across a sleep may be listening to nothing. So both are made
     again. */
  const [wake, setWake] = useState(0);
  const [active, setActive] = useState(AppState.currentState !== "background");
  useEffect(() => {
    let away = AppState.currentState === "background";
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "background") {
        away = true;
        setActive(false);
      } else if (state === "active" && away) {
        away = false;
        setActive(true);
        setWake((count) => count + 1);
      }
    });
    return () => listener.remove();
  }, []);

  useEffect(() => {
    traceStartup("prefs effect run");
    let live = true;
    const adopt = (row: AccountPreferences) => {
      traceStartup("prefs adopt");
      if (!live) return;
      /* Every wake pulls the row again; the same row is not a new look, and a
         new appearance object is every screen redrawn and the page re-themed. */
      if (JSON.stringify(row) === JSON.stringify(preferencesRef.current)) {
        setPreferencesReady(true);
        return;
      }
      preferencesRef.current = row;
      const next = phoneView(row);
      setPreferences(next);
      if (JSON.stringify(currentAppearance()) !== JSON.stringify(next.appearance))
        setAppearance(next.appearance);
      if (JSON.stringify(currentAxes()) !== JSON.stringify(next.axes)) setAxes(next.axes);
      if (JSON.stringify(currentWritingPreferences()) !== JSON.stringify(next.writing))
        setWritingPreferences(next.writing);
      setPreferencesReady(true);
    };
    void pullAccountPreferences(session).then(adopt, (reason) => {
      traceStartup("prefs failed " + String(reason));
      if (live) setError(String(reason));
    });
    const channel = subscribeToAccountPreferences(session, adopt);
    void loadSpaces(session).then(
      (next) => {
        traceStartup("spaces " + next.length);
        if (!live) return;
        /* A book is written at a desk: the phone lists only notes archives, and
         one that opens on a book goes to a notes archive or the empty chooser. */
        const notes = next.filter((space) => space.kind !== "document");
        setSpaces(notes);
        if (!notes.length) {
          /* Row level security answers a refused token with no rows, not an
             error: asked again through the check that tells the two apart.
             Archives after all is a stale read, left to the next one; a
             refused token is the sign-in page, on this account's address. */
          void writes.current
            .then(() => (live ? notesArchives(session) : null))
            .then(
              (archives) =>
                live && archives && !archives.length
                  ? onAccountChange(async () => ({ session: null, account: session, archives: [] }))
                  : undefined,
              (reason) =>
                !live
                  ? undefined
                  : reason instanceof SignInAgain
                    ? onAccountChange(() => Promise.reject(reason))
                    : setError(reason instanceof Error ? reason.message : String(reason)),
            )
            .catch((reason) => live && setError(String(reason)));
          return;
        }
        if (notes[0] && !notes.some((space) => space.archiveId === session.archiveId))
          void chooseArchive(session, notes[0].archiveId, { notesOnly: true }).then(
            (nextSession) => {
              if (live) onSession(nextSession);
            },
            (reason) => live && setError(String(reason)),
          );
      },
      (reason) => live && setError(String(reason)),
    );
    void loadProfile(session).then(
      (next) => {
        traceStartup("profile");
        if (live) setProfile(next);
      },
      (reason) => live && setError(String(reason)),
    );
    return () => {
      live = false;
      if (channel) void unsubscribeFromArchive(channel);
    };
  }, [session, wake, onSession, onAccountChange]);

  const updatePreferences = useCallback(
    ({ appearance, axes, ...patch }: Partial<AccountPreferences>) => {
      const before = preferencesRef.current;
      const row: AccountPreferences = {
        ...before,
        ...patch,
        phone: {
          ...before.phone,
          ...(appearance ? { appearance } : {}),
          ...(axes ? { axes } : {}),
        },
      };
      preferencesRef.current = row;
      const next = phoneView(row);
      setPreferences(next);
      /* Only what the patch touched: a fresh appearance object is a new
         palette, every screen redrawn and the open note re-themed — which a
         remark being marked read has no business causing. */
      if (appearance) setAppearance(next.appearance);
      if (axes) setAxes(next.axes);
      if (patch.writing) setWritingPreferences(next.writing);
      pushAccountPreferences(session, row);
    },
    [session],
  );

  const presenceChannel = useRef<ReturnType<typeof subscribeToPresence> | null>(null);
  useEffect(() => {
    if (!active || !preferencesReady || !preferences.presence) {
      setPresent(new Map());
      return;
    }
    const channel = subscribeToPresence(session, setPresent, () => noteRef.current);
    presenceChannel.current = channel;
    return () => {
      presenceChannel.current = null;
      void unsubscribeFromPresence(channel);
    };
  }, [session, preferencesReady, preferences.presence, wake, active, setPresent]);
  useEffect(() => {
    if (presenceChannel.current) void announceNote(presenceChannel.current, session, openNote);
  }, [session, openNote]);

  const refresh = useCallback(() => setWake((count) => count + 1), []);
  const switchArchive = useCallback(
    async (id: string) => {
      if (id === session.archiveId) return;
      await writes.current;
      onSession(await chooseArchive(session, id, { notesOnly: true }));
    },
    [session, onSession],
  );
  const updateProfile = useCallback(
    async (next: Profile) => {
      await saveProfile(session, next);
      setProfile(next);
      refresh();
    },
    [session, refresh],
  );

  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    traceStartup("load effect run");
    const read = async () => {
      const version = revision.current;
      traceStartup("read: writes…");
      await writes.current;
      traceStartup("read: loadArchive…");
      if (!live || version !== revision.current) return;
      try {
        const next = sameSnapshot(latest.current, await loadArchive(session));
        traceStartup("loadArchive ok");
        if (live && version === revision.current) {
          /* Our own write coming back over Realtime reads an archive that has
             not changed: the same object, and nothing re-renders. */
          if (next !== latest.current) {
            latest.current = next;
            setSnapshot(next);
            keepSnapshot(session, next);
          }
          setError("");
        }
      } catch (reason) {
        traceStartup("loadArchive failed " + String(reason));
        if (!live) return;
        // A deleted account or removed membership can make the archive's
        // single-row query fail. Recheck identity before showing that error;
        // a network failure must keep the cached archive available.
        try {
          const archives = await notesArchives(session);
          if (!live) return;
          if (!archives.some((archive) => archive.archiveId === session.archiveId)) {
            forgetSnapshot(session);
            await onAccountChange(async () => ({
              account: session,
              archives,
              session: archives[0]
                ? await chooseArchive(session, archives[0].archiveId, { notesOnly: true })
                : null,
            }));
            return;
          }
        } catch (identityError) {
          if (!live) return;
          if (identityError instanceof SignInAgain) {
            forgetSnapshot(session);
            await onAccountChange(() => Promise.reject(identityError));
            return;
          }
        }
        if (live) setError(reason instanceof Error ? reason.message : String(reason));
      }
    };
    /* A burst of saves is one read, as refreshRemote debounces it on the web. */
    const channel = subscribeToArchive(session.archiveId, () => {
      clearTimeout(timer);
      timer = setTimeout(read, 250);
    });
    read();
    return () => {
      live = false;
      clearTimeout(timer);
      void unsubscribeFromArchive(channel);
    };
  }, [session, wake, onAccountChange]);

  /* A face on a note means that member is in it now — nothing else. A face
     for having written there read as being there, on notes nobody had open
     (Jacopo, 19 October 2026). Who wrote what is History's to say. */
  const facesOf = useCallback(
    (noteId: string): Face[] => {
      if (!preferences.collaborators) return [];
      return (snapshot?.members ?? [])
        .filter((member) => !member.isSelf && present.get(member.userId) === noteId)
        .map((member) => ({
          userId: member.userId,
          name: member.nickname,
          avatarObject: member.avatarObject,
          online: true,
        }));
    },
    [snapshot, present, preferences.collaborators],
  );

  const metaOf = useCallback((owner: string) => snapshot?.metas[owner] ?? EMPTY_META, [snapshot]);

  /* A refusal reads the archive again rather than leaving a list the archive
     disagrees with. */
  const act = useCallback(
    (owner: string, change: (prev: Meta) => Meta) => {
      const current = latest.current;
      if (!current || current.members.find((member) => member.isSelf)?.role !== "editor") return;
      const before = current.metas[owner] ?? EMPTY_META;
      const after = honourLocks(before, change(before), session.userId);
      latest.current = { ...current, metas: { ...current.metas, [owner]: after } };
      setSnapshot(latest.current);
      revision.current += 1;
      writes.current = writes.current
        .then(() => persistMetaDiff(session, owner, before, after))
        .catch((reason) => {
          Alert.alert("Could not save", reason instanceof Error ? reason.message : String(reason));
          setWake((count) => count + 1);
        });
    },
    [session],
  );

  const changeAccount = useCallback(
    async (action: () => Promise<AuthenticationResult | null>) => {
      await writes.current;
      await onAccountChange(action);
    },
    [onAccountChange],
  );
  const addAccount = useCallback(
    () =>
      changeAccount(async () => {
        await leaveForAccount();
        return null;
      }),
    [changeAccount],
  );
  const switchAccount = useCallback(
    (userId: string) => changeAccount(() => resumeAccount(userId, { notesOnly: true })),
    [changeAccount],
  );
  const signOut = useCallback(
    () =>
      signOutWithDeviceCleanup({
        writes: writes.current,
        removeContent: () => removeAccountContent(session.userId),
        leave: () =>
          changeAccount(async () => {
            await clearSession();
            forgetSnapshot(session);
            /* Signed out of a real account: the sign-in page, whose Not Now
           is the only way to an anonymous one (`mayStartAnonymous`). */
            return null;
          }),
      }),
    [changeAccount, session],
  );

  const updateArtwork = useCallback(
    (noteId: string, patch: Partial<Pick<Note, "photo" | "cover">>) => {
      const write = writes.current.then(async () => {
        const before = latest.current;
        const entry = before?.entries.find((item) => item.note.id === noteId);
        const member = before?.members.find((item) => item.isSelf);
        const owner = entry?.note.ownerId ?? session.userId;
        const row = indexOf(before?.metas[owner] ?? EMPTY_META).byNote.get(noteId);
        if (
          !before ||
          !entry ||
          member?.role !== "editor" ||
          row?.trashedAt ||
          (row?.lockedBy && row.lockedBy !== session.userId)
        )
          throw new Error("This note cannot be changed.");
        const values = { photo: entry.note.photo, cover: entry.note.cover, ...patch };
        const changed = { ...entry, note: { ...entry.note, ...values } };
        const next = {
          ...before,
          entries: before.entries.map((item) => (item.note.id === noteId ? changed : item)),
        };
        revision.current += 1;
        latest.current = next;
        setSnapshot(next);
        try {
          await updateNoteProperties(session, noteId, patch);
          keepSnapshot(session, latest.current ?? next);
        } catch (reason) {
          const current = latest.current;
          if (current) {
            const restored = {
              ...current,
              entries: current.entries.map((item) => (item === changed ? entry : item)),
            };
            latest.current = restored;
            setSnapshot(restored);
            revision.current += 1;
          }
          throw reason;
        }
      });
      // Subsequent writes and account changes still wait after a refused edit.
      writes.current = write.catch(() => {});
      return write;
    },
    [session],
  );

  const value = useMemo(
    () => ({
      session,
      snapshot,
      error,
      act,
      metaOf,
      signOut,
      addAccount,
      changeAccount,
      adoptSession: onSession,
      switchAccount,
      spaces,
      profile,
      preferences,
      preferencesReady,
      updatePreferences,
      switchArchive,
      updateProfile,
      updateArtwork,
      refresh,
      present,
      setOpenNote,
      facesOf,
      warm: Boolean(warm),
    }),
    [
      session,
      snapshot,
      error,
      act,
      metaOf,
      signOut,
      addAccount,
      changeAccount,
      onSession,
      switchAccount,
      spaces,
      profile,
      preferences,
      preferencesReady,
      updatePreferences,
      switchArchive,
      updateProfile,
      updateArtwork,
      refresh,
      present,
      setOpenNote,
      facesOf,
      warm,
    ],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export interface Palette {
  dark: boolean;
  /** The ground the cards stand on, and `paper` the card: both the palette's
   *  own, so a card reads as an object rather than a lighter grey. */
  page: string;
  /** The page as the editor paints it — the note's own ground. */
  canvas: string;
  paper: string;
  surface: string;
  ink: string;
  ink2: string;
  ink3: string;
  ink4: string;
  rule: string;
  accent: string;
  onAccent: string;
  danger: string;
  folder: string;
}

/** The reader's appearance, as the web derives it, in the names the phone's
 *  styles use. Follows the system when the account asked for "system". */
export function usePalette(): Palette {
  const appearance = useAppearance();
  const system = useColorScheme();
  return useMemo(() => {
    const dark =
      appearance.theme === "dark" || (appearance.theme === "system" && system !== "light");
    /* One of the phone's five, on the side this light asks for: the stored
       colours only say which five, so Automatic turns with the display. */
    const side = phoneSide(phonePaletteOf(appearance), dark);
    const t = appearanceTokens({ ...appearance, ...side }, dark);
    return {
      dark,
      page: side.background,
      canvas: side.background,
      paper: side.card,
      surface: t["--surface"],
      ink: t["--ink"],
      ink2: t["--ink-2"],
      ink3: t["--ink-3"],
      ink4: t["--ink-4"],
      rule: t["--rule"],
      accent: t["--accent"],
      onAccent: t["--on-accent"],
      danger: t["--danger"],
      folder: t["--folder-tint"] ?? t["--accent"],
    };
  }, [appearance, system]);
}

/* ── This phone's copy of the archive ─────────────────────────────────────
   One key per account and archive in the synchronous localStorage
   (expo-sqlite), which is what lets the first frame have notes in it. The
   words are already on this device in the editor's own caches; signing out
   takes this copy with it. */
const snapshotKey = (session: AppSession) =>
  `napp:phone-snapshot:v1:${session.userId}:${session.archiveId}`;

/** The kept copy, its notes handed to the core's cache before the first read. */
function warmUp(session: AppSession): ArchiveSnapshot | null {
  const kept = readSnapshot(session);
  if (!kept) return null;
  adoptArchiveCache(session.archiveId);
  for (const entry of kept.entries)
    if (!noteCache.has(entry.note.id))
      noteCache.set(entry.note.id, { version: entry.version, note: entry.note });
  return kept;
}

function readSnapshot(session: AppSession): ArchiveSnapshot | null {
  try {
    const stored = JSON.parse(localStorage.getItem(snapshotKey(session)) ?? "null");
    return stored && Array.isArray(stored.entries) && stored.metas && Array.isArray(stored.members)
      ? (stored as ArchiveSnapshot)
      : null;
  } catch {
    return null;
  }
}

let keeping: ReturnType<typeof setTimeout> | undefined;
/** Written a beat after the screen has it: never in the frame that draws it. */
function keepSnapshot(session: AppSession, snapshot: ArchiveSnapshot) {
  clearTimeout(keeping);
  keeping = setTimeout(() => {
    try {
      localStorage.setItem(snapshotKey(session), JSON.stringify(snapshot));
    } catch {
      /* A full disk costs the next launch its head start, nothing more. */
    }
  }, 1500);
}

function forgetSnapshot(session: AppSession) {
  clearTimeout(keeping);
  try {
    localStorage.removeItem(snapshotKey(session));
  } catch {
    /* Nothing kept. */
  }
}

/** The archive as it was, when a read found nothing new: the note objects
 *  are the core's cached ones, so identity says whether a note moved. */
function sameSnapshot(before: ArchiveSnapshot | null, after: ArchiveSnapshot): ArchiveSnapshot {
  if (!before || before.entries.length !== after.entries.length) return after;
  for (let at = 0; at < after.entries.length; at += 1) {
    const a = before.entries[at]!;
    const b = after.entries[at]!;
    if (a.version !== b.version || a.note !== b.note) return after;
  }
  return before.seatLimit === after.seatLimit &&
    JSON.stringify(before.metas) === JSON.stringify(after.metas) &&
    JSON.stringify(before.members) === JSON.stringify(after.members)
    ? before
    : after;
}
