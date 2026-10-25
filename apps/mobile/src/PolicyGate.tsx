import { useEffect, useState, type ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { acceptPolicies, acceptedHere, loadPolicyAcceptance } from "@/lib/policyAcceptance";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useArchive, usePalette } from "./archive";
import { PolicyLinks } from "./PolicyLinks";
import { PillButton } from "./Chrome";

export function PolicyGate({ children }: { children: ReactNode }) {
  const { session, signOut } = useArchive();
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const [accepted, setAccepted] = useState(() => acceptedHere(session.userId));
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(!accepted);
  const [asked, setAsked] = useState(accepted);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  /* An account with no address is the phone's own notes, and is not asked:
     the terms are agreed to when an address is given (`linkAccount`). */
  const anonymous = !session.email;
  useEffect(() => {
    if (anonymous || acceptedHere(session.userId)) return;
    let live = true;
    void loadPolicyAcceptance(session.userId)
      .then((value) => {
        if (live) setAccepted(value);
      })
      .catch(() => {
        if (live) setError("Could not check your account. Please try again.");
      })
      .finally(() => {
        if (live) {
          setBusy(false);
          setAsked(true);
        }
      });
    return () => {
      live = false;
    };
  }, [session.userId, anonymous, attempt]);
  if (accepted || anonymous || acceptedHere(session.userId)) return children;
  /* Still asking: the launch screen is over everything, so draw nothing
     rather than flash a form at somebody who has already agreed. */
  if (!asked) return null;
  return (
    <ScrollView
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: "center",
        paddingTop: insets.top + 24,
        paddingBottom: insets.bottom + 24,
        paddingHorizontal: 24,
        gap: 20,
      }}
      style={{ backgroundColor: palette.page }}
    >
      <Text style={{ color: palette.ink, fontSize: 28, fontWeight: "700" }}>
        Before you continue
      </Text>
      <Text style={{ color: palette.ink3, fontSize: 16, lineHeight: 24 }}>
        Read Napp's terms and privacy policy before creating or sharing content.
      </Text>
      <PolicyLinks />
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        disabled={busy}
        onPress={() => setChecked((value) => !value)}
        style={{ minHeight: 44, flexDirection: "row", gap: 12, alignItems: "center" }}
      >
        <View
          style={{
            width: 24,
            height: 24,
            borderWidth: 1,
            borderColor: palette.ink3,
            borderRadius: 6,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: palette.ink }}>{checked ? "✓" : ""}</Text>
        </View>
        <Text style={{ color: palette.ink, flex: 1, lineHeight: 22 }}>
          I agree to the Terms of Use and have read the Privacy Policy.
        </Text>
      </Pressable>
      {error ? (
        <Text accessibilityRole="alert" style={{ color: palette.danger }}>
          {error}
        </Text>
      ) : null}
      {error ? (
        <PillButton
          label="Try again"
          disabled={busy}
          onPress={() => {
            setBusy(true);
            setError("");
            setAttempt((n) => n + 1);
          }}
        />
      ) : null}
      <PillButton
        label={busy ? "Checking…" : "Agree and continue"}
        disabled={busy || !checked}
        onPress={() => {
          setBusy(true);
          setError("");
          void acceptPolicies(session.userId)
            .then(() => setAccepted(true))
            .catch((reason: Error) => setError(reason.message))
            .finally(() => setBusy(false));
        }}
      />
      <PillButton label="Sign Out" onPress={() => void signOut()} disabled={busy} />
    </ScrollView>
  );
}
