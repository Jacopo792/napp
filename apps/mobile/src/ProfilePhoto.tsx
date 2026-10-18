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
  const { session, profile, updateProfile } = useArchive();
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
  return (
    <View style={{ alignItems: "center", paddingTop: 4, paddingBottom: 28, gap: 4 }}>
      <Press
        feedback="scale"
        accessibilityRole="button"
        accessibilityLabel={profile?.avatarObject ? "Edit Photo" : "Add Photo"}
        disabled={!profile || busy}
        onPress={offer}
        style={{ opacity: busy ? 0.5 : 1, marginBottom: 12 }}
      >
        <Avatar
          face={{
            userId: session.userId,
            name: profile?.nickname ?? "",
            avatarObject: profile?.avatarObject ?? null,
          }}
          email={session.email}
          size={104}
        />
        <View
          style={{
            position: "absolute",
            right: -2,
            bottom: 0,
            width: 34,
            height: 34,
            borderRadius: 17,
            backgroundColor: palette.paper,
            borderWidth: 3,
            borderColor: palette.page,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <SymbolView name="camera.fill" size={15} tintColor={palette.ink} />
        </View>
      </Press>
      <Text
        style={{
          color: palette.ink,
          fontSize: 26,
          fontWeight: "700",
          letterSpacing: -0.5,
          textAlign: "center",
          paddingHorizontal: 20,
        }}
        numberOfLines={2}
      >
        {name}
      </Text>
      <Text style={{ color: palette.ink3, fontSize: 15 }} numberOfLines={1}>
        {session.email}
      </Text>
      <Press
        feedback="scale"
        accessibilityRole="button"
        disabled={!profile || busy}
        onPress={offer}
        hitSlop={8}
        style={{
          marginTop: 14,
          paddingHorizontal: 16,
          paddingVertical: 8,
          borderRadius: 18,
          backgroundColor: palette.paper,
        }}
      >
        <Text style={{ color: palette.accent, fontSize: 15, fontWeight: "600" }}>
          {profile?.avatarObject ? "Edit Photo" : "Add Photo"}
        </Text>
      </Press>
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
