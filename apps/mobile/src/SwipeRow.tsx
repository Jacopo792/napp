/* A note's row: pressed, it opens the note with the system's zoom out of the
 * row; held, it offers the system's menu; pushed sideways, it uncovers its two
 * acts.
 *
 * The push follows the web's rules — "Taking a note back" in CLAUDE.md — and
 * its numbers, from @/lib/swipe: the push opens, the press acts, there is no
 * distance that does anything. Left uncovers the destructive act on the right,
 * right the one that files the note away. The row follows the finger on the UI
 * thread, settles with `--ease-bounce` once it is let go, and ticks the moment
 * it is open. */
import { useEffect, type ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type PressableProps,
} from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { Link, type Href } from "expo-router";
import type { SFSymbol } from "expo-symbols";
import { SymbolView } from "./icons";
import * as Haptics from "expo-haptics";
import { clampTravel, OPEN, settleTravel } from "@/lib/swipe";
import { usePalette } from "./archive";
import { settle, travel } from "./theme";

export interface Act {
  label: string;
  icon: SFSymbol;
  colour: string;
  run: () => void;
  disabled?: boolean;
  stationary?: boolean;
}

interface Props {
  href: Href;
  title: string;
  stamp: string;
  preview: string;
  pinned?: boolean;
  locked?: boolean;
  /** Uncovered on the right by a push to the left. */
  left: Act;
  /** Uncovered on the left by a push to the right. */
  right: Act;
  /** The system menu a held row offers: `Link.Menu` and its actions. */
  menu: ReactNode;
  first: boolean;
  last: boolean;
  /** Close every other row; one row open at a time, as on the web. */
  onClaim: () => void;
  /** Hand the list a way to close this row when another one opens. */
  register: (close: () => void) => () => void;
}

const INSET = 3;
const GIVE = 0.5;
const RADIUS = 26;

const tick = () => void Haptics.selectionAsync();

/* Link's Slot merges object styles and cannot preserve a Pressable style
   callback. Keep that callback inside the component the Slot receives. */
function NoteFace(props: PressableProps) {
  const palette = usePalette();
  return (
    <Pressable
      {...props}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: palette.surface }]}
    />
  );
}

