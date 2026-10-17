/* The phone's interface, drawn with React Native. It draws; everything it
 * knows comes from the core, imported by the same `@/` names the web interface
 * uses, so the preview's stand-ins replace them here exactly as they do there. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, { LinearTransition } from "react-native-reanimated";
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { derivedOf, indexOf } from "@/lib/derived";
import { formatStamp } from "@/lib/format";
import { honourLocks, shelveNote, trashNote } from "@/lib/noteActs";
import {
  authenticate,
  chooseArchive,
  restoreSession,
  type AppSession,
  type AuthenticationResult,
} from "@/lib/session";
import { loadArchive, persistMetaDiff, type ArchiveSnapshot } from "@/lib/supabase";
import { EMPTY_META, type Meta } from "@/lib/types";
import { subscribeToArchive, unsubscribeFromArchive } from "@/lib/sync";
import { Archive, Trash2 } from "./icons";
import { NoteScreen } from "./NoteScreen";
import { SwipeRow, type Origin } from "./SwipeRow";
import { accent, danger, ground, ink, muted, rule, shelf } from "./theme";

export function App() {
  const [session, setSession] = useState<AppSession | null | undefined>(undefined);
  useEffect(() => {
    restoreSession().then(setSession, () => setSession(null));
  }, []);

  return (
    <GestureHandlerRootView style={styles.screen}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        {session === undefined ? null : session ? (
          <Notes session={session} />
        ) : (
          <SafeAreaView style={styles.screen}>
            <SignIn onSession={setSession} />
          </SafeAreaView>
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function SignIn({ onSession }: { onSession: (session: AppSession) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  /* An account in several archives picks one, as it does on the web. */
  const [choosing, setChoosing] = useState<AuthenticationResult | null>(null);

  async function attempt(action: () => Promise<void>) {
    setError("");
    try {
      await action();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  const submit = () =>
    attempt(async () => {
      const result = await authenticate(email.trim(), password);
      if (result.session) onSession(result.session);
      else setChoosing(result);
    });

  if (choosing)
    return (
      <View style={styles.signIn}>
        {choosing.archives.map((archive) => (
          <Pressable
            key={archive.archiveId}
            style={styles.field}
            onPress={() =>
              attempt(async () =>
                onSession(await chooseArchive(choosing.account, archive.archiveId)),
              )
            }
          >
            <Text style={styles.title}>{archive.name}</Text>
          </Pressable>
        ))}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    );

  return (
    <View style={styles.signIn}>
      <TextInput
        style={styles.field}
        placeholder="Email"
        placeholderTextColor={muted}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.field}
        placeholder="Password"
        placeholderTextColor={muted}
        secureTextEntry
        autoComplete="current-password"
        value={password}
        onChangeText={setPassword}
        onSubmitEditing={submit}
      />
      <Pressable style={styles.button} onPress={submit}>
        <Text style={styles.buttonLabel}>Sign in</Text>
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

function Notes({ session }: { session: AppSession }) {
  const [snapshot, setSnapshot] = useState<ArchiveSnapshot | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<{ id: string; origin: Origin } | null>(null);
  const insets = useSafeAreaInsets();
  /* Coming back to the foreground is the phone's version of the three signals
     in Notes.tsx: whatever happened while away was never announced, and the
     channel held across a sleep may be listening to nothing. So both are
     made again. */
  const [wake, setWake] = useState(0);
  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") setWake((count) => count + 1);
    });
    return () => listener.remove();
  }, []);

  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = () =>
      loadArchive(session).then(
        (next) => live && (setSnapshot(next), setError("")),
        (reason) => live && setError(reason instanceof Error ? reason.message : String(reason)),
      );
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

  const notes = useMemo(() => {
    if (!snapshot) return [];
    const meta = indexOf(snapshot.metas[session.userId] ?? EMPTY_META);
    return snapshot.entries
      .map((entry) => entry.note)
      .filter((note) => (note.ownerId ?? session.userId) === session.userId)
      .filter(
        (note) => !meta.byNote.get(note.id)?.trashedAt && !meta.byNote.get(note.id)?.archivedAt,
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [snapshot, session.userId]);

  /* One row open at a time: opening one closes the rest. */
  const closers = useRef(new Map<string, () => void>());
  const register = useCallback((id: string, close: () => void) => {
    closers.current.set(id, close);
    return () => void closers.current.delete(id);
  }, []);
  const claim = useCallback((id: string) => {
    for (const [other, close] of closers.current) if (other !== id) close();
  }, []);

  /* The act on the list, then on the archive. The row has already gone; the
     metadata follows it at once, and the write after it — a refusal reads the
     archive again rather than leaving a list the archive disagrees with. */
  const act = useCallback(
    (change: (prev: Meta) => Meta) => {
      if (!snapshot) return;
      const before = snapshot.metas[session.userId] ?? EMPTY_META;
      const after = honourLocks(before, change(before), session.userId);
      setSnapshot({ ...snapshot, metas: { ...snapshot.metas, [session.userId]: after } });
      persistMetaDiff(session, session.userId, before, after).catch(() =>
        setWake((count) => count + 1),
      );
    },
    [snapshot, session],
  );

  if (error && !snapshot) return <Text style={styles.error}>{error}</Text>;

  const self = snapshot?.members.find((member) => member.isSelf);
  const lockedBy = open
    ? snapshot &&
      indexOf(snapshot.metas[session.userId] ?? EMPTY_META).byNote.get(open.id)?.lockedBy
    : undefined;

  /* The list stays mounted under an open note, so coming back finds it where
     it was left — and the note closes back into the row it came out of. */
  return (
    <View style={styles.screen}>
      <Animated.FlatList
        data={notes}
        keyExtractor={(note) => note.id}
        itemLayoutAnimation={LinearTransition}
        contentContainerStyle={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
        ListHeaderComponent={<Text style={styles.heading}>Notes</Text>}
        ItemSeparatorComponent={() => <View style={styles.rule} />}
        renderItem={({ item }) => (
          <SwipeRow
            title={item.title || "Untitled"}
            stamp={formatStamp(item.updatedAt)}
            preview={derivedOf(item).preview}
            left={{
              label: "Delete",
              Icon: Trash2,
              colour: danger,
              run: () => act((prev) => trashNote(prev, item.id)),
            }}
            right={{
              label: "Archive",
              Icon: Archive,
              colour: shelf,
              run: () => act((prev) => shelveNote(prev, item.id, true)),
            }}
            onOpen={(origin) => setOpen({ id: item.id, origin })}
            onClaim={() => claim(item.id)}
            register={(close) => register(item.id, close)}
          />
        )}
      />
      {open ? (
        <NoteScreen
          key={open.id}
          session={session}
          noteId={open.id}
          origin={open.origin}
          name={self?.nickname || session.email.split("@")[0] || "Someone"}
          canEdit={!lockedBy || lockedBy === session.userId}
          onClosed={() => setOpen(null)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: ground },
  signIn: { flex: 1, justifyContent: "center", padding: 24, gap: 12 },
  field: {
    color: ink,
    fontSize: 17,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: `${ink}14`,
  },
  button: { backgroundColor: accent, borderRadius: 10, paddingVertical: 13, alignItems: "center" },
  buttonLabel: { color: "#ffffff", fontSize: 17, fontWeight: "600" },
  error: { color: danger, textAlign: "center" },
  title: { color: ink, fontSize: 17, fontWeight: "600" },
  heading: {
    color: ink,
    fontSize: 34,
    fontWeight: "700",
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 8,
  },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: rule, marginLeft: 20 },
});
