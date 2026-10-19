/* The ground of the sign-in page: a wall of the app's own material — notes,
 * a list, a sketch, a remark — in columns drifting slowly upward, each at its
 * own pace, the far ones smaller and dimmer, the whole wall tilted like a
 * product shot and darkened under the form by a scrim over our own content.
 *
 * Cheap on purpose: a fixed handful of cards per column, drawn twice so the
 * column can loop, and one clock on the UI thread that every column reads.
 * Nothing re-renders while it moves. Under Reduce Motion it stands still. */
import { useEffect } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { EASE } from "@/lib/motionTokens";
import { CARD_RADIUS } from "./Grouped";
import { SymbolView } from "./icons";

export interface WallInk {
  ground: string;
  card: string;
  ink: string;
  quiet: string;
  edge: string;
}

type Note =
  | { kind: "text"; title: string; lines: number[] }
  | { kind: "list"; title: string; items: [string, boolean][] }
  | { kind: "sketch"; title: string; shape: "circle" | "arrow" | "star" }
  | { kind: "remark"; face: string; hue: string; words: string }
  | { kind: "pinned"; title: string; lines: number[] };

/* Each column: how near it is (scale, opacity), how fast it rises in points
   a second, where in its loop it starts, and its notes. */
const COLUMNS: { scale: number; opacity: number; speed: number; phase: number; notes: Note[] }[] = [
  {
    scale: 0.8,
    opacity: 0.42,
    speed: 9,
    phase: 0.3,
    notes: [
      { kind: "text", title: "Ideas for the trip", lines: [0.9, 0.75, 0.5] },
      {
        kind: "list",
        title: "Groceries",
        items: [
          ["Lemons", true],
          ["Bread", true],
          ["Basil", false],
        ],
      },
      { kind: "remark", face: "M", hue: "#e7a35c", words: "Love this line." },
      { kind: "sketch", title: "Layout", shape: "circle" },
      { kind: "pinned", title: "Chapter 3", lines: [0.85, 0.6] },
    ],
  },
  {
    scale: 1,
    opacity: 0.85,
    speed: 15,
    phase: 0.65,
    notes: [
      { kind: "pinned", title: "Reading list", lines: [0.8, 0.9, 0.55] },
      { kind: "sketch", title: "Garden plan", shape: "arrow" },
      {
        kind: "list",
        title: "Before Friday",
        items: [
          ["Call the printer", true],
          ["Proofs", false],
        ],
      },
      { kind: "text", title: "Morning pages", lines: [0.95, 0.8, 0.88, 0.4] },
      { kind: "remark", face: "L", hue: "#7fb2e6", words: "Can we move this up?" },
    ],
  },
  {
    scale: 0.88,
    opacity: 0.58,
    speed: 11,
    phase: 0.1,
    notes: [
      { kind: "remark", face: "A", hue: "#9fd18a", words: "Yes — after lunch." },
      { kind: "text", title: "Chapter 3", lines: [0.9, 0.7, 0.82] },
      { kind: "sketch", title: "Logo", shape: "star" },
      {
        kind: "list",
        title: "Packing",
        items: [
          ["Charger", true],
          ["Passport", true],
          ["Notebook", false],
        ],
      },
      { kind: "text", title: "Recipes", lines: [0.75, 0.5] },
    ],
  },
  {
    scale: 1.1,
    opacity: 0.95,
    speed: 19,
    phase: 0.5,
    notes: [
      { kind: "sketch", title: "Kitchen", shape: "circle" },
      { kind: "text", title: "Notes from Tuesday", lines: [0.9, 0.65, 0.8] },
      { kind: "remark", face: "J", hue: "#d98fc4", words: "Added the photos." },
      { kind: "pinned", title: "Ideas for the trip", lines: [0.7, 0.85] },
      {
        kind: "list",
        title: "Reading list",
        items: [
          ["Calvino", true],
          ["Ginzburg", false],
        ],
      },
    ],
  },
];

const WIDTH = 150;
const GAP = 14;
/** A clock that never needs to wrap: seconds, for longer than anyone stays. */
const FOREVER = 1_000_000;

