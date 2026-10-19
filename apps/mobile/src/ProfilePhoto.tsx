/* Your face, set and changed from the profile's hero: the system's photo
 * picker with its own square crop standing in for the web's AvatarCropper,
 * then the core's rule — one square, 512 px at most, under 1.5 MB — and the
 * core's bucket. The old picture is deleted only once the profile names the
 * new one, so a failure leaves you with a face rather than none.
 *
 * The wallpaper is picked here too: the same picker, uncropped, into the
 * archive's own bucket, named in the account's appearance as the web names it. */
import { useState } from "react";
import { ActionSheetIOS, Alert, Platform, Text, View } from "react-native";
import { randomUUID } from "expo-crypto";
import { File } from "expo-file-system";
import { launchImageLibraryAsync } from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { deleteAvatar, uploadAvatar, uploadObjectBytes } from "@/lib/supabase";
import { useArchive, usePalette } from "./archive";
import { Avatar, rememberPicture } from "./Avatar";
import { attempt } from "./SettingsControls";
import { SymbolView } from "./icons";
import { Press } from "./Grouped";

const AVATAR_EDGE = 512;
/** The face on the account page, large and centred. */
const HERO = 72;
const MAX_AVATAR_BYTES = 1.5 * 1024 * 1024;

/** A picked picture, scaled and re-encoded on the phone. Null when cancelled. */
async function pick(square: boolean): Promise<File | null> {
  const result = await launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: square,
    aspect: square ? [1, 1] : undefined,
    quality: 1,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  const context = ImageManipulator.manipulate(asset.uri);
  if (square) context.resize({ width: AVATAR_EDGE, height: AVATAR_EDGE });
  else if (asset.width > 1600) context.resize({ width: 1600 });
  const rendered = await context.renderAsync();
  try {
    const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.82 });
    return new File(saved.uri);
  } finally {
    rendered.release();
    context.release();
  }
}

/** Three choices, asked the way each system asks. */
function ask(title: string, options: { label: string; destructive?: boolean; run: () => void }[]) {
  if (Platform.OS === "ios")
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        options: [...options.map((option) => option.label), "Cancel"],
        cancelButtonIndex: options.length,
        destructiveButtonIndex: options.findIndex((option) => option.destructive),
      },
      (index) => options[index]?.run(),
    );
  else
    Alert.alert(title, undefined, [
      ...options.map((option) => ({
        text: option.label,
        style: option.destructive ? ("destructive" as const) : ("default" as const),
        onPress: option.run,
      })),
      { text: "Cancel", style: "cancel" as const },
    ]);
}

export function ProfileHero() {
  const { session, profile, updateProfile, snapshot } = useArchive();
  const palette = usePalette();
  const [busy, setBusy] = useState(false);
  const work = (job: () => Promise<void>) =>
    void attempt(async () => {
      if (!profile || busy) return;
      setBusy(true);
      try {
        await job();
      } finally {
        setBusy(false);
      }
    });

  const choose = () =>
    work(async () => {
      const file = await pick(true);
      if (!file || !profile) return;
      if (file.size > MAX_AVATAR_BYTES) throw new Error("Choose a smaller photo");
      const objectId = await uploadAvatar(
        session,
        await file.arrayBuffer(),
        "image/jpeg",
        randomUUID(),
      );
      rememberPicture(objectId, file.uri);
      try {
        await updateProfile({ ...profile, avatarObject: objectId });
      } catch (error) {
        await deleteAvatar(session, objectId).catch(() => {});
        throw error;
      }
      if (profile.avatarObject) await deleteAvatar(session, profile.avatarObject).catch(() => {});
    });
  const remove = () =>
    work(async () => {
      if (!profile?.avatarObject) return;
      await updateProfile({ ...profile, avatarObject: null });
      await deleteAvatar(session, profile.avatarObject).catch(() => {});
    });
  const offer = () =>
    profile?.avatarObject
      ? ask("Profile Photo", [
          { label: "Choose New Photo", run: choose },
          { label: "Remove Photo", destructive: true, run: remove },
        ])
      : choose();

  const name = profile?.nickname || session.email.split("@")[0];
  /* What only a notes app can say about you: how much you have written. */
  const mine = (snapshot?.entries ?? []).filter(
    (entry) => (entry.note.ownerId ?? session.userId) === session.userId,
  );
  const words = mine.reduce((sum, entry) => sum + (entry.note.body.match(/\S+/g)?.length ?? 0), 0);
  const count = (n: number, one: string, many: string) =>
    `${n.toLocaleString()} ${n === 1 ? one : many}`;
  return (
    /* The account as a note's title page: set from the left like the title
       of a note, the face beside the name, and under them what was written. */
    <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 26, gap: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
        <Press
          feedback="scale"
          accessibilityRole="button"
          accessibilityLabel={profile?.avatarObject ? "Edit Photo" : "Add Photo"}
          disabled={!profile || busy}
          onPress={offer}
          style={{ opacity: busy ? 0.5 : 1 }}
        >
          <View
            style={{
              borderRadius: HERO,
              boxShadow: palette.dark
                ? "0 8px 22px rgba(0,0,0,0.5)"
                : "0 8px 20px rgba(0,0,0,0.12)",
            }}
          >
            <Avatar
              face={{
                userId: session.userId,
                name: profile?.nickname ?? "",
                avatarObject: profile?.avatarObject ?? null,
              }}
              email={session.email}
              size={HERO}
            />
          </View>
          <View
            style={{
              position: "absolute",
              right: -4,
              bottom: -2,
              width: 28,
              height: 28,
              borderRadius: 14,
              backgroundColor: palette.paper,
              borderWidth: 2.5,
              borderColor: palette.page,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <SymbolView name="camera.fill" size={12} tintColor={palette.ink} />
          </View>
        </Press>
        <View style={{ flex: 1, gap: 2 }}>
          <Text
            style={{ color: palette.ink, fontSize: 28, fontWeight: "700", letterSpacing: -0.7 }}
            numberOfLines={2}
          >
            {name}
          </Text>
          <Text style={{ color: palette.ink3, fontSize: 15 }} numberOfLines={1}>
            {session.email}
          </Text>
        </View>
      </View>
      {snapshot ? (
        <Text style={{ color: palette.ink2, fontSize: 15, fontWeight: "500" }}>
          {count(mine.length, "note", "notes")}
          <Text style={{ color: palette.ink4 }}>{"  ·  "}</Text>
          {count(words, "word written", "words written")}
        </Text>
      ) : null}
    </View>
  );
}

/** Picks the reader's wallpaper and names it in their appearance; the web
 *  collects it from there like any other device's. */
export async function chooseWallpaper(
  session: Parameters<typeof uploadObjectBytes>[0],
): Promise<string | null> {
  const file = await pick(false);
  if (!file) return null;
  const objectId = randomUUID();
  await uploadObjectBytes(session, objectId, await file.arrayBuffer(), "image/jpeg");
  rememberPicture(objectId, file.uri);
  return objectId;
}
