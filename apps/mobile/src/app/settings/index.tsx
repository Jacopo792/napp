import { Link } from "expo-router";
import { Text, View } from "react-native";
import { APPEARANCE_PRESETS } from "@/lib/appearance";
import { useArchive, usePalette } from "../../archive";
import { Avatar } from "../../Avatar";
import { Press } from "../../Grouped";
import { SymbolView } from "../../icons";
import { Line, Section, SettingsPage } from "../../SettingsControls";
import { Card } from "../../Chrome";

/* You — and everything about the account, behind your card — then how this
   phone looks, then the archive you are in. Every row says where it goes and,
   on the line under its name, what is set there now.

   As Revolut's profile, each page grows out of what was pressed — the face
   in a tab's bar, then this card — and a pull down folds it back in. */
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
      <Link href="/settings/account" asChild>
        <Link.Trigger withAppleZoom>
          <Press
            feedback="scale"
            accessibilityRole="button"
            accessibilityLabel={`${name}, Account`}
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
                  style={{
                    color: palette.ink,
                    fontSize: 21,
                    fontWeight: "700",
                    letterSpacing: -0.4,
                  }}
                  numberOfLines={1}
                >
                  {name}
                </Text>
                <Text style={{ color: palette.ink3, fontSize: 15 }} numberOfLines={1}>
                  {session.email}
                </Text>
              </View>
              <SymbolView
                name="chevron.right"
                tintColor={palette.ink4}
                size={14}
                weight="semibold"
              />
            </Card>
          </Press>
        </Link.Trigger>
      </Link>
      <Section title="This Phone">
        <Link href={go("appearance")} asChild>
          <Line icon="paintpalette" label="Appearance" note={look} opens />
        </Link>
        <Link href={go("writing")} asChild>
          <Line
            icon="pencil"
            label="Writing"
            note={p.autocorrect ? "Autocorrection on" : "Autocorrection off"}
            opens
          />
        </Link>
      </Section>
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
    </SettingsPage>
  );
}
