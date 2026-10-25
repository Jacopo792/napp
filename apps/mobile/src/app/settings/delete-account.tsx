import { useEffect, useRef, useState } from "react";
import { Alert, Text, TextInput, View } from "react-native";
import { randomUUID } from "expo-crypto";
import { ACCOUNT_DELETION_CONSEQUENCES, eraseAccount } from "@/lib/accountDeletion";
import { purgeErasedAccount } from "@/lib/erasureLocal";
import { useArchive, usePalette } from "../../archive";
import { SettingsPage, Status } from "../../SettingsControls";
import { PillButton } from "../../Chrome";

export default function DeleteAccount() {
  const { session, signOut } = useArchive();
  const palette = usePalette();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const live = useRef(true);
  const active = useRef(session.userId);
  active.current = session.userId;
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const anonymous = !session.email;
  const remove = async () => {
    if (busy || (!password && !anonymous)) return;
    const userId = session.userId;
    setBusy(true);
    setError("");
    try {
      const key = `napp:erasure-receipt:${userId}`;
      const token = localStorage.getItem(key) ?? randomUUID();
      localStorage.setItem(key, token);
      const receipt = await eraseAccount(userId, anonymous ? null : password, token);
      setPassword("");
      await purgeErasedAccount(userId);
      if (!live.current || active.current !== userId) return;
      await signOut();
      Alert.alert(
        receipt.status === "completed" ? "Account deleted" : "Deletion in progress",
        receipt.status === "completed"
          ? "Your account and its data have been deleted. Documents created by other people have been kept."
          : "You have been signed out. Deletion continues automatically; you do not need to keep the app open.",
      );
    } catch (reason) {
      if (live.current && active.current === userId)
        setError(reason instanceof Error ? reason.message : "Could not delete this account");
    } finally {
      if (live.current) setBusy(false);
    }
  };

  return (
    <SettingsPage title="Delete account">
      <View style={{ marginHorizontal: 20, gap: 20 }}>
        <Text selectable style={{ color: palette.ink, fontSize: 17, fontWeight: "600" }}>
          {session.email || "This phone's notes"}
        </Text>
        <Text style={{ color: palette.ink3, fontSize: 16, lineHeight: 23 }}>
          {ACCOUNT_DELETION_CONSEQUENCES}
        </Text>
        {anonymous ? null : (
          <TextInput
            accessibilityLabel="Account password"
            placeholder="Account password"
            placeholderTextColor={palette.ink4}
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
            value={password}
            onChangeText={setPassword}
            style={{
              color: palette.ink,
              borderColor: palette.ink4,
              borderWidth: 1,
              borderRadius: 14,
              padding: 16,
              fontSize: 17,
            }}
          />
        )}
      </View>
      {error ? <Status>{error}</Status> : null}
      <View style={{ height: 24 }} />
      <PillButton
        label={busy ? "Deleting…" : "Delete account permanently"}
        tone="danger"
        disabled={busy || (!password && !anonymous)}
        onPress={() =>
          Alert.alert("Delete this account?", session.email || undefined, [
            { text: "Cancel", style: "cancel" },
            { text: "Delete permanently", style: "destructive", onPress: () => void remove() },
          ])
        }
      />
    </SettingsPage>
  );
}
