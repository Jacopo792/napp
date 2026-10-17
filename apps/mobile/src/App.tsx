/* The phone's interface, drawn with React Native. It draws; everything it
 * knows comes from the core, imported by the same `@/` names the web interface
 * uses, so the preview's stand-ins replace them here exactly as they do there. */
import { useEffect, useMemo, useState } from "react";
import { AppState, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { DEFAULT_APPEARANCE } from "@/lib/appearance";
import { derivedOf, indexOf } from "@/lib/derived";
import { formatStamp } from "@/lib/format";
import {
  authenticate,
  chooseArchive,
  restoreSession,
  type AppSession,
  type AuthenticationResult,
} from "@/lib/session";
import { loadArchive, type ArchiveSnapshot } from "@/lib/supabase";
import { EMPTY_META } from "@/lib/types";
import { subscribeToArchive, unsubscribeFromArchive } from "@/lib/sync";
import { NoteScreen } from "./NoteScreen";

/* ponytail: the three appearance colours as they are, until the derivation in
   applyAppearance is a pure function both interfaces read. */
const { background: ground, foreground: ink, accent } = DEFAULT_APPEARANCE;

export function App() {
  const [session, setSession] = useState<AppSession | null | undefined>(undefined);
  useEffect(() => {
    restoreSession().then(setSession, () => setSession(null));
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <SafeAreaView style={styles.screen}>
        {session === undefined ? null : session ? (
          <Notes session={session} />
        ) : (
          <SignIn onSession={setSession} />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
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
  const [open, setOpen] = useState<string | null>(null);
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

  if (error && !snapshot) return <Text style={styles.error}>{error}</Text>;

  const self = snapshot?.members.find((member) => member.isSelf);
  const lockedBy = open
    ? snapshot && indexOf(snapshot.metas[session.userId] ?? EMPTY_META).byNote.get(open)?.lockedBy
    : undefined;

  /* The list stays mounted under an open note, so coming back finds it where
     it was left. */
  return (
    <View style={styles.screen}>
      <FlatList
        data={notes}
        keyExtractor={(note) => note.id}
        contentInsetAdjustmentBehavior="automatic"
        ItemSeparatorComponent={() => <View style={styles.rule} />}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => setOpen(item.id)}>
            <Text style={styles.title} numberOfLines={1}>
              {item.title || "Untitled"}
            </Text>
            <Text style={styles.preview} numberOfLines={1}>
              <Text style={styles.stamp}>{formatStamp(item.updatedAt)} </Text>
              {derivedOf(item).preview}
            </Text>
          </Pressable>
        )}
      />
      {open ? (
        <NoteScreen
          key={open}
          session={session}
          noteId={open}
          name={self?.nickname || session.email.split("@")[0] || "Someone"}
          canEdit={!lockedBy || lockedBy === session.userId}
          onBack={() => setOpen(null)}
        />
      ) : null}
    </View>
  );
}

const muted = `${ink}88`;

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
  error: { color: "#ff453a", textAlign: "center" },
  row: { paddingHorizontal: 20, paddingVertical: 12, gap: 3 },
  title: { color: ink, fontSize: 17, fontWeight: "600" },
  preview: { color: muted, fontSize: 15 },
  stamp: { color: ink },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: `${ink}22`, marginLeft: 20 },
});
