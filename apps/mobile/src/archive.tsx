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
import { APPEARANCE_PRESETS, DEFAULT_APPEARANCE, setAppearance } from "@/lib/appearance";
import { setAxes } from "@/lib/axes";
import { setWritingPreferences } from "@/lib/writingPreferences";
import {
  pauseAccount as leaveForAccount,
  resumeAccount,
  chooseArchive,
  type AuthenticationResult,
} from "@/lib/session";
import { loadSpaces, type Space } from "@/lib/spaces";
import { loadProfile, saveProfile, type Profile } from "@/lib/supabase";
import { appearanceTokens, useAppearance } from "@/lib/appearance";
import { honourLocks } from "@/lib/noteActs";
import { clearSession, type AppSession } from "@/lib/session";
import { loadArchive, persistMetaDiff, type ArchiveSnapshot } from "@/lib/supabase";
import { subscribeToArchive, unsubscribeFromArchive } from "@/lib/sync";
import {
  subscribeToPresence,
  unsubscribeFromPresence,
  announceNote,
  type Presence,
} from "@/lib/presence";
import { EMPTY_META, type Meta } from "@/lib/types";
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
  switchAccount: (userId: string) => Promise<void>;
  spaces: Space[];
  preferences: AccountPreferences;
  preferencesReady: boolean;
  updatePreferences: (patch: Partial<AccountPreferences>) => void;
  switchArchive: (id: string) => Promise<void>;
  profile: Profile | null;
  updateProfile: (next: Profile) => Promise<void>;
  refresh: () => void;
  present: Presence;
  setOpenNote: (id: string | null) => void;
  /** The other members who made a note or have written in it — never one who
   *  is only reading it, which on a note of yours says they changed it. Empty
   *  when the reader has turned "Collaborators in notes" off. */
  facesOf: (noteId: string) => Face[];
}

const Context = createContext<Archive | null>(null);

export function useArchive(): Archive {
  const archive = useContext(Context);
  if (!archive) throw new Error("useArchive() outside an ArchiveProvider");
  return archive;
}

export function ArchiveProvider({
  session,
  onSignedOut,
  onSession,
  onAccountChange,
  children,
}: {
  session: AppSession;
  onSignedOut: () => void;
  onSession: (session: AppSession) => void;
  onAccountChange: (action: () => Promise<AuthenticationResult | null>) => Promise<void>;
  children: React.ReactNode;
}) {
  const [present, setPresent] = useState<Presence>(new Map());
  const [openNote, setOpenNote] = useState<string | null>(null);
  const noteRef = useRef(openNote);
  noteRef.current = openNote;
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  /* The account's row as it stands, and the phone's reading of it: every
     screen sees the phone's own look in `appearance` and `axes`. */
  const preferencesRef = useRef(localPreferences({}, session.userId));
  const [preferences, setPreferences] = useState(() => phoneView(preferencesRef.current));
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [snapshot, setSnapshot] = useState<ArchiveSnapshot | null>(null);
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
    let live = true;
    const adopt = (row: AccountPreferences) => {
      if (!live) return;
      preferencesRef.current = row;
      const next = phoneView(row);
      setPreferences(next);
      setAppearance(next.appearance);
      setAxes(next.axes);
      setWritingPreferences(next.writing);
      setPreferencesReady(true);
    };
    void pullAccountPreferences(session).then(adopt, (reason) => live && setError(String(reason)));
    const channel = subscribeToAccountPreferences(session, adopt);
    void loadSpaces(session).then(
      (next) => {
        if (!live) return;
        /* A book is written at a desk: the phone lists only notes archives, and
         one that opens on a book goes to a notes archive or the empty chooser. */
        const notes = next.filter((space) => space.kind !== "document");
        setSpaces(notes);
        if (!notes.length) {
          void writes.current
            .then(() =>
              live
                ? onAccountChange(async () => ({ session: null, account: session, archives: [] }))
                : undefined,
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
      (next) => live && setProfile(next),
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
  }, [session, preferencesReady, preferences.presence, wake, active]);
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
    const read = async () => {
      const version = revision.current;
      await writes.current;
      if (!live || version !== revision.current) return;
      try {
        const next = await loadArchive(session);
        if (live && version === revision.current) {
          setSnapshot(next);
          setError("");
        }
      } catch (reason) {
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
  }, [session, wake]);

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
          name: member.nickname || "Member",
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
      changeAccount(async () => {
        await clearSession();
        onSignedOut();
        return null;
      }),
    [changeAccount, onSignedOut],
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
      switchAccount,
      spaces,
      profile,
      preferences,
      preferencesReady,
      updatePreferences,
      switchArchive,
      updateProfile,
      refresh,
      present,
      setOpenNote,
      facesOf,
    }),
    [
      session,
      snapshot,
      error,
      act,
      metaOf,
      signOut,
      addAccount,
      switchAccount,
      spaces,
      profile,
      preferences,
      preferencesReady,
      updatePreferences,
      switchArchive,
      updateProfile,
      refresh,
      present,
      setOpenNote,
      facesOf,
    ],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/** The account's preferences as the phone wears them: its own look where it
 *  has chosen one, the defaults until then — never the computer's, wallpaper
 *  included. */
function phoneView(row: AccountPreferences): AccountPreferences {
  return {
    ...row,
    appearance: { ...(row.phone?.appearance ?? DEFAULT_APPEARANCE), folderColour: "auto" },
    axes: { size: 17, measure: 68, weight: 400, leading: 1.55, face: "system" },
  };
}

export interface Palette {
  dark: boolean;
  /** The ground the cards stand on: the page, taken most of the way to black
   *  in the dark, so a card reads as an object rather than a lighter grey. */
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
    /* Automatic follows the phone's display, including the ink and ground;
       a dark palette cannot supply white text to a light system surface. */
    const automatic = APPEARANCE_PRESETS.find(
      (preset) => preset.id === (dark ? "graphite" : "paper"),
    )!;
    const resolved =
      appearance.theme === "system"
        ? { ...appearance, background: automatic.background, foreground: automatic.foreground }
        : appearance;
    const t = appearanceTokens(resolved, dark);
    return {
      dark,
      page: dark ? deepen(t["--page"], 0.55) : t["--page"],
      canvas: t["--page"],
      paper: dark ? deepen(t["--paper"], 0.2) : t["--paper"],
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

/** A colour taken `amount` of the way to black. */
function deepen(hex: string, amount: number): string {
  const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex);
  if (!match) return hex;
  return `#${match
    .slice(1)
    .map((part) =>
      Math.round(parseInt(part, 16) * (1 - amount))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}
