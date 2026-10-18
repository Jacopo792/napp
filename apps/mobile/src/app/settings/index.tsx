import { Link } from "expo-router";
import { Text, View } from "react-native";
import { APPEARANCE_PRESETS } from "@/lib/appearance";
import { useArchive, usePalette } from "../../archive";
import { Avatar } from "../../Avatar";
import { Press } from "../../Grouped";
import { SymbolView } from "../../icons";
import { Line, Section, SettingsPage } from "../../SettingsControls";
import { Card } from "../../Chrome";

/* You, then the archive you are in, then how this phone looks and how you
   write, then leaving — the order they are reached for. Every row says where
   it goes and, on the line under its name, what is set there now. */
export default function Settings() {
  const { session, snapshot, spaces, profile, preferences: p } = useArchive();
  const palette = usePalette();
  const current = spaces.find((space) => space.archiveId === session.archiveId);
  const go = (section: string) =>
    ({ pathname: "/settings/[section]", params: { section } }) as const;
  const look =
    p.appearance.theme === "system"
      ? "Automatic"
      : (APPEARANCE_PRESETS.find(
          (preset) =>
            preset.background === p.appearance.background &&
            preset.foreground === p.appearance.foreground,
        )?.name ?? "Custom");
  const name = profile?.nickname || session.email.split("@")[0];
  return (
    <SettingsPage title="Settings">
      <Link href={go("profile")} asChild>
        <Press
          feedback="scale"
          accessibilityRole="button"
          accessibilityLabel={`${name}, Profile`}
          style={{ marginHorizontal: 16, marginBottom: 16 }}
        >
          <Card
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 16,
              paddingVertical: 18,
              paddingHorizontal: 18,
            }}
          >
            <Avatar
              face={{
                userId: session.userId,
                name: profile?.nickname ?? "",
                avatarObject: profile?.avatarObject ?? null,
              }}
              email={session.email}
              size={60}
            />
            <View style={{ flex: 1, gap: 3 }}>
              <Text
                style={{ color: palette.ink, fontSize: 21, fontWeight: "700", letterSpacing: -0.4 }}
                numberOfLines={1}
              >
                {name}
              </Text>
              <Text style={{ color: palette.ink3, fontSize: 15 }} numberOfLines={1}>
                {session.email}
              </Text>
            </View>
            <SymbolView name="chevron.right" tintColor={palette.ink4} size={14} weight="semibold" />
          </Card>
        </Press>
      </Link>
      <Section title="Archive">
        <Link href={go("archives")} asChild>
          <Line icon="archivebox" label="Archives" note={current?.name} opens />
        </Link>
        <Link href={go("members")} asChild>
          <Line
            icon="person.2"
            label="Members"
            note={
              snapshot ? `${snapshot.members.length} of ${snapshot.seatLimit} seats` : undefined
            }
            opens
          />
        </Link>
      </Section>
      <Section title="This Phone">
        <Link href={go("appearance")} asChild>
          <Line icon="paintpalette" label="Appearance" note={look} opens />
        </Link>
      </Section>
      <Section title="Account">
        <Link href={go("accounts")} asChild>
          <Line icon="person.crop.circle" label="Accounts" note={session.email} opens />
        </Link>
        <Link href={go("writing")} asChild>
          <Line
            icon="pencil"
            label="Writing"
            note={p.autocorrect ? "Autocorrection on" : "Autocorrection off"}
            opens
          />
        </Link>
        <Link href={go("security")} asChild>
          <Line
            icon="hand.raised"
            label="Privacy"
            note={p.presence ? "Online status shown" : "Online status hidden"}
            opens
          />
        </Link>
      </Section>
    </SettingsPage>
  );
}
