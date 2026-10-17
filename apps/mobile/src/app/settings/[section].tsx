import { useTextPrompt } from "../../TextPrompt";
import { useEffect, useState } from "react";
import { Pressable, Share, Text, View } from "react-native";
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
import { Chip } from "../../Grouped";
import { Avatar } from "../../Avatar";
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
        palette: "Colour Palette",
        wallpaper: "Wallpaper",
      } as Record<string, string>
    )[section] ?? "Settings";

  const nickname = () =>
    prompt(
      "Display name",
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

  if (["reading", "icons", "folders"].includes(section)) return <Redirect href="/settings" />;

  return (
    <SettingsPage title={title}>
      {error ? <Status>{error}</Status> : null}
      {section === "profile" ? (
        <>
          <ProfileHero />
          <Part>
            <Line
              label="Display name"
              value={profile?.nickname || ""}
              disabled={!profile || busy}
              onPress={nickname}
            />
          </Part>
        </>
      ) : null}
      {section === "archives" ? (
        <>
          <Part title="Switch archive">
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
              label="Create archive"
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
              label="Rename current archive"
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
              label="Invite member"
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
      {!preferencesReady &&
      ["appearance", "palette", "wallpaper", "writing", "security"].includes(section) ? (
        <Text style={{ color: palette.ink3, margin: 20 }}>Loading preferences…</Text>
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
              <Part title="Personalise">
                <Line
                  label="Colour palette"
                  value={palettePreset?.name ?? "Custom"}
                  opens
                  onPress={() =>
                    router.push({ pathname: "/settings/[section]", params: { section: "palette" } })
                  }
                />
                <Line
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
          {section === "palette" ? (
            <PaletteChoices
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
          ) : null}
          {section === "wallpaper" ? (
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
                    onChange={(wallpaper) => update({ appearance: { ...p.appearance, wallpaper } })}
                  />
                  <Text style={{ color: palette.ink3, fontSize: 13, marginTop: 12 }}>Blur</Text>
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
              <Part
                title={`Your colour in shared notes · ${
                  PRESENCE_PALETTES.find((colour) => colour.id === p.writing.presencePalette)
                    ?.name ?? ""
                }`}
              >
                <Swatches
                  labelled
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
                label="Show when I’m online"
                value={p.presence}
                onChange={(presence) => update({ presence })}
              />
              <Toggle
                label="Show who contributed"
                value={p.collaborators}
                onChange={(collaborators) => update({ collaborators })}
              />
              {profile ? (
                <Toggle
                  label="Hide my archived notes"
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

function AppearancePreview() {
  const palette = usePalette();
  return (
    <View
      accessibilityLabel="Appearance preview"
      style={{
        marginHorizontal: 20,
        marginBottom: 24,
        padding: 20,
        borderRadius: 16,
        backgroundColor: palette.page,
        borderWidth: 1,
        borderColor: palette.rule,
        gap: 12,
      }}
    >
      <Text style={{ color: palette.ink3, fontSize: 12, fontWeight: "600" }}>PREVIEW</Text>
      <Text style={{ color: palette.ink, fontSize: 24, fontWeight: "700" }}>
        Your notes, your space
      </Text>
      <View
        style={{
          backgroundColor: palette.paper,
          borderRadius: 10,
          padding: 14,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
        }}
      >
        <Chip icon="folder.fill" fill={palette.folder} size={34} />
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={{ color: palette.ink, fontSize: 16, fontWeight: "600" }}>Ideas</Text>
          <Text style={{ color: palette.ink3, fontSize: 14 }}>A place to start.</Text>
        </View>
      </View>
    </View>
  );
}

function PaletteChoices({ value, onChange }: { value?: string; onChange: (id: string) => void }) {
  const palette = usePalette();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginHorizontal: 20 }}>
      {APPEARANCE_PRESETS.map((preset) => {
        const selected = value === preset.id;
        return (
          <Pressable
            key={preset.id}
            accessibilityRole="radio"
            accessibilityLabel={preset.name}
            accessibilityState={{ checked: selected }}
            onPress={() => onChange(preset.id)}
            style={({ pressed }) => ({
              width: "47%",
              flexGrow: 1,
              borderWidth: 2,
              borderColor: selected ? palette.accent : "transparent",
              borderRadius: 14,
              padding: 4,
              opacity: pressed ? 0.65 : 1,
            })}
          >
            <View
              style={{ padding: 16, borderRadius: 9, backgroundColor: preset.background, gap: 10 }}
            >
              <Text style={{ fontSize: 24, fontWeight: "600", color: preset.foreground }}>Aa</Text>
              <View
                style={{ height: 5, width: "65%", borderRadius: 3, backgroundColor: preset.accent }}
              />
            </View>
            <Text
              style={{
                color: palette.ink,
                fontSize: 14,
                textAlign: "center",
                paddingVertical: 8,
                fontWeight: selected ? "600" : "400",
              }}
            >
              {preset.name}
              {selected ? " ✓" : ""}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
