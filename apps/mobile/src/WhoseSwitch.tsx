/* A notebook index on the page itself. Titles stay still and the selection
 * line glides as one piece. The toolbar owns the profile photo. */
import { useEffect, useRef, useState, type ComponentRef, type ReactNode } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from "react-native";
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { scheduleOnUI } from "react-native-worklets";
import { usePalette } from "./archive";
import type { Face } from "./Avatar";

export interface Whose {
  face: Face;
  email?: string;
  label: string;
  title: string;
}
type Measure = { x: number; width: number };
const turnMotion = { duration: 260, easing: Easing.bezier(0.25, 0.1, 0.25, 1) };

export function WhoseSwitch({
  options,
  selected,
  onChoose,
}: {
  options: Whose[];
  selected: string;
  onChoose: (userId: string) => void;
}) {
  const palette = usePalette();
  const reduce = useReducedMotion();
  const { width } = useWindowDimensions();
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const [measures, setMeasures] = useState<Record<string, Measure>>({});
  const current = options.find((who) => who.face.userId === selected) ?? options[0];
  const target = current ? measures[current.face.userId] : undefined;
  const placed = useRef(false);
  const left = useSharedValue(0);
  const right = useSharedValue(0);

  useEffect(() => {
    if (!target) return;
    const instant = !placed.current || reduce;
    placed.current = true;
    scheduleOnUI(
      (x: number, end: number, still: boolean) => {
        "worklet";
        if (still) {
          left.value = x;
          right.value = end;
          return;
        }
        left.value = withTiming(x, turnMotion);
        right.value = withTiming(end, turnMotion);
      },
      target.x,
      target.x + target.width,
      instant,
    );
    scroll.current?.scrollTo({ x: Math.max(0, target.x - 16), animated: !reduce });
  }, [target, reduce, left, right]);

  const ink = useAnimatedStyle(() => ({
    left: left.value,
    width: Math.max(0, right.value - left.value),
  }));
  const measure = (userId: string, next: Measure) =>
    setMeasures((before) =>
      before[userId]?.x === next.x && before[userId]?.width === next.width
        ? before
        : { ...before, [userId]: next },
    );
  if (!current) return null;
  return (
    <ScrollView
      ref={scroll}
      horizontal
      showsHorizontalScrollIndicator={false}
      bounces={false}
      contentContainerStyle={{ paddingRight: 2 }}
    >
      <View accessibilityRole="tablist" accessibilityLabel="Whose notes" style={styles.tabs}>
        {options.map((who) => (
          <NotebookTitle
            key={who.face.userId}
            title={who.title}
            active={who.face.userId === current.face.userId}
            maxWidth={width - 48}
            onMeasure={(next) => measure(who.face.userId, next)}
            onPress={() => {
              if (who.face.userId === current.face.userId) return;
              void Haptics.selectionAsync().catch(() => {});
              onChoose(who.face.userId);
            }}
          />
        ))}
        <Animated.View
          pointerEvents="none"
          style={[styles.ink, { backgroundColor: palette.accent, opacity: target ? 1 : 0 }, ink]}
        />
      </View>
    </ScrollView>
  );
}

function NotebookTitle({
  title,
  active,
  maxWidth,
  onMeasure,
  onPress,
}: {
  title: string;
  active: boolean;
  maxWidth: number;
  onMeasure: (measure: Measure) => void;
  onPress: () => void;
}) {
  const palette = usePalette();
  const reduce = useReducedMotion();
  const weight = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    weight.value = reduce
      ? active
        ? 1
        : 0
      : withTiming(active ? 1 : 0, { ...turnMotion, duration: 180 });
  }, [active, reduce, weight]);
  const ink = useAnimatedStyle(() => ({
    color: interpolateColor(weight.value, [0, 1], [palette.ink3, palette.ink]),
  }));
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={title}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      onLayout={({ nativeEvent: { layout } }) => onMeasure({ x: layout.x, width: layout.width })}
      style={({ pressed }) => [styles.title, { maxWidth, opacity: pressed ? 0.72 : 1 }]}
    >
      <Animated.Text numberOfLines={1} style={[styles.words, ink]}>
        {title}
      </Animated.Text>
    </Pressable>
  );
}

/** Both notebooks stay in place; a restrained dissolve changes whose
 * notes are visible. Rapid reversals resume from the current opacity. */
export function NotebookPage({
  active,
  onLayout,
  children,
}: {
  active: boolean;
  onLayout: (event: LayoutChangeEvent) => void;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();
  const first = useRef(true);
  const presence = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    scheduleOnUI(
      (chosen: boolean, still: boolean) => {
        "worklet";
        presence.value = still ? (chosen ? 1 : 0) : withTiming(chosen ? 1 : 0, turnMotion);
      },
      active,
      reduce,
    );
  }, [active, reduce, presence]);
  const turning = useAnimatedStyle(() => ({ opacity: presence.value }));
  return (
    <Animated.View
      collapsable={false}
      pointerEvents={active ? "auto" : "none"}
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? "auto" : "no-hide-descendants"}
      onLayout={onLayout}
      style={[{ position: "absolute", top: 0, left: 0, right: 0, zIndex: active ? 1 : 0 }, turning]}
    >
      {children}
    </Animated.View>
  );
}

/** A shorter notebook doesn't snap the rest of the scroll view upward. */
export function NotebookPages({ height, children }: { height: number; children: ReactNode }) {
  const reduce = useReducedMotion();
  const room = useSharedValue(height);
  const measured = useRef(height > 0);
  useEffect(() => {
    if (reduce || !measured.current) {
      room.value = height;
      if (height > 0) measured.current = true;
    } else room.value = withTiming(height, turnMotion);
  }, [height, reduce, room]);
  const size = useAnimatedStyle(() => ({ height: room.value }));
  return <Animated.View style={[{ overflow: "hidden" }, size]}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  tabs: { flexDirection: "row", alignItems: "center", gap: 28, paddingBottom: 9 },
  title: { minHeight: 44, justifyContent: "center" },
  words: { fontSize: 22, fontWeight: "600", letterSpacing: -0.5 },
  ink: { position: "absolute", bottom: 1, height: 2, borderRadius: 1 },
});
