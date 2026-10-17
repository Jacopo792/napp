/* A note's row, which a finger pushes sideways.
 *
 * The rules are the web's — "Taking a note back" in CLAUDE.md — and so are the
 * numbers, from @/lib/swipe. The push opens; the press acts; there is no
 * distance that does anything. Pushing left uncovers the destructive act on
 * the right, pushing right the one that files the note away, as in Mail. The
 * row follows the finger on the UI thread, settles with `--ease-bounce` once
 * it is let go, and ticks under the finger the moment it is open.
 *
 * The act is a panel the row uncovers, inset by three from the row's edges and
 * rounded only on its outer side; what is inside it grows with the travel. */
import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import {
  GestureDetector,
  useExclusiveGestures,
  usePanGesture,
  useTapGesture,
} from "react-native-gesture-handler";
import Animated, {
  interpolate,
  interpolateColor,
  measure,
  useAnimatedRef,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import * as Haptics from "expo-haptics";
import type { Icon } from "phosphor-react-native";
import { clampTravel, OPEN, settleTravel } from "@/lib/swipe";
import { ground, ink, muted, press, settle, travel } from "./theme";

export interface Act {
  label: string;
  Icon: Icon;
  colour: string;
  run: () => void;
}

export interface Origin {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Props {
  title: string;
  stamp: string;
  preview: string;
  /** Uncovered on the right by a push to the left. */
  left: Act;
  /** Uncovered on the left by a push to the right. */
  right: Act;
  onOpen: (origin: Origin) => void;
  /** Close every other row; one row open at a time, as on the web. */
  onClaim: () => void;
  /** Hand the list a way to close this row when another one opens. */
  register: (close: () => void) => () => void;
}

const INSET = 3;
const GIVE = 0.5;

const tick = () => void Haptics.selectionAsync();

export function SwipeRow({ title, stamp, preview, left, right, onOpen, onClaim, register }: Props) {
  const { width } = useWindowDimensions();
  const row = useAnimatedRef<Animated.View>();
  const x = useSharedValue(0);
  const start = useSharedValue(0);
  const opened = useSharedValue(false);
  const pressed = useSharedValue(0);

  useEffect(() => register(() => (x.value = withTiming(0, settle))), [register, x]);

  const pan = usePanGesture({
    activeOffsetX: [-12, 12],
    failOffsetY: [-10, 10],
    onActivate: () => {
      start.value = x.value;
      /* The tap that lost to the push does not always say so. */
      pressed.value = withTiming(0, press);
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

  const tap = useTapGesture({
    maxDeltaX: 10,
    maxDeltaY: 10,
    onBegin: () => {
      pressed.value = withTiming(1, press);
    },
    onFinalize: () => {
      pressed.value = withTiming(0, press);
    },
    onActivate: () => {
      /* A tap on an open row closes it rather than opening the note under it. */
      if (x.value !== 0) {
        x.value = withTiming(0, settle);
        return;
      }
      const box = measure(row);
      if (box)
        scheduleOnRN(onOpen, { x: box.pageX, y: box.pageY, width: box.width, height: box.height });
    },
  });

  const gesture = useExclusiveGestures(pan, tap);

  const face = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
    backgroundColor: interpolateColor(pressed.value, [0, 1], [ground, `${ink}14`]),
  }));

  /* The row leaves the way it was pushed, the panel filling the row behind
     it, and only then does the act run and the list close over the gap. */
  const act = (side: "left" | "right") => {
    const chosen = side === "left" ? left : right;
    void Haptics.impactAsync(
      side === "left" ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Medium,
    );
    x.value = withTiming(side === "left" ? -width : width, travel, (done) => {
      if (done) scheduleOnRN(chosen.run);
    });
  };

  return (
    <View>
      <Panel edge="left" act={right} x={x} onPress={() => act("right")} />
      <Panel edge="right" act={left} x={x} onPress={() => act("left")} />
      <GestureDetector gesture={gesture}>
        <Animated.View ref={row} style={[styles.row, face]}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.preview} numberOfLines={1}>
            <Text style={styles.stamp}>{stamp} </Text>
            {preview}
          </Text>
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
  x: { value: number };
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
      <Pressable style={styles.panelPress} onPress={onPress} accessibilityLabel={act.label}>
        <Animated.View style={[styles.mark, mark]}>
          <act.Icon size={22} color="#ffffff" weight="bold" />
          <Text style={styles.markLabel}>{act.label}</Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: 20, paddingVertical: 12, gap: 3 },
  title: { color: ink, fontSize: 17, fontWeight: "600" },
  preview: { color: muted, fontSize: 15 },
  stamp: { color: ink },
  panel: { position: "absolute", top: INSET, bottom: INSET, overflow: "hidden" },
  panelLeftEdge: { left: INSET, borderTopLeftRadius: 12, borderBottomLeftRadius: 12 },
  panelRightEdge: { right: INSET, borderTopRightRadius: 12, borderBottomRightRadius: 12 },
  panelPress: { flex: 1, alignItems: "center", justifyContent: "center" },
  mark: { alignItems: "center", gap: 2, minWidth: OPEN - INSET * 2 },
  markLabel: { color: "#ffffff", fontSize: 12, fontWeight: "600" },
});
