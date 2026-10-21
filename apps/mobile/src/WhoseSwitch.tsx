/* Whose notes Home is showing, as a segmented capsule: one segment a member —
 * the face and the first name, "You" for the reader — and a thumb that slides
 * to the one chosen on a spring with no overshoot, the others dimmed in step
 * with it. Two or three members share the width of the content; more scroll
 * sideways at a fixed width each, the same capsule. (Jacopo, 18 October 2026:
 * two faces overlapping in a pill under the bar read as an accident.) */
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  type DerivedValue,
} from "react-native-reanimated";
import { scheduleOnUI } from "react-native-worklets";
import * as Haptics from "expo-haptics";
import { usePalette } from "./archive";
import { Avatar, type Face } from "./Avatar";
import { Card } from "./Grouped";
/* One short glide. Reading a shared value on the JS thread can block on the
   UI thread; the gesture's visual response stays on the UI thread instead. */
const glide = { dampingRatio: 1, duration: 220 } as const;

export interface Whose {
  face: Face;
  email?: string;
  /** "You", or the member's first name. */
  label: string;
  /** What the page shows when this one is chosen: "Your Notes". */
  title: string;
}

const PAD = 4;
const HEIGHT = 40;
/** A segment's width once the members no longer fit side by side. */
const WIDE = 132;

function Segment({
  who,
  at,
  place,
  width,
  selected,
  onPress,
}: {
  who: Whose;
  at: number;
  place: DerivedValue<number>;
  width: number;
  selected: boolean;
  onPress: () => void;
}) {
  const palette = usePalette();
  /* How much of the thumb is over this segment, 0 to 1: the face brightens
     and the label's ink crosses from quiet to full as the plate arrives. */
  const nearness = useDerivedValue(() => Math.max(0, 1 - Math.min(1, Math.abs(place.value - at))));
  const dim = useAnimatedStyle(() => ({ opacity: 0.55 + 0.45 * nearness.value }));
  const ink = useAnimatedStyle(() => ({
    color: interpolateColor(nearness.value, [0, 1], [palette.ink3, palette.ink]),
  }));
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={who.title}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{ width, height: HEIGHT }}
    >
      <Animated.View
        style={[
          { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
          dim,
        ]}
      >
        <Avatar face={who.face} email={who.email} size={26} />
        <Animated.Text
          numberOfLines={1}
          style={[{ fontSize: 15, fontWeight: "600", flexShrink: 1 }, ink]}
        >
          {who.label}
        </Animated.Text>
      </Animated.View>
    </Pressable>
  );
}

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
  const [width, setWidth] = useState(0);
  const fits = options.length <= 3;
  const segment = fits ? (width - PAD * 2) / Math.max(1, options.length) : WIDE;
  const at = Math.max(
    0,
    options.findIndex((option) => option.face.userId === selected),
  );
  /* Where the thumb stands, in segments: set without motion on the first
     frame and sprung to after, so the page opening does not slide it in. */
  const left = useSharedValue(at);
  const right = useSharedValue(at + 1);
  const target = useSharedValue(at);
  /* Sent from the press itself, before the page under it renders the new
     member's notes: the plate leaves under the finger, not a render later. */
  const slide = useCallback(
    (to: number) => {
      scheduleOnUI((next: number) => {
        "worklet";
        // The press and the selected prop can announce the same target.
        // Do not restart a spring that is already going there.
        if (target.value === next) return;
        target.value = next;
        right.value = withSpring(next + 1, glide);
        left.value = withSpring(next, glide);
      }, to);
    },
    [left, right, target],
  );
  useEffect(() => slide(at), [at, slide]);
  /* The plate's centre, in segments: what the labels read. */
  const place = useDerivedValue(() => (left.value + right.value - 1) / 2);
  const thumb = useAnimatedStyle(() => ({
    width: (right.value - left.value) * segment,
    transform: [{ translateX: left.value * segment }],
  }));

  const row = (
    <View style={{ flexDirection: "row" }}>
      {width ? (
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: "absolute",
              top: 0,
              left: 0,
              width: segment,
              height: HEIGHT,
              borderRadius: HEIGHT / 2,
              borderCurve: "continuous",
              backgroundColor: palette.dark ? "#ffffff2b" : "#ffffff",
              shadowColor: "#000",
              shadowOpacity: palette.dark ? 0 : 0.12,
              shadowRadius: 6,
              shadowOffset: { width: 0, height: 1 },
            },
            thumb,
          ]}
        />
      ) : null}
      {width
        ? options.map((who, index) => (
            <Segment
              key={who.face.userId}
              who={who}
              at={index}
              place={place}
              width={segment}
              selected={index === at}
              onPress={() => {
                if (index === at) return;
                slide(index);
                void Haptics.selectionAsync().catch(() => {});
                onChoose(who.face.userId);
              }}
            />
          ))
        : null}
    </View>
  );
  return (
    <View
      accessibilityRole="tablist"
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      <Card radius={HEIGHT / 2 + PAD} style={{ padding: PAD, minHeight: HEIGHT + PAD * 2 }}>
        {fits ? (
          row
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {row}
          </ScrollView>
        )}
      </Card>
    </View>
  );
}
