/* The designer's Napp mark, shared with the native splash and the app icon.
 * It stands still while the archive opens and fades when the page is ready.
 * Reduced motion uses the same fade without the small exit scale. */
import { useEffect, useState } from "react";
import { Appearance, StyleSheet } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useArchive, usePalette } from "./archive";
import { EASE } from "@/lib/motionTokens";

/** Same size as the native splash's `imageWidth`. */
export const MARK = 128;

/* The ground the native splash is painted with: the default palette's page,
   light or dark by the phone's own setting, read before the app overrides it. */
const NATIVE_GROUND = Appearance.getColorScheme() === "dark" ? "#0d0d0e" : "#f8f5ee";
let first = true;

/* Metro's asset requires: an `import` of a png is typed a string here, by the
   web's declarations, and an Image wants Metro's asset number. */
/* eslint-disable @typescript-eslint/no-require-imports */
const logo = require("../assets/splash-mark.png");
/* eslint-enable @typescript-eslint/no-require-imports */

const out = Easing.bezier(EASE.out[0], EASE.out[1], EASE.out[2], EASE.out[3]);
/** Over everything while `waiting`; leaves on its own once it is not. */
export function Launch({ waiting }: { waiting: boolean }) {
  const palette = usePalette();
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(waiting);
  const [from] = useState(() => (first ? NATIVE_GROUND : null));
  const [settled, setSettled] = useState(from === null);
  const [slow, setSlow] = useState(false);
  /** 1 standing, 0 gone. */
  const presence = useSharedValue(1);

  if (waiting && !shown) setShown(true);

  useEffect(() => {
    first = false;
    /* One frame on the splash's ground, then into the reader's own. */
    const frame = requestAnimationFrame(() => setSettled(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!shown) return;
    if (waiting) {
      presence.value = withTiming(1, { duration: 200 });
      const timer = setTimeout(() => setSlow(true), 4000);
      return () => clearTimeout(timer);
    }
    const leave = () => {
      setShown(false);
      setSlow(false);
    };
    presence.value = withDelay(
      reduce ? 0 : 140,
      withTiming(0, { duration: reduce ? 240 : 380, easing: out }, (done) => {
        "worklet";
        if (done) scheduleOnRN(leave);
      }),
    );
  }, [waiting, shown, reduce, presence]);

  const ground = useAnimatedStyle(() => ({ opacity: presence.value }));
  const mark = useAnimatedStyle(() => ({
    opacity: interpolate(presence.value, [0, 0.6, 1], [0, 1, 1]),
    transform: [{ scale: reduce ? 1 : interpolate(presence.value, [0, 1], [0.97, 1]) }],
  }));
  if (!shown) return null;
  return (
    <Animated.View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Opening Napp"
      pointerEvents={waiting ? "auto" : "none"}
      style={[
        StyleSheet.absoluteFill,
        styles.center,
        {
          backgroundColor: settled ? palette.page : (from ?? palette.page),
          transitionProperty: "backgroundColor",
          transitionDuration: 420,
          transitionTimingFunction: "ease-out",
        },
        ground,
      ]}
    >
      <Animated.View style={[styles.mark, mark]}>
        <Animated.Image source={logo} style={styles.sheet} />
      </Animated.View>
      {slow && waiting ? (
        <Animated.Text
          entering={FadeIn.duration(320)}
          style={[styles.status, { color: palette.ink3 }]}
        >
          Still opening your notes
        </Animated.Text>
      ) : null}
    </Animated.View>
  );
}

/** Inside the archive: says when there is something to arrive into — the
 *  notes and the phone's own appearance, or the reason there will not be. */
export function ArchiveOpened({ onOpened }: { onOpened: () => void }) {
  const { snapshot, preferencesReady, warm, error } = useArchive();
  /* A phone that has opened this archive before already wears its own look
     (the appearance cache) and holds its notes: there is nothing to wait for. */
  const opened = Boolean((snapshot && (preferencesReady || warm)) || error);
  useEffect(() => {
    if (opened) onOpened();
  }, [opened, onOpened]);
  return null;
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center", zIndex: 20 },
  mark: { width: MARK, height: MARK },
  sheet: { position: "absolute", width: MARK, height: MARK },
  status: {
    position: "absolute",
    top: "50%",
    marginTop: MARK / 2 + 28,
    fontSize: 15,
  },
});
