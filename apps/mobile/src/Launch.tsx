/* The launch is the designer's mark as a combination lock. The native splash
 * is the mark itself (`splash-mark.png`: black tile, white arch, five rules),
 * and the first frame here is the same mark at the same size and centre,
 * drawn as separate Views so each part can move. While the archive opens the
 * lock is closed and the five rules are its cylinders: each drifts a few
 * points either way inside the tile, searching for the combination, and the
 * mark stays the mark in every frame. When the archive is open they fall into line one after
 * another, top to bottom, each with a tick under the finger; the arch springs
 * up, the lock is open, and the tile gives way to the Home. A warm start does
 * the same in well under a second. Reduced motion keeps the arch and the fade. */
import { useEffect, useState } from "react";
import { Appearance, Image, StyleSheet, View } from "react-native";
import * as Haptics from "expo-haptics";
import Animated, {
  Easing,
  FadeIn,
  type SharedValue,
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

/** Same size as the native splash's `imageWidth`. */
export const MARK = 128;
/** `docs/branding/napp-logo.svg` is drawn in a 492 box; this is one unit. */
const U = MARK / 492;
const TILE_RADIUS = 128 * U;
/** The arch's box: legs at x 206 and 286 with a 14 stroke, from y 232 up to
 *  155, with a little room for the antialiased edge. It is cut out of the
 *  splash's own png rather than redrawn, because a border-radius is not the
 *  svg's curve and the first frame has to be the splash to the pixel; the cut
 *  carries the tile's black with it, which is invisible over the tile. */
const ARCH = { left: 195 * U, top: 144 * U, width: 102 * U, height: 88 * U };
/** The rules: x 177…315, 9 high. */
const RULE = { left: 177 * U, width: 138 * U, height: 9 * U };
const RULES = [232, 253, 274, 296, 317].map((y) => y * U);
/** Each cylinder's search: how far it drifts either side, in points, how
 *  long a swing takes, where in its swing it starts. Different for every
 *  rule, so nothing lines up. */
const SEARCH = [
  { reach: 9, period: 2300, phase: 0.3 },
  { reach: 6, period: 1900, phase: 2.1 },
  { reach: 11, period: 2700, phase: 4.0 },
  { reach: 7, period: 2100, phase: 1.2 },
  { reach: 10, period: 2500, phase: 5.2 },
];
const STAGGER = 65;
/** The arch springs up by 7/64 of the tile. */
const LIFT = (7 / 64) * MARK;

/* The ground the native splash is painted with: the default palette's page,
   light or dark by the phone's own setting, read before the app overrides it. */
const NATIVE_GROUND = Appearance.getColorScheme() === "dark" ? "#0d0d0e" : "#f8f5ee";
let first = true;

/* Metro's asset requires: an `import` of a png is typed a string here, by the
   web's declarations, and an Image wants Metro's asset number. */
/* eslint-disable @typescript-eslint/no-require-imports */
const splash = require("../assets/splash-mark.png");
/* eslint-enable @typescript-eslint/no-require-imports */

const out = Easing.bezier(EASE.out[0], EASE.out[1], EASE.out[2], EASE.out[3]);

/** Where a searching cylinder is at a moment of the clock. */
function drift(search: (typeof SEARCH)[number], ms: number): number {
  "worklet";
  return search.reach * Math.sin((ms / search.period) * 2 * Math.PI + search.phase);
}

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
  /** The search's clock, in ms. */
  const clock = useSharedValue(0);
  /** How far each cylinder has fallen into its place: 0 searching, 1 in line.
   *  It springs a hair past 1 and back, which is the settle. */
  const found = [
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
  ];
  const arch = useSharedValue(0);

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
      presence.value = 1;
      arch.value = 0;
      for (const f of found) f.value = 0;
      if (!reduce) {
        clock.value = 0;
        clock.value = withRepeat(
          withTiming(600_000, { duration: 600_000, easing: Easing.linear }),
          -1,
          false,
        );
      }
      const timer = setTimeout(() => setSlow(true), 4000);
      return () => clearTimeout(timer);
    }

    const leave = () => {
      setShown(false);
      setSlow(false);
    };
    const tick = () => void Haptics.selectionAsync().catch(() => {});
    const open = () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    if (reduce) {
      arch.value = withTiming(1, { duration: 200 });
      presence.value = withDelay(
        200,
        withTiming(0, { duration: 240 }, (done) => {
          "worklet";
          if (done) scheduleOnRN(leave);
        }),
      );
      return;
    }

    /* Each cylinder, in turn, falls from wherever its search has it into
       its place, top to bottom. All of it is timed on the UI thread: the
       Home is mounting on the JS thread at this very moment, and a lock
       timed there arrived after the arch had already opened. A warm start
       needs nothing of its own — the search starts off its combination
       (every phase is), so even a lock that never waited visibly closes. */
    found.forEach((f, index) => {
      f.value = withDelay(
        index * STAGGER,
        withSpring(1, { duration: 200, dampingRatio: 0.82 }, (done) => {
          "worklet";
          if (done) scheduleOnRN(tick);
        }),
      );
    });
    const aligned = (SEARCH.length - 1) * STAGGER + 200;
    arch.value = withDelay(
      aligned + 40,
      withSequence(
        withTiming(0, { duration: 0 }, (done) => {
          "worklet";
          if (done) scheduleOnRN(open);
        }),
        withSpring(1, { duration: 420, dampingRatio: 0.55 }),
      ),
    );
    presence.value = withDelay(
      aligned + 160,
      withTiming(0, { duration: 250, easing: out }, (done) => {
        "worklet";
        if (done) scheduleOnRN(leave);
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the five cylinders are fixed refs
  }, [waiting, shown, reduce, presence, clock, arch]);

  const ground = useAnimatedStyle(() => ({ opacity: Math.min(1, presence.value * 1.4) }));
  const tile = useAnimatedStyle(() => ({
    opacity: presence.value,
    transform: [{ scale: 0.6 + 0.4 * presence.value }],
  }));
  const archStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -LIFT * arch.value }],
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
      <Animated.View style={[styles.tile, tile]}>
        <View style={styles.clip}>
          {RULES.map((top, index) => (
            <Cylinder
              key={index}
              top={top}
              search={SEARCH[index]}
              clock={clock}
              found={found[index]}
            />
          ))}
        </View>
        <Animated.View style={[styles.arch, archStyle]}>
          <Image source={splash} style={styles.archImage} />
        </Animated.View>
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

/** One rule of the mark as one cylinder of the lock. */
function Cylinder({
  top,
  search,
  clock,
  found,
}: {
  top: number;
  search: (typeof SEARCH)[number];
  clock: SharedValue<number>;
  found: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    const x = drift(search, clock.value) * (1 - found.value);
    return { transform: [{ translateX: x }] };
  });
  return <Animated.View style={[styles.rule, { top }, style]} />;
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
  tile: { width: MARK, height: MARK },
  clip: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#000",
    /* The svg's own corner, a plain radius: the png it is drawn over has it. */
    borderRadius: TILE_RADIUS,
    overflow: "hidden",
  },
  rule: {
    position: "absolute",
    left: RULE.left,
    width: RULE.width,
    height: RULE.height,
    backgroundColor: "#fff",
  },
  arch: {
    position: "absolute",
    left: ARCH.left,
    top: ARCH.top,
    width: ARCH.width,
    height: ARCH.height,
    overflow: "hidden",
  },
  archImage: { position: "absolute", left: -ARCH.left, top: -ARCH.top, width: MARK, height: MARK },
  status: {
    position: "absolute",
    top: "50%",
    marginTop: MARK / 2 + 28,
    fontSize: 15,
  },
});
