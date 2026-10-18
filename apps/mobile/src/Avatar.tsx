/* A face: the member's own picture, or their letters on the accent, and a
 * small stack of them for "who else is here". The picture is the core's — the
 * same private bucket, the same initials rule — read once per object and held
 * as a data URI, because an object id names one picture for ever: a new photo
 * is a new id, so nothing here ever needs invalidating. */
import { useEffect, useState } from "react";
import { Image, Text, View } from "react-native";
import Animated, { FadeIn, ZoomIn } from "react-native-reanimated";
import { avatarInitials } from "@/lib/avatarInitials";
import { downloadAvatar } from "@/lib/supabase";
import { usePalette } from "./archive";

export const clearPictures = () => pictures.clear();

const pictures = new Map<string, Promise<string | null>>();

const asDataUri = (blob: Blob | null) =>
  blob
    ? new Promise<string | null>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      })
    : Promise.resolve(null);

/** One picture per stored object, read once. A refusal is not remembered: the
 *  next face asked for tries again. The wallpaper behind the screens is read
 *  through here too. */
export function picture(objectId: string, load: () => Promise<Blob | null>) {
  let found = pictures.get(objectId);
  if (!found) {
    found = load()
      .then(asDataUri)
      .catch(() => null);
    void found.then((uri) => uri ?? pictures.delete(objectId));
    pictures.set(objectId, found);
  }
  return found;
}

/** A picture this phone just uploaded is already on disk: no round trip. */
export function rememberPicture(objectId: string, uri: string) {
  pictures.set(objectId, Promise.resolve(uri));
}

export interface Face {
  userId: string;
  name: string;
  avatarObject: string | null;
  online?: boolean;
}

/* A face without a picture is its letters in a hue of its own, on a disc of
   that same hue tinted into the ground — Revolut's contact chips, never a loud
   filled circle. The reader's own face takes the accent; everybody else's hue
   is picked from the id — never blue, the accent most readers keep — so a
   person keeps it on every screen and two faces
   side by side never read as one. The disc is mixed opaque rather than drawn
   translucent, because faces overlap and one must not show through another. */
const HUES = ["#f5b83d", "#ff9f43", "#c77dff", "#3ecf8e", "#ff6b8b", "#4dc9e6"];
const hueOf = (userId: string) =>
  HUES[[...userId].reduce((sum, char) => sum + char.charCodeAt(0), 0) % HUES.length];

const rgb = (hex: string) => {
  const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})/i.exec(hex);
  return match ? match.slice(1).map((part) => parseInt(part, 16)) : null;
};
/** `a` taken `t` of the way to `b`; `a` itself when either is not a hex. */
const mix = (a: string, b: string, t: number) => {
  const from = rgb(a);
  const to = rgb(b);
  if (!from || !to) return a;
  return `#${from
    .map((part, at) =>
      Math.round(part + (to[at] - part) * t)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
};

export function Avatar({
  face,
  email,
  size = 30,
  ring,
}: {
  face: Face;
  email?: string;
  size?: number;
  /** The ground the face stands on, drawn as a ring where faces overlap. */
  ring?: string;
}) {
  const palette = usePalette();
  const { userId, avatarObject, name, online } = face;
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setUri(null);
    if (avatarObject)
      void picture(avatarObject, () => downloadAvatar(userId, avatarObject)).then((next) => {
        if (live) setUri(next);
      });
    return () => {
      live = false;
    };
  }, [userId, avatarObject]);
  const border = ring ? Math.max(1.5, size / 16) : 0;
  const dot = Math.max(7, Math.round(size / 3.6));
  const hue = email ? palette.accent : hueOf(userId);
  /* In the light a tint as faint as the dark one's reads as washed out: the
     disc takes more of the hue and the letters go deeper. */
  const disc = mix(palette.paper, hue, palette.dark ? 0.32 : 0.36);
  const letters = palette.dark ? mix(hue, "#ffffff", 0.25) : mix(hue, "#000000", 0.42);
  return (
    <View
      accessible
      accessibilityLabel={`${name || "Member"}${online ? ", here now" : ""}`}
      style={{ width: size, height: size }}
    >
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: border,
          borderColor: ring,
          backgroundColor: disc,
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        <Text
          style={{
            color: letters,
            fontSize: size * 0.42,
            fontWeight: "600",
            letterSpacing: -0.2,
          }}
          allowFontScaling={false}
        >
          {avatarInitials(name, email)}
        </Text>
        {uri ? (
          <Animated.View
            entering={FadeIn.duration(180)}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: size - border * 2,
              height: size - border * 2,
              borderRadius: size / 2,
              overflow: "hidden",
            }}
          >
            <Image source={{ uri }} style={{ flex: 1 }} onError={() => setUri(null)} />
          </Animated.View>
        ) : null}
      </View>
      {online ? (
        <Animated.View
          entering={ZoomIn.duration(220)}
          style={{
            position: "absolute",
            right: -1,
            bottom: -1,
            width: dot,
            height: dot,
            borderRadius: dot / 2,
            backgroundColor: "#34c759",
            borderWidth: Math.max(1.5, dot / 5),
            borderColor: ring ?? palette.paper,
          }}
        />
      ) : null}
    </View>
  );
}

/** Overlapping faces, the first on top, and a count for whoever does not fit. */
export function Faces({
  faces,
  size = 22,
  ring,
  max = 3,
}: {
  faces: Face[];
  size?: number;
  ring: string;
  max?: number;
}) {
  const palette = usePalette();
  if (!faces.length) return null;
  const shown = faces.slice(0, max);
  const rest = faces.length - shown.length;
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      {shown.map((face, at) => (
        <View
          key={face.userId}
          style={{ marginLeft: at ? -size * 0.32 : 0, zIndex: shown.length - at }}
        >
          <Avatar face={face} size={size} ring={ring} />
        </View>
      ))}
      {rest > 0 ? (
        <Text style={{ color: palette.ink3, fontSize: size * 0.55, marginLeft: 4 }}>+{rest}</Text>
      ) : null}
    </View>
  );
}
