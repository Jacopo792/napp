import { Link, useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { APPEARANCE_PRESETS } from "@/lib/appearance";
import { PRESENCE_PALETTES } from "@/lib/writingPreferences";
import { useArchive, usePalette } from "../../archive";
import { Avatar } from "../../Avatar";
import { attempt, Line, SERIF, Section, SettingsPage } from "../../SettingsControls";

/* The contents page: who you are at the top, then what each section holds,
   named by its value rather than by a coloured tile. */
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
          marginHorizontal: 20,
          marginBottom: 30,
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
          <Text
            style={{ color: palette.ink, fontFamily: SERIF, fontSize: 24, fontWeight: "600" }}
            numberOfLines={1}
          >
            {name}
          </Text>
          <Text style={{ color: palette.ink3, fontSize: 15 }} numberOfLines={1}>
            {session.email}
          </Text>
        </View>
      </Pressable>
      <Section title="Archive">
        <Link href={go("archives")} asChild>
          <Line label="Archives" value={current?.name} opens />
        </Link>
        <Link href={go("members")} asChild>
          <Line label="Members" value={snapshot?.members.length} opens />
        </Link>
      </Section>
      <Section title="This phone">
        <Link href={go("appearance")} asChild>
          <Line label="Appearance" value={look} opens />
        </Link>
        <Link href={go("reading")} asChild>
          <Line
            label="Reading"
            value={`${p.axes.face === "serif" ? "Serif" : "System"} · ${p.axes.size}`}
            opens
          />
        </Link>
      </Section>
      <Section title="Account">
        <Link href={go("writing")} asChild>
          <Line
            label="Writing"
            value={
              PRESENCE_PALETTES.find((colour) => colour.id === p.writing.presencePalette)?.name
            }
            opens
          />
        </Link>
        <Link href={go("security")} asChild>
          <Line label="Privacy" opens />
        </Link>
      </Section>
      <Section>
        <Line label="Sign Out" tone="danger" onPress={() => void attempt(signOut)} />
      </Section>
    </SettingsPage>
  );
}
