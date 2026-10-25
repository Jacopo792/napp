import { Accounts } from "../../Accounts";
import { useTextPrompt } from "../../TextPrompt";
import { useEffect, useState } from "react";
import { Alert, Image, Share, StyleSheet, Text, View } from "react-native";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { PHONE_PALETTES, phonePaletteOf, phoneSide, type PhonePaletteId } from "@/lib/appearance";
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
import { chooseWallpaper } from "../../ProfilePhoto";
import Account from "./account";
import {
  attempt,
  Line,
  Section as Part,
  Segments,
  SettingsPage,
  Status,
  Swatches,
  Toggle,
  ZoomLink,
} from "../../SettingsControls";
import { PillButton, SkeletonCard } from "../../Chrome";

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
        accounts: "Accounts",
        archives: "Archives",
        members: "Members",
        appearance: "Appearance",
        writing: "Writing",
        security: "Privacy",
        wallpaper: "Wallpaper",
      } as Record<string, string>
    )[section] ?? "Settings";

  /* Sharing needs an address: an account with none is asked to save first. */
  const invite = () =>
    !session.email
      ? router.push({ pathname: "/sign-in", params: { mode: "save" } })
      : prompt(
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
  /* The phone's five: the stored colours are the side being worn, so a
     change of either the theme or the palette writes that side's three. */
  const paletteId = phonePaletteOf(p.appearance);
  const wear = (id: PhonePaletteId, theme: "system" | "dark" | "light") => {
    const { background, foreground, accent } = phoneSide(
      id,
      theme === "dark" || (theme === "system" && palette.dark),
    );
    update({ appearance: { ...p.appearance, theme, background, foreground, accent } });
  };
  const theme = (theme: "system" | "dark" | "light") => wear(paletteId, theme);

  /* The profile is the account page now; search still asks for it by name. */
  if (section === "profile") return <Account />;
  if (["reading", "icons", "folders", "palette"].includes(section))
    return <Redirect href={section === "palette" ? "/settings/appearance" : "/settings"} />;

  const seats = snapshot?.seatLimit ?? 8;
  const seated = snapshot?.members.length ?? 0;
  const setAppearance = (patch: Partial<typeof p.appearance>) =>
    update({ appearance: { ...p.appearance, ...patch } });

  return (
    <SettingsPage title={title}>
      {error ? <Status>{error}</Status> : null}
      {section === "accounts" ? <Accounts /> : null}
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
          </Part>
          <PillButton
            label="New Archive"
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
                      name: member.nickname,
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
          <PillButton
            label={seated >= seats ? `All ${seats} Seats Taken` : "Invite Someone"}
            disabled={busy || seated >= seats}
            onPress={invite}
          />
        </>
      ) : null}
      {!preferencesReady && ["appearance", "wallpaper", "writing", "security"].includes(section) ? (
        <SkeletonCard rows={3} />
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
                <PaletteChoices value={paletteId} onChange={(id) => wear(id, p.appearance.theme)} />
              </Part>
              <Part>
                <ZoomLink
                  href={{ pathname: "/settings/[section]", params: { section: "wallpaper" } }}
                >
                  <Line
                    icon="photo"
                    label="Wallpaper"
                    value={p.appearance.wallpaper && p.appearance.wallpaperObject ? "On" : "Off"}
                    opens
                  />
                </ZoomLink>
              </Part>
            </>
          ) : null}
          {section === "wallpaper" ? (
            <>
              <WallpaperPicture objectId={p.appearance.wallpaperObject} />
              {p.appearance.wallpaperObject ? (
                <>
                  <Part title="Style">
                    <Segments
                      options={[
                        { id: "sharp", label: "Sharp" },
                        { id: "blurred", label: "Blurred" },
                      ]}
                      value={p.appearance.wallpaperBlur > 0 ? "blurred" : "sharp"}
                      onChange={(style) =>
                        setAppearance({ wallpaperBlur: style === "blurred" ? 30 : 0 })
                      }
                    />
                  </Part>
                  <Part>
                    <Toggle
                      label="Show Wallpaper"
                      value={p.appearance.wallpaper}
                      onChange={(wallpaper) => setAppearance({ wallpaper })}
                    />
                    <Line
                      label="Remove Wallpaper"
                      tone="danger"
                      onPress={() => setAppearance({ wallpaper: false, wallpaperObject: null })}
                    />
                  </Part>
                </>
              ) : null}
              <PillButton
                label={p.appearance.wallpaperObject ? "Choose New Photo" : "Choose Photo"}
                disabled={busy}
                onPress={() =>
                  void run(async () => {
                    const objectId = await chooseWallpaper(session);
                    if (objectId)
                      setAppearance({
                        wallpaper: true,
                        wallpaperObject: objectId,
                      });
                  })
                }
              />
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
          backgroundColor: palette.paper,
          borderRadius: CARD_RADIUS,
          borderCurve: "continuous",
          padding: 16,
          gap: 4,
          marginBottom: 10,
        }}
      >
        <Text style={{ color: palette.ink3, fontSize: 12, fontWeight: "600" }}>
          Continue Writing
        </Text>
        <Text style={{ color: palette.ink, fontSize: 19, fontWeight: "700", letterSpacing: -0.4 }}>
          Ideas for the trip
        </Text>
        <Text style={{ color: palette.ink2, fontSize: 14 }} numberOfLines={1}>
          Start in the north, then follow the coast down.
        </Text>
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
        <RowFace icon="note.text" label="Aphorisms" note="Appunti" detail="11:24" chevron={false} />
        <RowFace icon="folder" label="Studio" note="4 notes" chevron={false} />
      </View>
    </View>
  );
}

