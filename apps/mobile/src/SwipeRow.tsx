/* A row that goes somewhere: pressed, it opens with the system's zoom out of
 * the row; held, it lifts a preview with the system's menu under it; pushed
 * sideways, it uncovers its acts. Notes and folders are both this row — what
 * is drawn inside it is the caller's.
 *
 * The push is Mail's, at Jacopo's request (17 October 2026), and on the phone
 * it departs from the web's rule in one place: a short push opens the row on
 * its button, as everywhere — but a push past half the row arms the act, and
 * letting go there performs it. The colour is a band attached to the row at
 * full height, the glyph rides beside the row's edge, and when the act arms
 * the glyph grows with a tick so the hand knows before it lets go. Right
 * uncovers the bin, left files away. Nothing bounces: the row settles on
 * `--ease-out`, because an overshoot after the hand has decided reads as the
 * list hesitating. */
import { useEffect, type ReactNode } from "react";
import { Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { Link, type Href } from "expo-router";
import type { SFSymbol } from "expo-symbols";
import * as Haptics from "expo-haptics";
import { OPEN } from "@/lib/swipe";
import { SymbolView } from "./icons";
import { usePalette } from "./archive";
import { useCard } from "./Backdrop";
import { CARD_RADIUS, quiet } from "./Grouped";
import { travel } from "./theme";

export interface Act {
  label: string;
  icon: SFSymbol;
  colour: string;
  run: () => void;
  disabled?: boolean;
  /** Asks before it acts (an alert), so the row comes back rather than leaving. */
  stationary?: boolean;
}

interface Props {
  href: Href;
  children: ReactNode;
  /** Uncovered on the left by a push to the right: the bin. */
  rightward?: Act;
  /** Uncovered on the right by a push to the left: the shelf. */
  leftward?: Act;
  /** The system menu a held row offers: `Link.Menu` and its actions. */
  menu: ReactNode;
  /** What a held row lifts above that menu. */
  preview?: ReactNode;
  first: boolean;
  last: boolean;
  /** Inside a `Group`, which already is the card. */
  bare?: boolean;
  /** Close every other row; one row open at a time, as on the web. */
  onClaim: () => void;
  /** Hand the list a way to close this row when another one opens. */
  register: (close: () => void) => () => void;
}

/** Past this share of the row's width, letting go performs the act. */
const ARM = 0.5;
const GLYPH = 26;

const tick = () => void Haptics.selectionAsync().catch(() => {});
const thud = () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

export function SwipeRow(props: Props) {
  const { href, children, rightward, leftward, menu, preview, first, last, bare } = props;
  const { onClaim, register } = props;
  const palette = usePalette();
  const { card } = useCard();
  const { width: screen } = useWindowDimensions();
  /* The row's own width: the screen less the card's margins. */
  const width = screen - 32;
  const x = useSharedValue(0);
  const start = useSharedValue(0);
  const armed = useSharedValue(false);
  const released = useSharedValue(true);
  const canRight = Boolean(rightward && !rightward.disabled);
  const canLeft = Boolean(leftward && !leftward.disabled);

  useEffect(() => register(() => (x.value = withTiming(0, travel))), [register, x]);

  const perform = (direction: number) => {
    const chosen = direction > 0 ? rightward : leftward;
    if (!chosen || chosen.disabled) {
      x.value = withTiming(0, travel);
      return;
    }
    if (chosen.stationary) {
      x.value = withTiming(0, travel);
      chosen.run();
      return;
    }
    thud();
    x.value = withTiming(Math.sign(direction) * screen, travel, (done) => {
      if (done) scheduleOnRN(chosen.run);
    });
  };

  const pan = usePanGesture({
    enabled: canRight || canLeft,
    activeOffsetX: [-12, 12],
    failOffsetY: [-10, 10],
    onActivate: () => {
      released.value = false;
      start.value = x.value;
      scheduleOnRN(onClaim);
    },
    onUpdate: (event) => {
      let raw = start.value + event.translationX;
      /* A side with nothing behind it only gives a little, like a list end. */
      if ((raw > 0 && !canRight) || (raw < 0 && !canLeft)) raw *= 0.1;
      x.value = Math.max(-width, Math.min(width, raw));
      const arm = Math.abs(x.value) >= width * ARM;
      if (arm !== armed.value) {
        armed.value = arm;
        scheduleOnRN(tick);
      }
    },
    onDeactivate: (event) => {
      released.value = true;
      const reach = x.value + event.velocityX * 0.1;
      const direction = reach > 0 ? 1 : -1;
      const allowed = direction > 0 ? canRight : canLeft;
      const wasArmed = armed.value;
      armed.value = false;
      if (allowed && (wasArmed || Math.abs(reach) >= width * ARM)) {
        scheduleOnRN(perform, direction);
        return;
      }
      const rest = allowed && Math.abs(reach) >= OPEN / 2 ? direction * OPEN : 0;
      x.value = withTiming(rest, travel);
    },
    /* Taken away rather than let go — the held row's menu claimed the touch —
       the row still comes to rest instead of staying where the finger was. */
    onFinalize: () => {
      if (released.value) return;
      released.value = true;
      armed.value = false;
      x.value = withTiming(0, travel);
    },
  });

  const face = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  const corners = {
    borderTopLeftRadius: first ? CARD_RADIUS : 0,
    borderTopRightRadius: first ? CARD_RADIUS : 0,
    borderBottomLeftRadius: last ? CARD_RADIUS : 0,
    borderBottomRightRadius: last ? CARD_RADIUS : 0,
  };

  return (
    <View style={[styles.frame, bare && { marginHorizontal: 0 }, corners]}>
      {rightward ? (
        <Band edge="left" act={rightward} x={x} width={width} onPress={() => perform(1)} />
      ) : null}
      {leftward ? (
        <Band edge="right" act={leftward} x={x} width={width} onPress={() => perform(-1)} />
      ) : null}
      <GestureDetector gesture={pan}>
        <Animated.View style={[{ backgroundColor: bare ? undefined : card }, corners, face]}>
          <Link
            href={href}
            asChild
            onPress={(event) => {
              /* A press on an open row closes it rather than opening it. */
              if (x.value !== 0) {
                event.preventDefault();
                x.value = withTiming(0, travel);
              }
            }}
          >
            <Link.Trigger withAppleZoom>
              <Pressable style={({ pressed }) => pressed && { backgroundColor: quiet(palette) }}>
                {children}
              </Pressable>
            </Link.Trigger>
            {preview ? <Link.Preview>{preview}</Link.Preview> : null}
            {menu}
          </Link>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

/** The colour behind the row, at full height and as wide as the row has
 *  travelled. Its glyph is centred in the band until the band is wider than
 *  the open position, then rides beside the row's edge. */
function Band({
  edge,
  act,
  x,
  width,
  onPress,
}: {
  edge: "left" | "right";
  act: Act;
  x: SharedValue<number>;
  width: number;
  onPress: () => void;
}) {
  const sign = edge === "left" ? 1 : -1;
  const band = useAnimatedStyle(() => {
    const travelled = Math.max(0, sign * x.value);
    return { width: travelled, opacity: travelled > 0 ? 1 : 0 };
  });
  const glyph = useAnimatedStyle(() => {
    const travelled = Math.max(0, sign * x.value);
    const offset = travelled <= OPEN ? (travelled - GLYPH) / 2 : travelled - OPEN / 2 - GLYPH / 2;
    return {
      opacity: Math.min(1, travelled / (OPEN * 0.6)),
      transform: [
        { translateX: sign * Math.max(0, offset) },
        { scale: withTiming(travelled >= width * ARM ? 1.2 : 1, { duration: 140 }) },
      ],
    };
  });
  return (
    <Animated.View
      style={[
        styles.band,
        edge === "left" ? { left: 0 } : { right: 0 },
        { backgroundColor: act.disabled ? "#8e8e93" : act.colour },
        band,
      ]}
    >
      <Pressable
        style={[styles.press, { alignItems: edge === "left" ? "flex-start" : "flex-end" }]}
        onPress={onPress}
        disabled={act.disabled}
        accessibilityRole="button"
        accessibilityLabel={act.label}
      >
        <Animated.View style={[{ width: GLYPH, alignItems: "center" }, glyph]}>
          <SymbolView name={act.icon} size={22} tintColor="#ffffff" weight="semibold" />
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  frame: { marginHorizontal: 16, overflow: "hidden", borderCurve: "continuous" },
  band: { position: "absolute", top: 0, bottom: 0, overflow: "hidden" },
  press: { flex: 1, justifyContent: "center" },
});