function Bars({ lines, ink }: { lines: number[]; ink: WallInk }) {
  return (
    <View style={{ gap: 6, marginTop: 10 }}>
      {lines.map((width, index) => (
        <View
          key={index}
          style={{
            height: 5,
            borderRadius: 3,
            width: `${width * 100}%`,
            backgroundColor: ink.quiet,
          }}
        />
      ))}
    </View>
  );
}

/** A sketch in two or three strokes, drawn in ink as a hand would. */
function Sketch({ shape, colour }: { shape: "circle" | "arrow" | "star"; colour: string }) {
  const stroke = {
    position: "absolute",
    backgroundColor: colour,
    height: 2,
    borderRadius: 1,
  } as const;
  if (shape === "circle")
    return (
      <View style={styles.sketch}>
        <View
          style={{
            width: 64,
            height: 44,
            borderRadius: 32,
            borderWidth: 2,
            borderColor: colour,
            transform: [{ rotate: "-12deg" }],
          }}
        />
        <View
          style={[stroke, { width: 54, bottom: 4, left: 30, transform: [{ rotate: "4deg" }] }]}
        />
      </View>
    );
  if (shape === "arrow")
    return (
      <View style={styles.sketch}>
        <View
          style={[stroke, { width: 76, top: 30, left: 20, transform: [{ rotate: "-18deg" }] }]}
        />
        <View
          style={[stroke, { width: 18, top: 16, left: 82, transform: [{ rotate: "22deg" }] }]}
        />
        <View
          style={[stroke, { width: 18, top: 26, left: 86, transform: [{ rotate: "-68deg" }] }]}
        />
      </View>
    );
  return (
    <View style={styles.sketch}>
      {[0, 72, 144, 216, 288].map((turn) => (
        <View
          key={turn}
          style={[
            stroke,
            { width: 46, top: 28, left: 34, transform: [{ rotate: `${turn + 18}deg` }] },
          ]}
        />
      ))}
    </View>
  );
}

/* A few inks, as notes really carry them: a highlighter, a blue pen, a
   pinned card on coloured paper. Muted, so the wall stays a ground. */
const HUES = ["#e6c35c", "#7fb2e6", "#e78f6a", "#9fd18a", "#c49be6"];

function Card({ note, ink, hue }: { note: Note; ink: WallInk; hue: string }) {
  const title = (words: string) => (
    <Text numberOfLines={1} style={[styles.title, { color: ink.ink }]}>
      {words}
    </Text>
  );
  return (
    <View style={[styles.card, { backgroundColor: ink.card, borderColor: ink.edge }]}>
      {note.kind === "pinned" ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: `${hue}2e` }]} />
      ) : null}
      {note.kind === "text" ? (
        <>
          {title(note.title)}
          <Bars lines={note.lines} ink={ink} />
        </>
      ) : note.kind === "pinned" ? (
        <>
          <View style={styles.pinRow}>
            <SymbolView name="pin.fill" size={11} tintColor={hue} />
            {title(note.title)}
          </View>
          <Bars lines={note.lines} ink={ink} />
        </>
      ) : note.kind === "list" ? (
        <>
          {title(note.title)}
          <View style={{ gap: 7, marginTop: 10 }}>
            {note.items.map(([words, done]) => (
              <View key={words} style={styles.item}>
                <View
                  style={[
                    styles.tick,
                    { borderColor: hue, backgroundColor: done ? hue : "transparent" },
                  ]}
                >
                  {done ? <SymbolView name="checkmark" size={8} tintColor={ink.card} /> : null}
                </View>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.itemText,
                    { color: ink.ink, opacity: done ? 0.55 : 1 },
                    done ? { textDecorationLine: "line-through" } : null,
                  ]}
                >
                  {words}
                </Text>
              </View>
            ))}
          </View>
        </>
      ) : note.kind === "sketch" ? (
        <>
          {title(note.title)}
          <Sketch shape={note.shape} colour={hue} />
        </>
      ) : (
        <View style={styles.item}>
          <View style={[styles.face, { backgroundColor: `${note.hue}33` }]}>
            <Text style={[styles.faceText, { color: note.hue }]}>{note.face}</Text>
          </View>
          <Text numberOfLines={2} style={[styles.itemText, { color: ink.ink, flex: 1 }]}>
            {note.words}
          </Text>
        </View>
      )}
    </View>
  );
}