export function SwipeRow(props: Props) {
  const { href, title, stamp, preview, pinned, locked, left, right, menu, first, last } = props;
  const { onClaim, register } = props;
  const palette = usePalette();
  const { width } = useWindowDimensions();
  const x = useSharedValue(0);
  const start = useSharedValue(0);
  const opened = useSharedValue(false);

  useEffect(() => register(() => (x.value = withTiming(0, settle))), [register, x]);

  const pan = usePanGesture({
    activeOffsetX: [-12, 12],
    failOffsetY: [-10, 10],
    onActivate: () => {
      start.value = x.value;
      scheduleOnRN(onClaim);
    },
    onUpdate: (event) => {
      const raw = start.value + event.translationX;
      /* Past the open position the row resists: give, never a threshold. */
      const over = Math.abs(raw) - OPEN;
      x.value = clampTravel(over > 0 ? Math.sign(raw) * (OPEN + over * GIVE) : raw);
      const open = Math.abs(x.value) >= OPEN;
      if (open !== opened.value) {
        opened.value = open;
        if (open) scheduleOnRN(tick);
      }
    },
    onDeactivate: (event) => {
      /* A flick carries a little further than where the finger stopped. */
      x.value = withTiming(settleTravel(x.value + event.velocityX * 0.08), settle);
      opened.value = false;
    },
  });

  const face = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  /* The row leaves the way it was pushed, the panel filling the row behind it,
     and only then does the act run and the list close over the gap. */
  const act = (side: "left" | "right") => {
    const chosen = side === "left" ? left : right;
    if (chosen.disabled) {
      x.value = withTiming(0, settle);
      return;
    }
    if (chosen.stationary) {
      x.value = withTiming(0, settle);
      chosen.run();
      return;
    }
    void Haptics.impactAsync(
      side === "left" ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Medium,
    );
    x.value = withTiming(side === "left" ? -width : width, travel, (done) => {
      if (done) scheduleOnRN(chosen.run);
    });
  };

  const corners = {
    borderTopLeftRadius: first ? RADIUS : 0,
    borderTopRightRadius: first ? RADIUS : 0,
    borderBottomLeftRadius: last ? RADIUS : 0,
    borderBottomRightRadius: last ? RADIUS : 0,
  };

  return (
    <View style={[styles.frame, corners]}>
      <Panel edge="left" act={right} x={x} onPress={() => act("right")} />
      <Panel edge="right" act={left} x={x} onPress={() => act("left")} />
      <GestureDetector gesture={pan}>
        <Animated.View style={[{ backgroundColor: palette.paper }, corners, face]}>
          <Link
            href={href}
            asChild
            onPress={(event) => {
              /* A press on an open row closes it rather than opening the note. */
              if (x.value !== 0) {
                event.preventDefault();
                x.value = withTiming(0, settle);
              }
            }}
          >
            <Link.Trigger withAppleZoom>
              <NoteFace>
                <View
                  style={[
                    styles.text,
                    !last && {
                      borderBottomColor: palette.rule,
                      borderBottomWidth: StyleSheet.hairlineWidth,
                    },
                  ]}
                >
                  <View style={styles.titleLine}>
                    <Text style={[styles.title, { color: palette.ink }]} numberOfLines={1}>
                      {title}
                    </Text>
                    {locked ? (
                      <SymbolView name="lock.fill" size={13} tintColor={palette.ink3} />
                    ) : null}
                    {pinned ? (
                      <SymbolView name="pin.fill" size={13} tintColor={palette.accent} />
                    ) : null}
                  </View>
                  <Text style={[styles.preview, { color: palette.ink3 }]} numberOfLines={1}>
                    <Text style={{ color: palette.ink2 }}>{stamp} </Text>
                    {preview || "No additional text"}
                  </Text>
                </View>
              </NoteFace>
            </Link.Trigger>
            {menu}
          </Link>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

function Panel({
  edge,
  act,
  x,
  onPress,
}: {
  /** Which edge of the row the panel stands at: the left one is uncovered by a
   *  push to the right. */
  edge: "left" | "right";
  act: Act;
  x: SharedValue<number>;
  onPress: () => void;
}) {
  const sign = edge === "left" ? 1 : -1;
  const panel = useAnimatedStyle(() => {
    const travelled = Math.max(0, sign * x.value);
    return { width: travelled, opacity: travelled > 0 ? 1 : 0 };
  });
  /* `--reveal`: the mark grows on the same travel rather than standing there
     whole behind a row that has barely moved. */
  const mark = useAnimatedStyle(() => {
    const reveal = Math.min(1, Math.max(0, sign * x.value) / OPEN);
    return { opacity: reveal, transform: [{ scale: interpolate(reveal, [0, 1], [0.6, 1]) }] };
  });
  return (
    <Animated.View
      style={[
        styles.panel,
        edge === "left" ? styles.panelLeftEdge : styles.panelRightEdge,
        { backgroundColor: act.colour },
        panel,
      ]}
    >
      <Pressable
        style={styles.panelPress}
        onPress={onPress}
        disabled={act.disabled}
        accessibilityLabel={act.label}
      >
        <Animated.View style={[styles.mark, mark]}>
          <SymbolView name={act.icon} size={22} tintColor="#ffffff" weight="semibold" />
          <Text style={styles.markLabel}>{act.label}</Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  frame: { marginHorizontal: 16, overflow: "hidden" },
  row: { paddingLeft: 20 },
  text: { paddingVertical: 11, paddingRight: 20, gap: 3 },
  titleLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  title: { flexShrink: 1, fontSize: 17, fontWeight: "600" },
  preview: { fontSize: 15 },
  panel: { position: "absolute", top: INSET, bottom: INSET, overflow: "hidden" },
  panelLeftEdge: { left: INSET, borderTopLeftRadius: 22, borderBottomLeftRadius: 22 },
  panelRightEdge: { right: INSET, borderTopRightRadius: 22, borderBottomRightRadius: 22 },
  panelPress: { flex: 1, alignItems: "center", justifyContent: "center" },
  mark: { alignItems: "center", gap: 3, minWidth: OPEN - INSET * 2 },
  markLabel: { color: "#ffffff", fontSize: 12, fontWeight: "600" },
});
