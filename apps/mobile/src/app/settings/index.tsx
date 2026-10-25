import { Link, router } from "expo-router";
import { Text, View } from "react-native";
import { PHONE_PALETTES, phonePaletteOf } from "@/lib/appearance";
import { useArchive, usePalette } from "../../archive";
import { Avatar } from "../../Avatar";
import { Press } from "../../Grouped";
import { SymbolView } from "../../icons";
import { Line, Section, SettingsPage, ZoomLink } from "../../SettingsControls";
import { Card } from "../../Chrome";
import { PolicyLinks } from "../../PolicyLinks";

/* You — and everything about the account, behind your card — then how this
   phone looks, then privacy, then the archive you are in. Every row says where it goes and,
   on the line under its name, what is set there now.

   As Revolut's profile, each page grows out of what was pressed — the face
   in a tab's bar, then this card — and a pull down folds it back in. */
export default function Settings() {
  const { session, snapshot, spaces, profile, preferences: p } = useArchive();
  const palette = usePalette();
  const current = spaces.find((space) => space.archiveId === session.archiveId);
  const go = (section: string) =>
    ({ pathname: "/settings/[section]", params: { section } }) as const;
  const look = `${PHONE_PALETTES.find((one) => one.id === phonePaletteOf(p.appearance))?.name}, ${
    { system: "Automatic", light: "Light", dark: "Dark" }[p.appearance.theme]
  }`;
  const anonymous = !session.email;
  const name = profile?.nickname || session.email.split("@")[0];
  return (
    <SettingsPage title="Settings">
      {anonymous ? (
        /* Signed out, as iOS Settings draws it: whose notes these are, and
           the one way to keep them, in one card. */
        <Card style={{ marginHorizontal: 16, marginBottom: 16 }}>
          <Link href="/settings/account" asChild>
            <Press
              accessibilityRole="button"
              accessibilityLabel={`${profile?.nickname || "Notes on this phone"}, Account`}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 14,
                paddingVertical: 14,
                paddingHorizontal: 16,
              }}
            >
              <Avatar
                face={{
                  userId: session.userId,
                  name: profile?.nickname ?? "",
                  avatarObject: profile?.avatarObject ?? null,
                }}
                size={52}
              />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: palette.ink, fontSize: 17, fontWeight: "600" }}>
                  {profile?.nickname || "Notes on this phone"}
                </Text>
                <Text style={{ color: palette.ink3, fontSize: 15 }}>Not saved to an account</Text>
              </View>
            </Press>
          </Link>
          <View style={{ height: 0.5, marginLeft: 82, backgroundColor: palette.rule }} />
          <Press
            accessibilityRole="button"
            onPress={() => router.push({ pathname: "/sign-in", params: { mode: "save" } })}
            style={{
              minHeight: 48,
              flexDirection: "row",
              alignItems: "center",
              paddingLeft: 82,
              paddingRight: 16,
            }}
          >
            <Text style={{ flex: 1, color: palette.accent, fontSize: 17 }}>Save Your Notes…</Text>
            <SymbolView name="chevron.right" tintColor={palette.ink4} size={14} weight="semibold" />
          </Press>
        </Card>
      ) : (
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
      )}
      <Section title="This Phone">
        <ZoomLink href={go("appearance")}>
          <Line icon="paintpalette" label="Appearance" note={look} opens />
        </ZoomLink>
        <ZoomLink href={go("writing")}>
          <Line
            icon="pencil"
            label="Writing"
            note={p.autocorrect ? "Autocorrection on" : "Autocorrection off"}
            opens
          />
        </ZoomLink>
      </Section>
      <Section title="Archive">
        <ZoomLink href={go("security")}>
          <Line
            icon="eye"
            label="Privacy"
            note={p.presence ? "Online status shown" : "Online status hidden"}
            opens
          />
        </ZoomLink>
        <ZoomLink href={go("members")}>
          <Line
            icon="person.2"
            label="Members"
            note={
              snapshot ? `${snapshot.members.length} of ${snapshot.seatLimit} seats` : undefined
            }
            opens
          />
        </ZoomLink>
        <ZoomLink href={go("archives")}>
          <Line icon="archivebox" label="Archives" note={current?.name} opens />
        </ZoomLink>
        <ZoomLink href="/settings/safety">
          <Line icon="hand.raised" label="Safety" opens />
        </ZoomLink>
      </Section>
      <View style={{ marginHorizontal: 20 }}>
        <PolicyLinks />
      </View>
    </SettingsPage>
  );
}