function Column({
  column,
  clock,
  ink,
}: {
  column: (typeof COLUMNS)[number];
  clock: SharedValue<number>;
  ink: WallInk;
}) {
  /* The height of one set of notes: where the loop closes. */
  const loop = useSharedValue(0);
  const rise = useAnimatedStyle(() => {
    if (!loop.value) return {};
    const travelled = (clock.value * column.speed + column.phase * loop.value) % loop.value;
    return { transform: [{ translateY: -travelled }] };
  });
  const set = (copy: number) => (
    <View
      style={{ gap: GAP, paddingBottom: GAP }}
      onLayout={
        copy === 0
          ? (event) => {
              loop.value = event.nativeEvent.layout.height;
            }
          : undefined
      }
    >
      {column.notes.map((note, index) => (
        <Card
          key={index}
          note={note}
          ink={ink}
          hue={HUES[(index + Math.round(column.speed)) % HUES.length]!}
        />
      ))}
    </View>
  );
  return (
    <View
      style={{
        width: WIDTH,
        opacity: column.opacity,
        transform: [{ scale: column.scale }],
      }}
    >
      <Animated.View style={rise}>
        {set(0)}
        {set(1)}
        {set(2)}
        {set(3)}
      </Animated.View>
    </View>
  );
}

export function NoteWall({ ink }: { ink: WallInk }) {
  const reduce = useReducedMotion();
  const { width, height } = useWindowDimensions();
  const clock = useSharedValue(0);
  const enter = useSharedValue(0);
  useEffect(() => {
    enter.value = withTiming(1, {
      duration: 1100,
      easing: Easing.bezier(EASE.out[0], EASE.out[1], EASE.out[2], EASE.out[3]),
    });
    if (!reduce)
      clock.value = withTiming(FOREVER, { duration: FOREVER * 1000, easing: Easing.linear });
  }, [clock, enter, reduce]);
  const settle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ scale: reduce ? 1 : 1.06 - 0.06 * enter.value }],
  }));
  /* Wider and taller than the screen, so the tilt never shows an edge. */
  const span = Math.max(width, height) * 1.25;
  return (
    <View
      style={[StyleSheet.absoluteFill, { backgroundColor: ink.ground, overflow: "hidden" }]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View style={[StyleSheet.absoluteFill, settle]}>
        <View
          style={{
            position: "absolute",
            width: span,
            height: span,
            left: (width - span) / 2,
            top: (height - span) / 2,
            flexDirection: "row",
            justifyContent: "center",
            gap: GAP,
            overflow: "hidden",
            transform: [{ rotate: "-8deg" }],
          }}
        >
          {[...COLUMNS, ...COLUMNS.slice(0, 2)].map((column, index) => (
            <Column key={index} column={column} clock={clock} ink={ink} />
          ))}
        </View>
      </Animated.View>
      {/* A scrim over our own wall, not a wash: a little dark under the
          wordmark, clear through the middle, dark where the form stands. */}
      <View style={[StyleSheet.absoluteFill, styles.scrim]} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: CARD_RADIUS - 6,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
  },
  title: { fontSize: 13, fontWeight: "600", letterSpacing: -0.2, flexShrink: 1 },
  pinRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  item: { flexDirection: "row", alignItems: "center", gap: 8 },
  tick: {
    width: 12,
    height: 12,
    borderRadius: 4,
    borderWidth: 1.25,
    alignItems: "center",
    justifyContent: "center",
  },
  itemText: { fontSize: 11.5, lineHeight: 15 },
  face: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  faceText: { fontSize: 11, fontWeight: "700" },
  sketch: { height: 64, marginTop: 6 },
  scrim: {
    backgroundImage:
      "linear-gradient(to bottom, rgba(0,0,0,0.66) 0%, rgba(0,0,0,0.22) 13%, rgba(0,0,0,0.2) 22%, rgba(0,0,0,0.8) 33%, rgba(0,0,0,0.92) 100%)",
  },
});
