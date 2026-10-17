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
import { setAppearance } from "@/lib/appearance";
import { setAxes } from "@/lib/axes";
import { setWritingPreferences } from "@/lib/writingPreferences";
import { chooseArchive } from "@/lib/session";
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

interface Archive {
  session: AppSession;
  snapshot: ArchiveSnapshot | null;
  error: string;
  /** One owner's metadata, changed: on screen at once, then in Postgres. */
  act: (owner: string, change: (prev: Meta) => Meta) => void;
  metaOf: (owner: string) => Meta;
  signOut: () => Promise<void>;
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
  children,
}: {
  session: AppSession;
  onSignedOut: () => void;
  onSession: (session: AppSession) => void;
  children: React.ReactNode;
}) {
  const [present, setPresent] = useState<Presence>(new Map());
  const [openNote, setOpenNote] = useState<string | null>(null);
  const noteRef = useRef(openNote);
  noteRef.current = openNote;
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [preferences, setPreferences] = useState(() => localPreferences({}, session.userId));
  const preferencesRef = useRef(preferences);
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
    const listener = AppState.addEventListener("change", (state) => {
      setActive(state === "active");
      if (state === "active") setWake((count) => count + 1);
    });
    return () => listener.remove();
  }, []);

  useEffect(() => {
    let live = true;
    const adopt = (next: AccountPreferences) => {
      if (!live) return;
      preferencesRef.current = next;
      setPreferences(next);
      setAppearance(next.appearance);
      setAxes(next.axes);
      setWritingPreferences(next.writing);
      setPreferencesReady(true);
    };
    void pullAccountPreferences(session).then(adopt, (reason) => live && setError(String(reason)));
    const channel = subscribeToAccountPreferences(session, adopt);
    void loadSpaces(session).then(
      (next) => live && setSpaces(next),
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
  }, [session, wake]);

  const updatePreferences = useCallback(
    (patch: Partial<AccountPreferences>) => {
      const next = { ...preferencesRef.current, ...patch };
      preferencesRef.current = next;
      setPreferences(next);
      setAppearance(next.appearance);
      setAxes(next.axes);
      setWritingPreferences(next.writing);
      pushAccountPreferences(session, next);
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
      onSession(await chooseArchive(session, id));
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

  const metaOf = useCallback((owner: string) => snapshot?.metas[owner] ?? EMPTY_META, [snapshot]);

  /* A refusal reads the archive again rather than leaving a list the archive
     disagrees with. */
  const act = useCallback(
    (owner: string, change: (prev: Meta) => Meta) => {
      const current = latest.current;
      if (!current) return;
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

  const signOut = useCallback(async () => {
    await writes.current;
    await clearSession();
    onSignedOut();
  }, [onSignedOut]);

  const value = useMemo(
    () => ({
      session,
      snapshot,
      error,
      act,
      metaOf,
      signOut,
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
    }),
    [
      session,
      snapshot,
      error,
      act,
      metaOf,
      signOut,
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
    ],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export interface Palette {
  dark: boolean;
  page: string;
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
    const t = appearanceTokens(appearance, dark);
    return {
      dark,
      page: t["--page"],
      paper: t["--paper"],
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