function PaletteChoices({
  value,
  onChange,
}: {
  value: PhonePaletteId;
  onChange: (id: PhonePaletteId) => void;
}) {
  const palette = usePalette();
  return (
    /* Five fit the card's width, so they stand in one row rather than scroll. */
    <View style={{ flexDirection: "row", gap: 4, paddingHorizontal: 8, paddingVertical: 10 }}>
      {PHONE_PALETTES.map((choice) => {
        const selected = value === choice.id;
        return (
          <Press
            key={choice.id}
            feedback="scale"
            accessibilityRole="radio"
            accessibilityLabel={choice.name}
            accessibilityState={{ checked: selected }}
            onPress={() => onChange(choice.id)}
            style={{ flex: 1, alignItems: "center", gap: 8 }}
          >
            <View
              style={{
                padding: 3,
                borderRadius: 19,
                borderCurve: "continuous",
                borderWidth: 2.5,
                borderColor: selected ? palette.accent : "transparent",
                alignSelf: "stretch",
              }}
            >
              {/* Its light side over its dark side: the Theme above says which is worn. */}
              <View
                style={{
                  height: 82,
                  borderRadius: 14,
                  borderCurve: "continuous",
                  overflow: "hidden",
                  borderWidth: 1,
                  borderColor: palette.dark ? "#ffffff1a" : "#00000014",
                }}
              >
                {[choice.light, choice.dark].map((side, index) => (
                  <View
                    key={index}
                    style={{
                      flex: 1,
                      backgroundColor: side.background,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 5,
                    }}
                  >
                    <Text style={{ fontSize: 15, fontWeight: "700", color: side.foreground }}>
                      Aa
                    </Text>
                    <View
                      style={{ height: 8, width: 8, borderRadius: 4, backgroundColor: side.accent }}
                    />
                  </View>
                ))}
              </View>
            </View>
            <Text
              style={{
                color: selected ? palette.ink : palette.ink3,
                fontSize: 12,
                fontWeight: selected ? "600" : "500",
              }}
              numberOfLines={1}
            >
              {choice.name}
            </Text>
          </Press>
        );
      })}
    </View>
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
