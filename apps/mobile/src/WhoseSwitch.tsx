/* Whose notes the folders show: the face of the one showing, and the face of
 * the next one peeking out behind it — the second face is what says there is
 * somebody else to turn to. One press turns to them, and the two faces trade
 * places: the one behind comes forward and grows, the one in front steps back
 * and shrinks, passing on either side of each other so the swap reads as a
 * swap. Both stay mounted for it; remounting the front face only ever zoomed.
 * The trade is a spring with no overshoot: a face that sails past its seat
 * and comes back reads as the switch wobbling.
 * Not a double press, which nobody finds and which makes every single press
 * wait to learn it was not one. With more than two members the press goes
 * round them in order.
 * ponytail: with three or more the pair is re-chosen on each press and
 * jumps rather than slides; animate a ring of faces if archives grow. */
import { useEffect } from "react";
import { Pressable } from "react-native";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { usePalette } from "./archive";
import { Avatar, type Face } from "./Avatar";
import { glide } from "./theme";

export interface Whose {
  face: Face;
  email?: string;
  title: string;
}

const SIZE = 32;
/* Where the face behind sits, relative to the one in front, and how small. */
/* Up and to the right, so the front face keeps its presence dot clear. */
const BEHIND = { x: 24, y: -7, scale: 0.66 };

function Seat({ who, front, seat }: { who: Whose; front: SharedValue<number>; seat: 0 | 1 }) {
  const palette = usePalette();
  /* `t` is 0 in front and 1 behind; on the way between, the two faces bow
     apart, one up and one down, rather than sliding through each other. */
  const side = seat === 0 ? -1 : 1;
  const style = useAnimatedStyle(() => {
    const t = seat === 0 ? front.value : 1 - front.value;
    const bow = Math.sin(Math.PI * Math.min(1, Math.max(0, t))) * 5 * side;
    return {
      zIndex: t < 0.5 ? 2 : 1,
      transform: [
        { translateX: BEHIND.x * t },
        { translateY: BEHIND.y * t + bow },
        { scale: interpolate(t, [0, 1], [1, BEHIND.scale]) },
      ],
    };
  });
  return (
    <Animated.View style={[{ position: "absolute", left: 0, top: 6 }, style]}>
      <Avatar face={who.face} email={who.email} size={SIZE} ring={palette.page} />
    </Animated.View>
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
  const at = Math.max(
    0,
    options.findIndex((option) => option.face.userId === selected),
  );
  const shown = options[at];
  const next = options.length > 1 ? options[(at + 1) % options.length] : undefined;
  /* Two members keep their seats in a fixed order, so the same two views
     trade places; `front` is which of them is forward. */
  const pair = options.length === 2 ? options : [shown, next];
  const forward = pair[1]?.face.userId === selected ? 1 : 0;
  const front = useSharedValue(forward);
  useEffect(() => {
    front.value = withSpring(forward, glide);
  }, [forward, front]);

  if (!shown) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={shown.title}
      accessibilityHint={next ? `Shows ${next.title}` : undefined}
      hitSlop={10}
      disabled={!next}
      onPress={() => {
        if (!next) return;
        void Haptics.selectionAsync().catch(() => {});
        onChoose(next.face.userId);
      }}
      style={({ pressed }) => ({
        width: next ? SIZE + BEHIND.x * 0.9 : SIZE,
        height: SIZE + 6,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      {pair[1] ? <Seat who={pair[1]} front={front} seat={1} /> : null}
      {pair[0] ? <Seat who={pair[0]} front={front} seat={0} /> : null}
    </Pressable>
  );
}
