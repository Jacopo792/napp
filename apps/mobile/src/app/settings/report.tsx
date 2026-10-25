import { useState } from "react";
import { Alert, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { REPORT_REASONS, reportSafetyIssue, type ReportReason } from "@/lib/storeSafety";
import { useArchive, usePalette } from "../../archive";
import { Line, Section, SettingsPage, Status } from "../../SettingsControls";
import { PillButton } from "../../Chrome";
import { PolicyLinks } from "../../PolicyLinks";

export default function Report() {
  const { noteId, userId, commentId } = useLocalSearchParams<{
    noteId?: string;
    userId?: string;
    commentId?: string;
  }>();
  const { refresh } = useArchive();
  const palette = usePalette();
  const router = useRouter();
  const [reason, setReason] = useState<ReportReason>("harassment");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const send = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await reportSafetyIssue({ reason, noteId, userId, commentId, details });
      refresh();
      router.dismissAll();
      router.replace("/");
      Alert.alert(
        "Report submitted",
        noteId
          ? "The developer can review the reported content. This note is hidden from you while pending review."
          : "The developer can review your report. You can also block this user in Safety.",
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not submit report");
    } finally {
      setBusy(false);
    }
  };
  return (
    <SettingsPage title="Report">
      <Section title="Reason">
        {REPORT_REASONS.map((item) => (
          <Line
            key={item.value}
            label={item.label}
            accessibilityRole="radio"
            accessibilityState={{ checked: reason === item.value }}
            disabled={busy}
            onPress={() => setReason(item.value)}
            value={reason === item.value ? "✓" : ""}
          />
        ))}
      </Section>
      <View style={{ marginHorizontal: 20, gap: 16 }}>
        <TextInput
          accessibilityLabel="Report details (optional)"
          placeholder="Details (optional)"
          placeholderTextColor={palette.ink4}
          value={details}
          onChangeText={setDetails}
          editable={!busy}
          multiline
          maxLength={2000}
          style={{
            color: palette.ink,
            borderColor: palette.rule,
            borderWidth: 1,
            borderRadius: 12,
            padding: 16,
            minHeight: 100,
            textAlignVertical: "top",
          }}
        />
        <Text style={{ color: palette.ink3, lineHeight: 22 }}>
          Submitting sends the reported content to the developer for review.
        </Text>
        <PolicyLinks />
      </View>
      {error ? <Status>{error}</Status> : null}
      <PillButton
        label={busy ? "Sending…" : "Submit report"}
        onPress={() => void send()}
        disabled={busy || (!noteId && !userId)}
      />
    </SettingsPage>
  );
}
