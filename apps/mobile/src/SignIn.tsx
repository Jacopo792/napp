/* Signing in: the core's `authenticate`, and the archive chooser for an
 * account in several, as on the web. */
import { useState } from "react";
import { KeyboardAvoidingView, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  authenticate,
  chooseArchive,
  type AppSession,
  type AuthenticationResult,
} from "@/lib/session";
import { usePalette } from "./archive";

export function SignIn({ onSession }: { onSession: (session: AppSession) => void }) {
  const palette = usePalette();
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [choosing, setChoosing] = useState<AuthenticationResult | null>(null);

  async function attempt(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  const submit = () =>
    attempt(async () => {
      const result = await authenticate(email.trim(), password);
      if (result.session) onSession(result.session);
      else setChoosing(result);
    });

  const field = [styles.field, { color: palette.ink, backgroundColor: palette.paper }];
  const button = ({ pressed }: { pressed: boolean }) => [
    styles.button,
    { backgroundColor: palette.accent, opacity: pressed ? 0.75 : 1 },
  ];

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.page }]}>
      <KeyboardAvoidingView behavior="padding" style={styles.form}>
        {choosing ? (
          choosing.archives.map((archive) => (
            <Pressable
              key={archive.archiveId}
              disabled={busy}
              style={({ pressed }) => [...field, pressed && { backgroundColor: palette.surface }]}
              onPress={() =>
                attempt(async () =>
                  onSession(await chooseArchive(choosing.account, archive.archiveId)),
                )
              }
            >
              <Text style={[styles.label, { color: palette.ink }]}>{archive.name}</Text>
            </Pressable>
          ))
        ) : (
          <>
            <TextInput
              style={field}
              placeholder="Email"
              placeholderTextColor={palette.ink4}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <TextInput
              style={field}
              placeholder="Password"
              placeholderTextColor={palette.ink4}
              secureTextEntry
              autoComplete="current-password"
              value={password}
              onChangeText={setPassword}
              onSubmitEditing={submit}
            />
            <Pressable style={button} disabled={busy} onPress={submit}>
              <Text style={[styles.label, { color: palette.onAccent }]}>
                {busy ? "Signing in…" : "Sign in"}
              </Text>
            </Pressable>
          </>
        )}
        {error ? (
          <View>
            <Text style={[styles.error, { color: palette.danger }]}>{error}</Text>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  form: { flex: 1, justifyContent: "center", padding: 24, gap: 12 },
  field: { fontSize: 17, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 14 },
  button: { borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  label: { fontSize: 17, fontWeight: "600" },
  error: { textAlign: "center", fontSize: 15 },
});
