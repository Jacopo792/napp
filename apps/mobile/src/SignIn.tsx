/* Signing in stays deliberately small: the core owns the account flow; this
 * screen gives it a native, calm place to happen. */
import { useRef, useState, type ComponentRef } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  authenticate,
  otherAccounts,
  chooseArchive,
  type AppSession,
  type AuthenticationResult,
} from "@/lib/session";
import { createSpace } from "@/lib/spaces";
import { useTextPrompt } from "./TextPrompt";
import { usePalette } from "./archive";
import { Press } from "./Grouped";
import { SymbolView } from "./icons";

export function SignIn({
  onSession,
  initialChoosing = null,
  onResume,
}: {
  onSession: (session: AppSession) => void;
  initialChoosing?: AuthenticationResult | null;
  onResume: (userId: string) => Promise<void>;
}) {
  const prompt = useTextPrompt();
  const saved = otherAccounts("");
  const palette = usePalette();
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [error, setError] = useState("");
  const [choosing, setChoosing] = useState<AuthenticationResult | null>(initialChoosing);
  const passwordInput = useRef<ComponentRef<typeof TextInput>>(null);

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

  const submit = () => {
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    void attempt(async () => {
      const result = await authenticate(email.trim(), password, undefined, { notesOnly: true });
      setPassword("");
      if (result.session) onSession(result.session);
      else setChoosing(result);
    });
  };

  const input = [styles.input, { color: palette.ink }];

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: palette.page }]}
      edges={["top", "bottom"]}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboard}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
            <View style={styles.brand}>
              <Text style={[styles.wordmark, { color: palette.ink }]}>napp</Text>
              <View style={[styles.brandDot, { backgroundColor: palette.ink }]} />
            </View>
            <View
              style={styles.art}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              pointerEvents="none"
            >
              <View
                style={[
                  styles.sheet,
                  styles.backSheet,
                  { backgroundColor: palette.dark ? "#746F61" : "#DAD4C5" },
                ]}
              />
              <View
                style={[
                  styles.sheet,
                  styles.middleSheet,
                  { backgroundColor: palette.dark ? "#AAA28F" : "#E9E3D5" },
                ]}
              />
              <View
                style={[
                  styles.sheet,
                  styles.frontSheet,
                  { backgroundColor: palette.dark ? "#EAE4D7" : "#FFFCF4" },
                ]}
              >
                <SymbolView name="text.alignleft" size={22} tintColor="#575347" />
                <Text style={styles.noteText}>A place for{`\n`}your thoughts.</Text>
                <View style={styles.noteRule} />
                <View style={[styles.noteRule, { width: "54%" }]} />
                <View style={styles.noteStamp}>
                  <SymbolView name="pencil" size={17} tintColor="#575347" />
                </View>
              </View>
            </View>
            <View style={styles.intro}>
              <Text style={[styles.title, { color: palette.ink }]}>
                {choosing ? "Your spaces." : "Welcome back."}
              </Text>
              <Text style={[styles.lede, { color: palette.ink3 }]}>
                {choosing ? "Choose your archive" : "Sign in to your notes."}
              </Text>
            </View>

            {choosing ? (
              <View style={styles.choice}>
                <View style={styles.choiceList}>
                  {!choosing.archives.length ? (
                    <>
                      <Text style={{ color: palette.ink3, fontSize: 16, lineHeight: 23 }}>
                        No notes archives yet. Books stay on your computer.
                      </Text>
                      <Press
                        accessibilityRole="button"
                        disabled={busy}
                        style={[styles.archiveButton, { backgroundColor: palette.paper }]}
                        onPress={() =>
                          prompt("New Archive", "A space for your notes.", (name) => {
                            if (!name.trim()) return;
                            void attempt(async () =>
                              onSession(
                                await chooseArchive(
                                  choosing.account,
                                  await createSpace(name.trim(), "notes"),
                                  { notesOnly: true },
                                ),
                              ),
                            );
                          })
                        }
                      >
                        <Text style={[styles.archiveName, { color: palette.ink }]}>
                          Create Notes Archive
                        </Text>
                      </Press>
                    </>
                  ) : null}
                  {choosing.archives.map((archive) => (
                    <Press
                      key={archive.archiveId}
                      feedback="scale"
                      disabled={busy}
                      accessibilityRole="button"
                      accessibilityLabel={`Open ${archive.name}`}
                      style={[styles.archiveButton, { backgroundColor: palette.paper }]}
                      onPress={() =>
                        void attempt(async () =>
                          onSession(
                            await chooseArchive(choosing.account, archive.archiveId, {
                              notesOnly: true,
                            }),
                          ),
                        )
                      }
                    >
                      <Text style={[styles.archiveName, { color: palette.ink }]}>
                        {archive.name}
                      </Text>
                      <Text style={[styles.archiveOpen, { color: palette.ink3 }]}>Open</Text>
                    </Press>
                  ))}
                </View>
                <Press
                  feedback="scale"
                  onPress={() => {
                    setChoosing(null);
                    setPassword("");
                    setError("");
                  }}
                  disabled={busy}
                  style={{ paddingVertical: 20 }}
                  accessibilityRole="button"
                >
                  <Text style={{ color: palette.ink3, fontSize: 15 }}>Use another account</Text>
                </Press>
              </View>
            ) : (
              <View style={styles.card}>
                <View
                  style={[
                    styles.field,
                    {
                      borderColor: palette.rule,
                      backgroundColor: palette.dark ? "#1C1C1A" : "#FFFFFF",
                    },
                  ]}
                >
                  <Text style={[styles.fieldLabel, { color: palette.ink3 }]}>Email</Text>
                  <TextInput
                    style={input}
                    placeholder="you@example.com"
                    placeholderTextColor={palette.ink4}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="email"
                    keyboardType="email-address"
                    textContentType="emailAddress"
                    returnKeyType="next"
                    value={email}
                    onSubmitEditing={() => passwordInput.current?.focus()}
                    onChangeText={(next) => {
                      setEmail(next);
                      if (error) setError("");
                    }}
                    accessibilityLabel="Email"
                  />
                </View>

                <View
                  style={[
                    styles.field,
                    {
                      borderColor: palette.rule,
                      backgroundColor: palette.dark ? "#1C1C1A" : "#FFFFFF",
                    },
                  ]}
                >
                  <View style={styles.passwordLabel}>
                    <Text style={[styles.fieldLabel, { color: palette.ink3 }]}>Password</Text>
                    <Pressable
                      hitSlop={10}
                      onPress={() => setPasswordVisible((visible) => !visible)}
                      accessibilityRole="button"
                      accessibilityLabel={passwordVisible ? "Hide password" : "Show password"}
                    >
                      <Text style={[styles.reveal, { color: palette.ink3 }]}>
                        {passwordVisible ? "Hide" : "Show"}
                      </Text>
                    </Pressable>
                  </View>
                  <TextInput
                    ref={passwordInput}
                    style={input}
                    placeholder="Your password"
                    placeholderTextColor={palette.ink4}
                    secureTextEntry={!passwordVisible}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="current-password"
                    textContentType="password"
                    returnKeyType="go"
                    value={password}
                    onChangeText={(next) => {
                      setPassword(next);
                      if (error) setError("");
                    }}
                    onSubmitEditing={submit}
                    accessibilityLabel="Password"
                  />
                </View>
              </View>
            )}

            {error ? (
              <View
                style={[styles.errorBox, { backgroundColor: `${palette.danger}18` }]}
                accessibilityRole="alert"
              >
                <Text style={[styles.error, { color: palette.danger }]}>{error}</Text>
              </View>
            ) : null}

            {!choosing ? (
              <Press
                feedback="scale"
                style={[styles.submit, { backgroundColor: palette.ink, opacity: busy ? 0.62 : 1 }]}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={busy ? "Signing in" : "Sign in"}
                onPress={submit}
              >
                <Text style={[styles.submitLabel, { color: palette.page }]}>
                  {busy ? "Signing in…" : "Continue"}
                </Text>
                <SymbolView name="arrow.right" size={20} tintColor={palette.page} />
              </Press>
            ) : null}
            {saved.length ? (
              <View style={{ gap: 10, marginTop: 24 }}>
                <Text style={{ color: palette.ink3, fontSize: 13 }}>SAVED ON THIS PHONE</Text>
                {saved.map((account) => (
                  <Press
                    key={account.userId}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel={`Return to ${account.email}`}
                    style={[styles.archiveButton, { backgroundColor: palette.paper }]}
                    onPress={() => void attempt(() => onResume(account.userId))}
                  >
                    <Text numberOfLines={1} style={[styles.archiveName, { color: palette.ink }]}>
                      {account.email}
                    </Text>
                    <SymbolView name="arrow.right" size={18} tintColor={palette.ink3} />
                  </Press>
                ))}
              </View>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  keyboard: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: 28, paddingTop: 18, paddingBottom: 28 },
  content: { width: "100%", maxWidth: 440, alignSelf: "center", flexGrow: 1 },
  brand: { flexDirection: "row", alignItems: "baseline", gap: 3 },
  wordmark: { fontSize: 30, fontWeight: "700", letterSpacing: -1.6 },
  brandDot: { width: 6, height: 6, borderRadius: 3 },
  art: { height: 280, alignItems: "center", justifyContent: "center", marginVertical: 14 },
  sheet: {
    position: "absolute",
    width: 174,
    height: 212,
    borderRadius: 12,
    borderCurve: "continuous",
  },
  backSheet: { transform: [{ translateX: -29 }, { rotate: "-16deg" }], top: 40 },
  middleSheet: { transform: [{ translateX: 24 }, { rotate: "13deg" }], top: 38 },
  frontSheet: {
    padding: 22,
    transform: [{ rotate: "-4deg" }],
    top: 28,
    boxShadow: "0px 12px 24px rgba(0,0,0,0.12)",
  },
  noteText: {
    fontSize: 20,
    lineHeight: 25,
    fontWeight: "600",
    letterSpacing: -0.6,
    color: "#35332D",
    marginTop: 16,
    marginBottom: 17,
  },
  noteRule: {
    height: 2,
    borderRadius: 1,
    backgroundColor: "#D7D1C4",
    width: "80%",
    marginBottom: 8,
  },
  noteStamp: { alignSelf: "flex-end", marginTop: 4 },
  intro: { marginBottom: 25 },
  title: { fontSize: 36, fontWeight: "600", letterSpacing: -1.4, lineHeight: 44 },
  lede: { fontSize: 16, lineHeight: 23, marginTop: 5 },
  card: { gap: 12 },
  field: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 12,
    borderRadius: 18,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
  },
  fieldLabel: { fontSize: 12, fontWeight: "500" },
  passwordLabel: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  reveal: { fontSize: 12, fontWeight: "600" },
  input: { fontSize: 17, minHeight: 27, padding: 0, marginTop: 4 },
  submit: {
    minHeight: 58,
    borderRadius: 29,
    marginTop: 20,
    paddingHorizontal: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  submitLabel: { fontSize: 17, fontWeight: "600" },
  errorBox: { borderRadius: 14, paddingHorizontal: 15, paddingVertical: 12, marginTop: 14 },
  error: { fontSize: 14, lineHeight: 20, fontWeight: "500" },
  choice: { width: "100%" },
  choiceList: { gap: 10 },
  archiveButton: {
    minHeight: 68,
    borderRadius: 18,
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  archiveName: { flex: 1, flexShrink: 1, fontSize: 17, fontWeight: "600", paddingRight: 16 },
  archiveOpen: { flexShrink: 0, fontSize: 15, fontWeight: "500" },
});
