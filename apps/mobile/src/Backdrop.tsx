/* The ground under every list: the reader's own wallpaper — the account's
 * picture, the one the web draws behind the window — blurred and dimmed as
 * they set it, so the cards above it read as material standing on something
 * rather than grey on grey. That is where the depth comes from, and it is
 * authored by the reader: with no picture the ground is the plain page, never
 * a wash invented for it. Each screen draws its own, so a pushed screen slides
 * in opaque. It is drawn after the scroller, under it by `zIndex`: the
 * native stack links its large title to the screen's first scroll view, and
 * a view ahead of it breaks the collapse. */
import { useEffect, useState } from "react";
import { Image, StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useAppearance } from "@/lib/appearance";
import { downloadObject } from "@/lib/supabase";
import { useArchive, usePalette } from "./archive";
import { picture } from "./Avatar";

/** The cards' ground: translucent over a picture, solid over the page. */
export function useCard(): { card: string; wallpaper: boolean } {
  const appearance = useAppearance();
  const palette = usePalette();
  const wallpaper = Boolean(appearance.wallpaper && appearance.wallpaperObject);
  return {
    wallpaper,
    card: wallpaper && /^#[\da-f]{6}$/i.test(palette.paper) ? `${palette.paper}e0` : palette.paper,
  };
}

export function Backdrop() {
  const { session } = useArchive();
  const appearance = useAppearance();
  const palette = usePalette();
  const { height } = useWindowDimensions();
  const objectId = appearance.wallpaper ? appearance.wallpaperObject : null;
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    if (!objectId) setUri(null);
    else
      void picture(objectId, () => downloadObject(session, objectId, "image/jpeg")).then(
        (next) => live && setUri(next),
      );
    return () => {
      live = false;
    };
  }, [session, objectId]);
  if (!uri) return null;
  /* Revolut's hero: the picture whole and sharp at the top, fading into the
     ground the cards stand on, so what is read sits on the dark and what is
     glanced at sits on the picture. The fade is a scrim over a photograph,
     not a wash invented for the chrome. */
  return (
    <Animated.View
      entering={FadeIn.duration(320)}
      style={[StyleSheet.absoluteFill, { backgroundColor: palette.page, zIndex: -1 }]}
      pointerEvents="none"
    >
      <View style={{ height: height * 0.62 }}>
        <Image
          source={{ uri }}
          resizeMode={appearance.wallpaperFit === "contain" ? "contain" : "cover"}
          blurRadius={appearance.wallpaperBlur * 2}
          style={StyleSheet.absoluteFill}
        />
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: palette.dark ? "#000" : "#fff",
              opacity: appearance.wallpaperDim / 100,
            },
          ]}
        />
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundImage: `linear-gradient(to bottom, ${palette.page}00 35%, ${palette.page} 100%)`,
            },
          ]}
        />
      </View>
    </Animated.View>
  );
}
