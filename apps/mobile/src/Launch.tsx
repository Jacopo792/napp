/* The way in. The native splash is the mark on a plain ground (app.config.ts,
 * `expo-splash-screen`), and the first frame drawn here is that splash again,
 * pixel for pixel: the same three sheets, the same size, the same centre, on
 * the ground the splash was painted with. Only then does anything move.
 *
 * While the account and the archive open, the stack squares itself up the way
 * a hand taps a sheaf of paper on a desk — the two sheets underneath gather
 * under the top one, which lifts — and lets go again onto the fan of the icon.
 * Once the archive is there the stack gathers a last time and recedes, and the
 * page under it arrives (`useArrival`). Reduced motion: the mark stands still
 * and the way out is a fade.
 *
 * The sheets are the icon's own artwork, cut into three layers by
 * `assets/launch/` and turned here about the centre they share, so nothing is
 * redrawn by hand and the splash and the animation cannot disagree. */
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
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useArchive, usePalette } from "./archive";
import { EASE } from "@/lib/motionTokens";

/** The mark's box, in points — the splash's `imageWidth`. The artwork is
 *  700 units square around the stack's centre. */
export const MARK = 128;

/* The ground the native splash is painted with: the default palette's page,
   light or dark by the phone's own setting, read before the app overrides it. */
const NATIVE_GROUND = Appearance.getColorScheme() === "dark" ? "#0d0d0e" : "#f8f5ee";
let first = true;

/* Metro's asset requires: an `import` of a png is typed a string here, by the
   web's declarations, and an Image wants Metro's asset number. */
/* eslint-disable @typescript-eslint/no-require-imports */
const back = require("../assets/launch/sheet-back.png");
const middle = require("../assets/launch/sheet-middle.png");
const top = require("../assets/launch/sheet-top.png");
/* eslint-enable @typescript-eslint/no-require-imports */

const out = Easing.bezier(EASE.out[0], EASE.out[1], EASE.out[2], EASE.out[3]);
const inOut = Easing.bezier(EASE.inOut[0], EASE.inOut[1], EASE.inOut[2], EASE.inOut[3]);
/** Paper dropped onto paper: it arrives, gives a little and stops. */
const drop = { dampingRatio: 0.72, duration: 760 } as const;

/** Over everything while `waiting`; leaves on its own once it is not. */
export function Launch({ waiting }: { waiting: boolean }) {
  const palette = usePalette();
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(waiting);
  const [from] = useState(() => (first ? NATIVE_GROUND : null));
  const [settled, setSettled] = useState(from === null);
  const [slow, setSlow] = useState(false);
  /** 0 is the icon's fan, 1 the stack squared up. */
  const gather = useSharedValue(0);
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
      if (!reduce)
        gather.value = withDelay(
          420,
          withRepeat(
            withSequence(
              withTiming(1, { duration: 640, easing: inOut }),
              withDelay(90, withSpring(0, drop)),
              withDelay(620, withTiming(0, { duration: 0 })),
            ),
            -1,
          ),
        );
      return () => clearTimeout(timer);
    }
    const leave = () => {
      setShown(false);
      setSlow(false);
    };
    if (!reduce) gather.value = withTiming(1, { duration: 260, easing: out });
    presence.value = withDelay(
      reduce ? 0 : 140,
      withTiming(0, { duration: reduce ? 240 : 380, easing: out }, (done) => {
        "worklet";
        if (done) scheduleOnRN(leave);
      }),
    );
  }, [waiting, shown, reduce, gather, presence]);

  const ground = useAnimatedStyle(() => ({ opacity: presence.value }));
  const mark = useAnimatedStyle(() => ({
    opacity: interpolate(presence.value, [0, 0.6, 1], [0, 1, 1]),
    transform: [{ scale: interpolate(presence.value, [0, 1], [0.86, 1]) }],
  }));
  const backSheet = useAnimatedStyle(() => ({
    transform: [
      { translateY: gather.value * 2 },
      { rotate: `${interpolate(gather.value, [0, 1], [-15, -6])}deg` },
      { scale: interpolate(gather.value, [0, 1], [1, 0.97]) },
    ],
  }));
  const middleSheet = useAnimatedStyle(() => ({
    transform: [
      { translateY: gather.value * 1 },
      { rotate: `${interpolate(gather.value, [0, 1], [11, -1])}deg` },
      { scale: interpolate(gather.value, [0, 1], [1, 0.985]) },
    ],
  }));
  const topSheet = useAnimatedStyle(() => ({
    transform: [
      { translateY: gather.value * -5 },
      { rotate: `${interpolate(gather.value, [0, 1], [-4, -2])}deg` },
      { scale: interpolate(gather.value, [0, 1], [1, 1.02]) },
    ],
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
        <Animated.Image source={back} style={[styles.sheet, backSheet]} />
        <Animated.Image source={middle} style={[styles.sheet, middleSheet]} />
        <Animated.Image source={top} style={[styles.sheet, topSheet]} />
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
  const { snapshot, preferencesReady, error } = useArchive();
  const opened = Boolean((snapshot && preferencesReady) || error);
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
