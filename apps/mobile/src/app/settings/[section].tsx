import { useTextPrompt } from "../../TextPrompt";
import { useEffect, useState } from "react";
import { Alert, Image, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { Redirect, Stack, useLocalSearchParams, useRouter } from "expo-router";
import { APPEARANCE_PRESETS } from "@/lib/appearance";
import { createSpace, renameSpace } from "@/lib/spaces";
import {
  createArchiveInvite,
  loadPendingInvites,
  revokeArchiveInvite,
  type PendingInvite,
} from "@/lib/supabase";
import { platform } from "@/platform";
import { PRESENCE_PALETTES } from "@/lib/writingPreferences";
import { useArchive, usePalette } from "../../archive";
import { downloadObject } from "@/lib/supabase";
import { CARD_RADIUS, Press, RowFace } from "../../Grouped";
import { Avatar, Faces, picture } from "../../Avatar";
import { SymbolView } from "../../icons";
import { chooseWallpaper, ProfileHero } from "../../ProfilePhoto";
import {
  attempt,
  Line,
  Section as Part,
  Segments,
  SettingsPage,
  Status,
  Swatches,
  Toggle,
} from "../../SettingsControls";

export default function Section() {
  const prompt = useTextPrompt();
  const { section } = useLocalSearchParams<{ section: string }>();
  const {
    session,
    snapshot,
    profile,
    updateProfile,
    spaces,
    switchArchive,
    preferences: p,
    preferencesReady,
    updatePreferences: update,
    refresh,
    error,
  } = useArchive();
  const palette = usePalette();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const current = spaces.find((space) => space.archiveId === session.archiveId);
  const run = async (action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      await attempt(action);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (section !== "members") return;
    let live = true;
    void loadPendingInvites(session).then(
      (next) => {
        if (live) setInvites(next);
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [section, session]);
  const title =
    (
      {
        profile: "Profile",
        archives: "Archives",
        members: "Members",
        appearance: "Appearance",
        writing: "Writing",
        security: "Privacy",
        wallpaper: "Wallpaper",
      } as Record<string, string>
    )[section] ?? "Settings";

  const nickname = () =>
    prompt(
      "Name",
      undefined,
      (name) => {
        if (profile && name?.trim())
          void run(() => updateProfile({ ...profile, nickname: name.trim().slice(0, 40) }));
      },
      "plain-text",
      profile?.nickname,
    );
  const invite = () =>
    prompt(
      "Invite Someone",
      "Email",
      (email) => {
        if (email?.trim())
          void run(async () => {
            const token = await createArchiveInvite(session, email.trim());
            const link = new URL(platform().webOrigin());
            link.searchParams.set("invite", token);
            setInvites(await loadPendingInvites(session));
            await Share.share({ message: link.toString() });
          });
      },
      "plain-text",
      "",
      "email-address",
    );
  const theme = (theme: "system" | "dark" | "light") => {
    const base = APPEARANCE_PRESETS.find(
      (preset) => preset.id === (theme === "light" ? "paper" : "graphite"),
    )!;
    update({
      appearance: {
        ...p.appearance,
        accent: p.appearance.accent,
        background: base.background,
        foreground: base.foreground,
        theme,
      },
    });
  };
  const palettePreset = APPEARANCE_PRESETS.find(
    (preset) =>
      preset.background === p.appearance.background && preset.accent === p.appearance.accent,
  );

  if (["reading", "icons", "folders", "palette"].includes(section))
    return <Redirect href={section === "palette" ? "/settings/appearance" : "/settings"} />;

  const seats = snapshot?.seatLimit ?? 8;
  const seated = snapshot?.members.length ?? 0;
  const setAppearance = (patch: Partial<typeof p.appearance>) =>
    update({ appearance: { ...p.appearance, ...patch } });

  return (
    <SettingsPage title={title}>
      {error ? <Status>{error}</Status> : null}
      {section === "profile" ? (
        <>
          <ProfileHero />
          <Part>
            <Line
              label="Name"
              value={profile?.nickname || ""}
              disabled={!profile || busy}
              onPress={nickname}
              opens
            />
          </Part>
        </>
      ) : null}
      {section === "archives" ? (
        <>
          <Part title="Your Archives">
            {spaces.map((space) => {
              const on = space.archiveId === session.archiveId;
              return (
                <Line
                  key={space.archiveId}
                  icon="archivebox"
                  label={space.name}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  disabled={busy}
                  onPress={() =>
                    on
                      ? undefined
                      : void run(async () => {
                          await switchArchive(space.archiveId);
                          router.dismissAll();
                        })
                  }
                  trailing={
                    <>
                      <Faces
                        faces={space.members.map((member) => ({
                          userId: member.userId,
                          name: member.nickname,
                          avatarObject: member.avatarObject,
                        }))}
                        size={24}
                        ring={palette.paper}
                      />
                      <SymbolView
                        name={on ? "checkmark.circle.fill" : "circle"}
                        tintColor={on ? palette.accent : palette.ink4}
                        size={22}
                        weight="medium"
                      />
                    </>
                  }
                />
              );
            })}
          </Part>
          <Part>
            <Line
              icon="pencil"
              label={current ? `Rename “${current.name}”` : "Rename Archive"}
              tone="action"
              disabled={busy || !current}
              onPress={() =>
                prompt(
                  "Archive Name",
                  undefined,
                  (name) => {
                    if (name?.trim())
                      void run(async () => {
                        await renameSpace(session, name.trim());
                        refresh();
                      });
                  },
                  "plain-text",
                  current?.name,
                )
              }
            />
            <Line
              icon="plus"
              label="New Archive"
              tone="action"
              disabled={busy}
              onPress={() =>
                prompt("New Archive", undefined, (name) => {
                  if (name?.trim())
                    void run(async () => {
                      const id = await createSpace(name.trim());
                      await switchArchive(id);
                      router.dismissAll();
                    });
                })
              }
            />
          </Part>
        </>
      ) : null}
      {section === "members" ? (
        <>
          <Part title={current ? `In “${current.name}”` : undefined}>
            {(snapshot?.members ?? []).map((member) => (
              <Line
                key={member.userId}
                leading={
                  <Avatar
                    face={{
                      userId: member.userId,
                      name: member.nickname || "Member",
                      avatarObject: member.avatarObject,
                    }}
                    email={member.isSelf ? session.email : undefined}
                    size={36}
                  />
                }
                label={member.nickname || "Member"}
                value={member.isSelf ? "You" : undefined}
              />
            ))}
          </Part>
          <Part>
            <Line
              icon="person.badge.plus"
              label="Invite Someone"
              tone="action"
              value={`${seated} of ${seats}`}
              disabled={busy || seated >= seats}
              onPress={invite}
            />
          </Part>
          {invites.length ? (
            <Part title="Invitations">
              {invites.map((pending) => (
                <Line
                  key={pending.id}
                  icon="envelope"
                  label={pending.email}
                  value="Pending"
                  disabled={busy}
                  onPress={() =>
                    Alert.alert(`Revoke the invitation for ${pending.email}?`, undefined, [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Revoke",
                        style: "destructive",
                        onPress: () =>
                          void run(async () => {
                            await revokeArchiveInvite(pending.id);
                            setInvites(await loadPendingInvites(session));
                          }),
                      },
                    ])
                  }
                />
              ))}
            </Part>
          ) : null}
        </>
      ) : null}
      {!preferencesReady && ["appearance", "wallpaper", "writing", "security"].includes(section) ? (
        <Text style={{ color: palette.ink3, margin: 20 }}>Loading…</Text>
      ) : (
        <>
          {section === "appearance" ? (
            <>
              <AppearancePreview />
              <Part title="Theme">
                <Segments
                  options={[
                    { id: "system", label: "Automatic" },
                    { id: "light", label: "Light" },
                    { id: "dark", label: "Dark" },
                  ]}
                  value={p.appearance.theme}
                  onChange={theme}
                />
              </Part>
              <Part title="Palette">
                <PaletteChoices
                  value={palettePreset?.id}
                  onChange={(id) => {
                    const preset = APPEARANCE_PRESETS.find((candidate) => candidate.id === id)!;
                    setAppearance({
                      theme: preset.theme,
                      accent: preset.accent,
                      background: preset.background,
                      foreground: preset.foreground,
                    });
                  }}
                />
              </Part>
              <Part>
                <Line
                  icon="photo"
                  label="Wallpaper"
                  value={p.appearance.wallpaper && p.appearance.wallpaperObject ? "On" : "Off"}
                  opens
                  onPress={() =>
                    router.push({
                      pathname: "/settings/[section]",
                      params: { section: "wallpaper" },
                    })
                  }
                />
              </Part>
            </>
          ) : null}
          {section === "wallpaper" ? (
            <>
              <WallpaperPicture objectId={p.appearance.wallpaperObject} />
              <Part>
                {p.appearance.wallpaperObject ? (
                  <Toggle
                    label="Show Wallpaper"
                    value={p.appearance.wallpaper}
                    onChange={(wallpaper) => setAppearance({ wallpaper })}
                  />
                ) : null}
                <Line
                  label={p.appearance.wallpaperObject ? "Choose New Photo" : "Choose Photo"}
                  tone="action"
                  disabled={busy}
                  onPress={() =>
                    void run(async () => {
                      const objectId = await chooseWallpaper(session);
                      if (objectId)
                        setAppearance({
                          wallpaper: true,
                          wallpaperObject: objectId,
                          wallpaperBlur: 0,
                        });
                    })
                  }
                />
              </Part>
              {p.appearance.wallpaperObject ? (
                <Part>
                  <Line
                    label="Remove Wallpaper"
                    tone="danger"
                    onPress={() => setAppearance({ wallpaper: false, wallpaperObject: null })}
                  />
                </Part>
              ) : null}
            </>
          ) : null}
          {section === "writing" ? (
            <>
              <Part>
                <Toggle
                  label="Autocorrection"
                  value={p.autocorrect}
                  onChange={(autocorrect) => update({ autocorrect })}
                />
              </Part>
              <Part title="Your Colour in Shared Notes">
                <Swatches
                  items={PRESENCE_PALETTES.map((colour) => ({
                    id: colour.id,
                    label: colour.name,
                    ground: colour.color,
                  }))}
                  value={p.writing.presencePalette}
                  onChange={(id) =>
                    update({
                      writing: {
                        ...p.writing,
                        presencePalette: id as typeof p.writing.presencePalette,
                      },
                    })
                  }
                />
              </Part>
            </>
          ) : null}
          {section === "security" ? (
            <>
              <Part title="Others Can See">
                <Toggle
                  label="When I’m Online"
                  value={p.presence}
                  onChange={(presence) => update({ presence })}
                />
                {profile ? (
                  <Toggle
                    label="My Archived Notes"
                    value={!profile.hideArchived}
                    disabled={busy}
                    onChange={(shown) =>
                      void run(() => updateProfile({ ...profile, hideArchived: !shown }))
                    }
                  />
                ) : null}
              </Part>
              <Part title="I Can See">
                <Toggle
                  label="Collaborators on Notes"
                  value={p.collaborators}
                  onChange={(collaborators) => update({ collaborators })}
                />
              </Part>
            </>
          ) : null}
        </>
      )}
      <Stack.Screen options={{ headerLargeTitle: section !== "profile" }} />
    </SettingsPage>
  );
}

/** The screens as they will look: the real rows, in the reader's palette. */
function AppearancePreview() {
  const palette = usePalette();
  return (
    <View
      accessibilityLabel="Appearance preview"
      style={{
        marginHorizontal: 16,
        marginBottom: 28,
        paddingTop: 22,
        paddingBottom: 14,
        paddingHorizontal: 12,
        borderRadius: CARD_RADIUS + 6,
        borderCurve: "continuous",
        backgroundColor: palette.page,
        borderWidth: 1,
        borderColor: palette.dark ? "#ffffff1f" : "#0000001a",
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 6,
          marginBottom: 14,
        }}
      >
        <Text style={{ color: palette.ink, fontSize: 26, fontWeight: "700", letterSpacing: -0.6 }}>
          Your Notes
        </Text>
        <SymbolView name="square.and.pencil" size={22} weight="medium" tintColor={palette.accent} />
      </View>
      <View
        pointerEvents="none"
        style={{
          backgroundColor: palette.paper,
          borderRadius: CARD_RADIUS,
          borderCurve: "continuous",
          paddingVertical: 4,
        }}
      >
        <RowFace icon="note.text" label="All Notes" detail={12} />
        <RowFace icon="folder" label="Ideas" detail={4} />
      </View>
    </View>
  );
}

function PaletteChoices({ value, onChange }: { value?: string; onChange: (id: string) => void }) {
  const palette = usePalette();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 6, paddingHorizontal: 10, paddingVertical: 10 }}
    >
      {APPEARANCE_PRESETS.map((preset) => {
        const selected = value === preset.id;
        return (
          <Press
            key={preset.id}
            feedback="scale"
            accessibilityRole="radio"
            accessibilityLabel={preset.name}
            accessibilityState={{ checked: selected }}
            onPress={() => onChange(preset.id)}
            style={{ alignItems: "center", gap: 8, width: 84 }}
          >
            <View
              style={{
                padding: 3,
                borderRadius: 19,
                borderCurve: "continuous",
                borderWidth: 2.5,
                borderColor: selected ? palette.accent : "transparent",
              }}
            >
              <View
                style={{
                  width: 70,
                  height: 82,
                  borderRadius: 14,
                  borderCurve: "continuous",
                  backgroundColor: preset.background,
                  borderWidth: 1,
                  borderColor: palette.dark ? "#ffffff1a" : "#00000014",
                  padding: 10,
                  justifyContent: "space-between",
                }}
              >
                <Text style={{ fontSize: 22, fontWeight: "700", color: preset.foreground }}>
                  Aa
                </Text>
                <View
                  style={{ height: 6, width: 30, borderRadius: 3, backgroundColor: preset.accent }}
                />
              </View>
            </View>
            <Text
              style={{
                color: selected ? palette.ink : palette.ink3,
                fontSize: 13,
                fontWeight: selected ? "600" : "500",
              }}
              numberOfLines={1}
            >
              {preset.name}
            </Text>
          </Press>
        );
      })}
    </ScrollView>
  );
}

/** The chosen picture itself, so the page says what is set by showing it. */
function WallpaperPicture({ objectId }: { objectId: string | null }) {
  const { session } = useArchive();
  const palette = usePalette();
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setUri(null);
    if (objectId)
      void picture(objectId, () => downloadObject(session, objectId, "image/jpeg")).then(
        (next) => live && setUri(next),
      );
    return () => {
      live = false;
    };
  }, [session, objectId]);
  return (
    <View
      style={{
        marginHorizontal: 16,
        marginBottom: 28,
        alignSelf: "stretch",
        height: 220,
        borderRadius: CARD_RADIUS,
        borderCurve: "continuous",
        overflow: "hidden",
        backgroundColor: palette.paper,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <SymbolView name="photo" size={44} weight="light" tintColor={palette.ink4} />
      )}
    </View>
  );
}
