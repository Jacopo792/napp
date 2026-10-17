import { useTextPrompt } from "../../TextPrompt";
import { useEffect, useState } from "react";
import { Share, Text } from "react-native";
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
import { Group, Row } from "../../Grouped";
import { attempt, Choice, SettingsPage, Status, Toggle } from "../../SettingsControls";

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
        reading: "Reading",
        writing: "Writing",
        security: "Privacy",
      } as Record<string, string>
    )[section] ?? "Settings";

  return (
    <SettingsPage title={title}>
      {error ? <Status>{error}</Status> : null}
      {section === "profile" ? (
        <>
          <Group title="Account">
            <Row icon="envelope" label={session.email} chevron={false} />
            <Row
              icon="person"
              label="Nickname"
              detail={profile?.nickname || ""}
              disabled={!profile || busy}
              last
              onPress={() =>
                prompt(
                  "Nickname",
                  undefined,
                  (name) => {
                    if (profile && name?.trim())
                      void run(() =>
                        updateProfile({ ...profile, nickname: name.trim().slice(0, 40) }),
                      );
                  },
                  "plain-text",
                  profile?.nickname,
                )
              }
            />
          </Group>
        </>
      ) : null}
      {section === "archives" ? (
        <>
          <Group>
            {spaces.map((space) => (
              <Row
                key={space.archiveId}
                icon={space.kind === "document" ? "book.closed" : "folder"}
                label={space.name}
                detail={space.archiveId === session.archiveId ? "Current" : space.members.length}
                disabled={busy}
                onPress={() =>
                  void run(async () => {
                    await switchArchive(space.archiveId);
                    router.dismissAll();
                  })
                }
              />
            ))}
          </Group>
          <Group>
            <Row
              icon="plus"
              label="New Archive"
              disabled={busy}
              chevron={false}
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
            <Row
              icon="pencil"
              label="Rename Current Archive"
              disabled={busy || !current}
              last
              chevron={false}
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
          </Group>
        </>
      ) : null}
      {section === "members" ? (
        <>
          <Group title={current?.name}>
            {(snapshot?.members ?? []).map((member) => (
              <Row
                key={member.userId}
                icon="person.crop.circle"
                label={member.nickname || "Member"}
                detail={member.isSelf ? "You" : undefined}
                chevron={false}
              />
            ))}
          </Group>
          <Group>
            <Row
              icon="person.badge.plus"
              label="Invite Member"
              disabled={busy || (snapshot?.members.length ?? 0) >= (snapshot?.seatLimit ?? 2)}
              chevron={false}
              last
              onPress={() =>
                prompt(
                  "Invite Member",
                  "Email",
                  (email) => {
                    if (email?.trim())
                      void run(async () => {
                        const token = await createArchiveInvite(session, email.trim());
                        const link = new URL(platform().webOrigin());
                        link.searchParams.set("invite", token);
                        const url = link.toString();
                        setInvites(await loadPendingInvites(session));
                        await Share.share({ message: url });
                      });
                  },
                  "plain-text",
                  "",
                  "email-address",
                )
              }
            />
          </Group>
          {invites.length ? (
            <Group title="Pending Invitations">
              {invites.map((invite) => (
                <Row
                  key={invite.id}
                  icon="envelope"
                  label={invite.email}
                  detail="Revoke"
                  chevron={false}
                  disabled={busy}
                  onPress={() =>
                    void run(async () => {
                      await revokeArchiveInvite(invite.id);
                      setInvites(await loadPendingInvites(session));
                    })
                  }
                />
              ))}
            </Group>
          ) : null}
        </>
      ) : null}
      {!preferencesReady && ["appearance", "reading", "writing", "security"].includes(section) ? (
        <Text style={{ color: palette.ink3, margin: 20 }}>Loading preferences…</Text>
      ) : (
        <>
          {section === "appearance" ? (
            <>
              <Group title="Theme">
                {(["system", "dark", "light"] as const).map((theme) => (
                  <Choice
                    key={theme}
                    label={theme[0].toUpperCase() + theme.slice(1)}
                    selected={p.appearance.theme === theme}
                    onPress={() => {
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
                    }}
                  />
                ))}
              </Group>
              <Group title="Palette">
                {APPEARANCE_PRESETS.map((preset) => (
                  <Choice
                    key={preset.id}
                    label={preset.name}
                    selected={p.appearance.background === preset.background}
                    onPress={() =>
                      update({
                        appearance: {
                          ...p.appearance,
                          theme: preset.theme,
                          accent: preset.accent,
                          background: preset.background,
                          foreground: preset.foreground,
                        },
                      })
                    }
                  />
                ))}
              </Group>
              <Group title="Folder Colour">
                {SYSTEM_COLOURS.map((colour) => (
                  <Row
                    key={colour.id}
                    icon={p.appearance.folderColour === colour.id ? "checkmark" : "circle.fill"}
                    tint={colour.id}
                    label={colour.name}
                    chevron={false}
                    onPress={() =>
                      update({ appearance: { ...p.appearance, folderColour: colour.id } })
                    }
                  />
                ))}
              </Group>
            </>
          ) : null}
          {section === "reading" ? (
            <>
              <Group title="Typeface">
                {(["serif", "system"] as const).map((face) => (
                  <Choice
                    key={face}
                    label={face === "serif" ? "Serif" : "System"}
                    selected={p.axes.face === face}
                    onPress={() => update({ axes: { ...p.axes, face } })}
                  />
                ))}
              </Group>
              <Group title="Reading Style">
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
              </Group>
              <Group title="Text Size">
                {[14, 16, 18, 20, 22].map((size) => (
                  <Choice
                    key={size}
                    label={`${size} pt`}
                    selected={p.axes.size === size}
                    onPress={() => update({ axes: { ...p.axes, size } })}
                  />
                ))}
              </Group>
            </>
          ) : null}
          {section === "writing" ? (
            <>
              <Group>
                <Toggle
                  label="Autocorrect"
                  value={p.autocorrect}
                  onChange={(autocorrect) => update({ autocorrect })}
                />
              </Group>
              <Group title="Your Colour">
                {PRESENCE_PALETTES.map((colour) => (
                  <Row
                    key={colour.id}
                    icon={p.writing.presencePalette === colour.id ? "checkmark" : "circle.fill"}
                    tint={colour.color}
                    label={colour.name}
                    chevron={false}
                    onPress={() =>
                      update({ writing: { ...p.writing, presencePalette: colour.id } })
                    }
                  />
                ))}
              </Group>
            </>
          ) : null}
          {section === "security" ? (
            <>
              <Group>
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
              </Group>
            </>
          ) : null}
        </>
      )}
      <Stack.Screen options={{ headerLargeTitle: true }} />
    </SettingsPage>
  );
}
