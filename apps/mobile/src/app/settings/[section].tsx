import { useTextPrompt } from "../../TextPrompt";
import { useEffect, useState } from "react";
import { Pressable, Share, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { APPEARANCE_PRESETS, SYSTEM_COLOURS } from "@/lib/appearance";
import { PRESETS } from "@/lib/axes";
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
import { Chip } from "../../Grouped";
import { Avatar } from "../../Avatar";
import { setIconStyle, useIconStyle } from "../../theme";
import { chooseWallpaper, ProfileHero } from "../../ProfilePhoto";
import {
  attempt,
  Choice,
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
  const iconStyle = useIconStyle();
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
        reading: "Reading",
        writing: "Writing",
        security: "Privacy",
      } as Record<string, string>
    )[section] ?? "Settings";

  const nickname = () =>
    prompt(
      "Nickname",
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
      "Invite Member",
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
        accent: base.accent,
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

  return (
    <SettingsPage title={title}>
      {error ? <Status>{error}</Status> : null}
      {section === "profile" ? (
        <>
          <ProfileHero />
          <Part>
            <Line
              label="Nickname"
              value={profile?.nickname || ""}
              disabled={!profile || busy}
              onPress={nickname}
            />
          </Part>
        </>
      ) : null}
      {section === "archives" ? (
        <>
          <Part title="Your archives">
            {spaces.map((space) => (
              <Choice
                key={space.archiveId}
                label={space.name}
                selected={space.archiveId === session.archiveId}
                onPress={() =>
                  void run(async () => {
                    await switchArchive(space.archiveId);
                    router.dismissAll();
                  })
                }
              />
            ))}
          </Part>
          <Part>
            <Line
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
            <Line
              label="Rename Current Archive"
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
          </Part>
        </>
      ) : null}
      {section === "members" ? (
        <>
          <Part title={current?.name}>
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
                    size={32}
                  />
                }
                label={member.nickname || "Member"}
                value={member.isSelf ? "You" : undefined}
              />
            ))}
            <Line
              label="Invite Member"
              tone="action"
              value={`${snapshot?.members.length ?? 0} of ${snapshot?.seatLimit ?? 2}`}
              disabled={busy || (snapshot?.members.length ?? 0) >= (snapshot?.seatLimit ?? 2)}
              onPress={invite}
            />
          </Part>
          {invites.length ? (
            <Part title="Waiting to join">
              {invites.map((pending) => (
                <Line
                  key={pending.id}
                  label={pending.email}
                  value="Revoke"
                  disabled={busy}
                  onPress={() =>
                    void run(async () => {
                      await revokeArchiveInvite(pending.id);
                      setInvites(await loadPendingInvites(session));
                    })
                  }
                />
              ))}
            </Part>
          ) : null}
        </>
      ) : null}
      {!preferencesReady && ["appearance", "reading", "writing", "security"].includes(section) ? (
        <Text style={{ color: palette.ink3, margin: 20 }}>Loading preferences…</Text>
      ) : (
        <>
          {section === "appearance" ? (
            <>
              <Part title={`Palette · ${palettePreset?.name ?? "Custom"}`}>
                <Swatches
                  items={APPEARANCE_PRESETS.map((preset) => ({
                    id: preset.id,
                    label: preset.name,
                    ground: preset.background,
                    dot: preset.accent,
                  }))}
                  value={palettePreset?.id}
                  onChange={(id) => {
                    const preset = APPEARANCE_PRESETS.find((candidate) => candidate.id === id)!;
                    update({
                      appearance: {
                        ...p.appearance,
                        theme: preset.theme,
                        accent: preset.accent,
                        background: preset.background,
                        foreground: preset.foreground,
                      },
                    });
                  }}
                />
              </Part>
              <Part title="Theme">
                <Segments
                  options={[
                    { id: "system", label: "System" },
                    { id: "dark", label: "Dark" },
                    { id: "light", label: "Light" },
                  ]}
                  value={p.appearance.theme}
                  onChange={theme}
                />
              </Part>
              <Part title="Icons">
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-around",
                    paddingVertical: 14,
                  }}
                >
                  {(["mono", "tinted", "filled"] as const).map((style) => (
                    <IconStyleChoice
                      key={style}
                      style={style}
                      selected={iconStyle === style}
                      onPress={() => setIconStyle(style)}
                    />
                  ))}
                </View>
              </Part>
              <Part title="Folders">
                <Swatches
                  items={SYSTEM_COLOURS.map((colour) => ({
                    id: colour.id,
                    label: colour.name,
                    ground: colour.id,
                  }))}
                  value={p.appearance.folderColour}
                  onChange={(folderColour) =>
                    update({ appearance: { ...p.appearance, folderColour } })
                  }
                />
              </Part>
              <Part title="Wallpaper">
                <Line
                  label={p.appearance.wallpaperObject ? "Change Wallpaper" : "Choose Wallpaper"}
                  tone="action"
                  disabled={busy}
                  onPress={() =>
                    void run(async () => {
                      const objectId = await chooseWallpaper(session);
                      if (objectId)
                        update({
                          appearance: {
                            ...p.appearance,
                            wallpaper: true,
                            wallpaperObject: objectId,
                          },
                        });
                    })
                  }
                />
                {p.appearance.wallpaperObject ? (
                  <>
                    <Toggle
                      label="Show Wallpaper"
                      value={p.appearance.wallpaper}
                      onChange={(wallpaper) =>
                        update({ appearance: { ...p.appearance, wallpaper } })
                      }
                    />
                    <Segments
                      options={[
                        { id: 0, label: "Sharp" },
                        { id: 8, label: "Soft" },
                        { id: 20, label: "Deep" },
                      ]}
                      value={p.appearance.wallpaperBlur}
                      onChange={(wallpaperBlur) =>
                        update({ appearance: { ...p.appearance, wallpaperBlur } })
                      }
                    />
                    <Line
                      label="Remove Wallpaper"
                      tone="danger"
                      onPress={() =>
                        update({
                          appearance: { ...p.appearance, wallpaper: false, wallpaperObject: null },
                        })
                      }
                    />
                  </>
                ) : null}
              </Part>
            </>
          ) : null}
          {section === "reading" ? (
            <>
              <Part title="Typeface">
                <Segments
                  options={[
                    { id: "serif", label: "Serif" },
                    { id: "system", label: "System" },
                  ]}
                  value={p.axes.face}
                  onChange={(face) => update({ axes: { ...p.axes, face } })}
                />
              </Part>
              <Part title="Text size">
                <Segments
                  options={[14, 16, 18, 20, 22].map((size) => ({ id: size, label: `${size}` }))}
                  value={p.axes.size}
                  onChange={(size) => update({ axes: { ...p.axes, size } })}
                />
              </Part>
              <Part title="Reading style">
                {PRESETS.map((preset) => (
                  <Choice
                    key={preset.id}
                    label={preset.name}
                    selected={
                      p.axes.size === preset.axes.size &&
                      p.axes.leading === preset.axes.leading &&
                      p.axes.measure === preset.axes.measure
                    }
                    onPress={() => update({ axes: { ...p.axes, ...preset.axes } })}
                  />
                ))}
              </Part>
            </>
          ) : null}
          {section === "writing" ? (
            <>
              <Part>
                <Toggle
                  label="Autocorrect"
                  value={p.autocorrect}
                  onChange={(autocorrect) => update({ autocorrect })}
                />
              </Part>
              <Part
                title={`Your colour · ${
                  PRESENCE_PALETTES.find((colour) => colour.id === p.writing.presencePalette)
                    ?.name ?? ""
                }`}
              >
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
            <Part>
              <Toggle
                label="Live Presence"
                value={p.presence}
                onChange={(presence) => update({ presence })}
              />
              <Toggle
                label="Show Collaborators"
                value={p.collaborators}
                onChange={(collaborators) => update({ collaborators })}
              />
              {profile ? (
                <Toggle
                  label="Keep Archived Notes Private"
                  value={profile.hideArchived}
                  disabled={busy}
                  onChange={(hideArchived) =>
                    void run(() => updateProfile({ ...profile, hideArchived }))
                  }
                />
              ) : null}
            </Part>
          ) : null}
        </>
      )}
      <Stack.Screen options={{ headerLargeTitle: section !== "profile" }} />
    </SettingsPage>
  );
}

/** The three ways a glyph can be drawn, each shown the way it would be. */
function IconStyleChoice({
  style,
  selected,
  onPress,
}: {
  style: "mono" | "tinted" | "filled";
  selected: boolean;
  onPress: () => void;
}) {
  const palette = usePalette();
  const tile = style === "mono" ? { tint: palette.ink } : { fill: palette.folder };
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={style}
      onPress={onPress}
      style={({ pressed }) => ({ alignItems: "center", gap: 8, opacity: pressed ? 0.6 : 1 })}
    >
      <Chip icon="folder.fill" {...tile} size={44} look={style} />
      <Text
        style={{
          color: selected ? palette.ink : palette.ink3,
          fontSize: 15,
          fontWeight: selected ? "600" : "400",
        }}
      >
        {style[0].toUpperCase() + style.slice(1)}
      </Text>
    </Pressable>
  );
}
