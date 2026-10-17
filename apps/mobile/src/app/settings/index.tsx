import { Link, useRouter } from "expo-router";
import { Alert, Pressable, Text, View } from "react-native";
import { APPEARANCE_PRESETS } from "@/lib/appearance";
import { useArchive, usePalette } from "../../archive";
import { Avatar } from "../../Avatar";
import { SymbolView } from "../../icons";
import { attempt, Line, Section, SettingsPage } from "../../SettingsControls";

/* Account first, then grouped settings for this phone and this archive. */
export default function Settings() {
  const router = useRouter();
  const { session, snapshot, spaces, profile, preferences: p, signOut } = useArchive();
  const palette = usePalette();
  const current = spaces.find((space) => space.archiveId === session.archiveId);
  const go = (section: string) =>
    ({ pathname: "/settings/[section]", params: { section } }) as const;
  const look =
    APPEARANCE_PRESETS.find(
      (preset) =>
        preset.background === p.appearance.background && preset.accent === p.appearance.accent,
    )?.name ?? "Custom";
  const name = profile?.nickname || session.email.split("@")[0];
  return (
    <SettingsPage title="Settings">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Profile"
        onPress={() => router.push(go("profile"))}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: 14,
          padding: 16,
          borderRadius: 12,
          backgroundColor: palette.dark ? "#1c1c1e" : "#ffffff",
          marginHorizontal: 20,
          marginBottom: 24,
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <Avatar
          face={{
            userId: session.userId,
            name: profile?.nickname ?? "",
            avatarObject: profile?.avatarObject ?? null,
          }}
          email={session.email}
          size={58}
        />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: palette.ink, fontSize: 20, fontWeight: "600" }} numberOfLines={1}>
            {name}
          </Text>
          <Text style={{ color: palette.ink3, fontSize: 15 }} numberOfLines={1}>
            {session.email}
          </Text>
        </View>
        <SymbolView name="chevron.right" tintColor={palette.ink4} size={14} />
      </Pressable>
      <Section title="This phone">
        <Link href={go("appearance")} asChild>
          <Line label="Appearance" value={look} opens />
        </Link>
      </Section>
      <Section title="Archive">
        <Link href={go("archives")} asChild>
          <Line label="Archives" value={current?.name} opens />
        </Link>
        <Link href={go("members")} asChild>
          <Line label="Members" value={snapshot?.members.length} opens />
        </Link>
      </Section>
      <Section title="Writing & privacy">
        <Link href={go("writing")} asChild>
          <Line label="Writing" opens />
        </Link>
        <Link href={go("security")} asChild>
          <Line label="Privacy" opens />
        </Link>
      </Section>
      <Section>
        <Line
          label="Sign out"
          tone="danger"
          onPress={() =>
            Alert.alert("Sign out of Napp?", undefined, [
              { text: "Cancel", style: "cancel" },
              { text: "Sign out", style: "destructive", onPress: () => void attempt(signOut) },
            ])
          }
        />
      </Section>
    </SettingsPage>
  );
}
