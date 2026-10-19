/* The bar that rides on the keyboard while a note is being written. Ours,
 * not Notes': a small fluid pill standing on the keyboard's top edge at the
 * right — the three tools reached for most, and ⊕ — so it never covers the
 * line being written at the left. ⊕ stretches it leftward into every tool,
 * like a drop drawn out: its leading edge goes on a quick critically damped
 * spring and the body follows on a slower one, the pill thinning while the
 * two are apart and filling out as they meet, and each tool arriving a beat
 * after the edge has passed it. Nothing overshoots. Aa and its rows swap
 * inside the pill, the width following what they need. Nothing floats over
 * the words; the selection itself keeps the system's edit menu.
 *
 * It stands on the keyboard's own top edge, read from the system's keyboard
 * frame and eased on the keyboard's own duration — not measured against the
 * screen's bottom, which a native stack does not promise is the window's.
 * What it shows as pressed is what the page reports the selection is set in:
 * an accent dot under the glyph. */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { GlassView } from "expo-glass-effect";
import type { SFSymbol } from "expo-symbols";
import type { HostedCommand, HostedFormat } from "@/lib/hostedCommands";
import type { TextColor } from "@/features/editor/lib/content";
import { DURATION } from "@/lib/motionTokens";
import { usePalette } from "./archive";
import { glassy } from "./Chrome";
import { CARD_RADIUS, Press } from "./Grouped";
import { SymbolView } from "./icons";
import { glide } from "./theme";

const BAR_HEIGHT = 52;
const KEY = 44;
/** The pill's padding, and the room the separator and ⊕ take at its right. */
const PAD = 4;
const END = 9 + KEY + PAD;
/** The two edges, as WhoseSwitch's: the leading one quicker. */
const lead = { dampingRatio: 1, duration: 320 } as const;
const trail = { dampingRatio: 1, duration: 520 } as const;

type Row = "rest" | "tools" | "format" | "styles" | "lists" | "inks";

/* The editor's tints, as styles.css draws them on each ground. */
const INKS: Record<TextColor, [dark: string, light: string]> = {
  yellow: ["#e8c46a", "#9c7a00"],
  purple: ["#c69cf0", "#6741d9"],
  pink: ["#f095b7", "#c2255c"],
  orange: ["#efa86f", "#d9480f"],
  mint: ["#79ddb2", "#2b8a3e"],
  blue: ["#8fb6f5", "#1c64c6"],
};

/** What a key needs to know to arrive after the edge: the body's width, and
 *  how wide the row of keys it stands in is. */
const Reveal = createContext<{ body: SharedValue<number>; span: SharedValue<number> } | null>(null);

export function WritingBar({
  format,
  run,
  onLink,
  onAttach,
  onComment,
  frameTop,
}: {
  format: HostedFormat;
  run: (command: HostedCommand) => void;
  onLink: () => void;
  onAttach: (image: boolean) => void;
  onComment: () => void;
  /** Where the screen's own top edge stands in the window. */
  frameTop: number;
}) {
  const palette = usePalette();
  const reduce = useReducedMotion();
  const { width: screen } = useWindowDimensions();
  /* The keyboard's top edge in the window; Infinity while it is away. */
  const edge = useSharedValue(Number.POSITIVE_INFINITY);
  useEffect(() => {
    const ios = Platform.OS === "ios";
    const move = (event: { endCoordinates: { screenY: number }; duration?: number }) => {
      const to = event.endCoordinates.screenY;
      edge.value = Number.isFinite(edge.value)
        ? withTiming(to, { duration: event.duration || 250, easing: Easing.out(Easing.cubic) })
        : to;
    };
    const subscriptions = [
      Keyboard.addListener(ios ? "keyboardWillChangeFrame" : "keyboardDidShow", move),
      Keyboard.addListener(ios ? "keyboardWillHide" : "keyboardDidHide", () => {
        edge.value = Number.POSITIVE_INFINITY;
        setRow("rest");
      }),
    ];
    return () => subscriptions.forEach((subscription) => subscription.remove());
  }, [edge]);
  const [row, setRow] = useState<Row>("rest");
  const open = row !== "rest";
  /* Choosing words is asking how they should look. */
  useEffect(() => {
    if (format.selection)
      setRow((current) => (current === "rest" || current === "tools" ? "format" : current));
  }, [format.selection]);
  const ride = useAnimatedStyle(() =>
    Number.isFinite(edge.value)
      ? { top: edge.value - frameTop - BAR_HEIGHT - 8 }
      : /* Parked below the screen rather than faded: a glass view that has
           been at opacity 0 comes back without its material. */
        { top: 4000 },
  );

  /* The width the row asks for: its keys, then the separator and ⊕, never
     wider than the screen allows — past that the keys scroll. */
  const [keysWidth, setKeysWidth] = useState(0);
  const widest = screen - 20;
  const target = keysWidth ? Math.min(keysWidth + END + PAD, widest) : 0;
  const front = useSharedValue(0);
  const body = useSharedValue(0);
  const span = useSharedValue(0);
  const turn = useSharedValue(0);
  useEffect(() => {
    if (!target) return;
    span.value = target - END - PAD;
    if (reduce || !front.value) {
      front.value = target;
      body.value = target;
      return;
    }
    front.value = withSpring(target, lead);
    body.value = withSpring(target, trail);
  }, [target, reduce, front, body, span]);
  useEffect(() => {
    turn.value = reduce ? (open ? 1 : 0) : withSpring(open ? 1 : 0, glide);
  }, [open, reduce, turn]);

  /* Drawn from the leading edge; while the body lags behind it the pill is
     drawn out thin, and it fills out again as the two meet. */
  const pill = useAnimatedStyle(() => {
    const apart = Math.min(1, Math.abs(front.value - body.value) / 140);
    const height = BAR_HEIGHT - 8 * apart;
    return {
      width: front.value,
      height,
      borderRadius: Math.min(CARD_RADIUS + 2, height / 2),
      transform: [{ translateY: (BAR_HEIGHT - height) / 2 }],
    };
  });
  const corner = useAnimatedStyle(() => {
    const apart = Math.min(1, Math.abs(front.value - body.value) / 140);
    return { borderRadius: Math.min(CARD_RADIUS + 2, (BAR_HEIGHT - 8 * apart) / 2) };
  });
  const plus = useAnimatedStyle(() => ({ transform: [{ rotate: `${45 * turn.value}deg` }] }));

  const act = (mark: HostedFormat["marks"][number]) => format.marks.includes(mark);
  const style = (action: HostedCommand & { type: "format" }) => () => run(action);
  const back = <Key icon="chevron.backward" label="Back" onPress={() => setRow("format")} />;
  const markup = (
    <Key
      icon="pencil.tip.crop.circle"
      label="Markup"
      onPress={() => run({ type: "format", action: "drawing-page" })}
    />
  );
  const checklist = (
    <Key
      icon="checklist"
      label="Checklist"
      on={format.list === "checklist"}
      onPress={() => run({ type: "format", action: "checklist" })}
    />
  );
  const formatting = <Key icon="textformat" label="Format" onPress={() => setRow("format")} />;

  let keys: ReactNode;
  if (row === "rest")
    keys = (
      <>
        {formatting}
        {checklist}
        {markup}
      </>
    );
  else if (row === "tools")
    keys = (
      <>
        {formatting}
        {checklist}
        <Key
          icon="tablecells"
          label="Table"
          onPress={() => run({ type: "format", action: "table-3" })}
        />
        <Key icon="photo" label="Insert Image" onPress={() => onAttach(true)} />
        <Key icon="paperclip" label="Attach File" onPress={() => onAttach(false)} />
        {markup}
        <Key icon="text.bubble" label="Comment" onPress={onComment} />
      </>
    );
  else if (row === "format")
    keys = (
      <>
        <Key icon="textformat.size" label="Text Style" onPress={() => setRow("styles")} />
        <Key
          icon="bold"
          label="Bold"
          on={act("bold")}
          onPress={() => run({ type: "format", action: "bold" })}
        />
        <Key
          icon="italic"
          label="Italic"
          on={act("italic")}
          onPress={() => run({ type: "format", action: "italic" })}
        />
        <Key
          icon="underline"
          label="Underline"
          on={act("underline")}
          onPress={() => run({ type: "edit", action: "underline" })}
        />
        <Key
          icon="strikethrough"
          label="Strikethrough"
          on={act("strike")}
          onPress={() => run({ type: "format", action: "strike" })}
        />
        <Key icon="highlighter" label="Text Colour" onPress={() => setRow("inks")} />
        <Key icon="link" label="Link" on={act("link")} onPress={onLink} />
        <Key
          icon="list.bullet"
          label="Lists"
          on={format.list !== null}
          onPress={() => setRow("lists")}
        />
      </>
    );
  else if (row === "styles")
    keys = (
      <>
        {back}
        {(
          [
            ["heading-1", "Title", 20, "700"],
            ["heading-2", "Heading", 17, "700"],
            ["heading-3", "Subheading", 15, "600"],
            ["body", "Body", 15, "400"],
            ["quote", "Quote", 15, "400"],
          ] as const
        ).map(([action, label, size, weight]) => (
          <Word
            key={action}
            label={label}
            on={format.block === action}
            size={size}
            weight={weight}
            onPress={style({ type: "format", action })}
          />
        ))}
        <Word
          label="Mono"
          mono
          on={act("code")}
          onPress={style({ type: "format", action: "code" })}
        />
      </>
    );
  else if (row === "lists")
    keys = (
      <>
        {back}
        <Key
          icon="list.bullet"
          label="Bulleted List"
          on={format.list === "bullet-list"}
          onPress={() => run({ type: "format", action: "bullet-list" })}
        />
        <Key
          icon="list.number"
          label="Numbered List"
          on={format.list === "ordered-list"}
          onPress={() => run({ type: "format", action: "ordered-list" })}
        />
        <Key
          icon="checklist"
          label="Checklist"
          on={format.list === "checklist"}
          onPress={() => run({ type: "format", action: "checklist" })}
        />
        <Key
          icon="decrease.indent"
          label="Outdent"
          disabled={!format.list}
          onPress={() => run({ type: "edit", action: "outdent" })}
        />
        <Key
          icon="increase.indent"
          label="Indent"
          disabled={!format.list}
          onPress={() => run({ type: "edit", action: "indent" })}
        />
      </>
    );
  else
    keys = (
      <>
        {back}
        {(Object.keys(INKS) as TextColor[]).map((ink) => (
          <Arrival key={ink}>
            <Press
              feedback="scale"
              accessibilityRole="button"
              accessibilityLabel={`${ink} text`}
              onPress={() => run({ type: "format", action: `color-${ink}` })}
              style={styles.key}
            >
              <View style={[styles.ink, { backgroundColor: INKS[ink][palette.dark ? 0 : 1] }]} />
            </Press>
          </Arrival>
        ))}
        <Key
          icon="circle.slash"
          label="No Colour"
          onPress={() => run({ type: "format", action: "color-clear" })}
        />
      </>
    );

  return (
    <Animated.View pointerEvents="box-none" style={[styles.rail, ride]}>
      <Animated.View style={[styles.shadow, { shadowOpacity: palette.dark ? 0.45 : 0.16 }, pill]}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.clip, corner]}>
          {glassy ? (
            <GlassView
              glassEffectStyle="regular"
              colorScheme={palette.dark ? "dark" : "light"}
              style={StyleSheet.absoluteFill}
            />
          ) : (
            <View
              style={[
                StyleSheet.absoluteFill,
                {
                  backgroundColor: palette.paper,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: palette.rule,
                },
              ]}
            />
          )}
          {/* The row stands at its own width against the pill's right edge;
              the pill uncovers it as it draws out, and gathers over it. */}
          <View style={[styles.row, { width: target || undefined }]}>
            <Reveal.Provider value={{ body, span }}>
              <Keys key={row} reduce={reduce} onWidth={(width) => setKeysWidth(width)}>
                {keys}
              </Keys>
            </Reveal.Provider>
            <View style={[styles.separator, { backgroundColor: palette.rule }]} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={open ? "Close Tools" : "More Tools"}
              onPress={() => setRow(open ? "rest" : "tools")}
              style={styles.key}
            >
              <Animated.View style={[styles.plus, { backgroundColor: palette.ink }, plus]}>
                <SymbolView name="plus" size={17} weight="semibold" tintColor={palette.page} />
              </Animated.View>
            </Pressable>
          </View>
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

function Keys({
  children,
  reduce,
  onWidth,
}: {
  children: ReactNode;
  reduce: boolean;
  onWidth: (width: number) => void;
}) {
  /* A new row of keys comes in as a fade: under Reduce Motion it is the
     whole of the change; otherwise the keys' own arrival does the work. */
  const shown = useSharedValue(0);
  useEffect(() => {
    shown.value = withTiming(1, { duration: reduce ? DURATION.base : DURATION.fast });
  }, [reduce, shown]);
  const fade = useAnimatedStyle(() => ({ opacity: shown.value }));
  return (
    <Animated.View style={[{ flex: 1 }, fade]}>
      <ScrollView
        horizontal
        style={{ height: BAR_HEIGHT }}
        keyboardShouldPersistTaps="always"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.keys}
        onContentSizeChange={(width) => onWidth(width)}
      >
        {children}
      </ScrollView>
    </Animated.View>
  );
}

/** A key arrives a beat after the pill's edge has passed it: faded and a
 *  little small until the body has drawn out over it. */
function Arrival({ children }: { children: ReactNode }) {
  const reveal = useContext(Reveal);
  const x = useSharedValue(-1);
  const body = reveal?.body;
  const span = reveal?.span;
  const arrive = useAnimatedStyle(() => {
    if (!body || !span || x.value < 0) return {};
    const reach = END + span.value - x.value;
    const shown = interpolate(body.value, [reach - 30, reach], [0, 1], "clamp");
    return { opacity: shown, transform: [{ scale: 0.82 + 0.18 * shown }] };
  });
  return (
    <Animated.View
      style={arrive}
      onLayout={(event) => {
        x.value = event.nativeEvent.layout.x;
      }}
    >
      {children}
    </Animated.View>
  );
}

/** What the selection is set in: a small accent dot under the glyph. */
function Dot({ on }: { on: boolean }) {
  const palette = usePalette();
  return on ? <View style={[styles.dot, { backgroundColor: palette.accent }]} /> : null;
}

function Key({
  icon,
  label,
  onPress,
  on = false,
  disabled = false,
}: {
  icon: SFSymbol;
  label: string;
  onPress: () => void;
  on?: boolean;
  disabled?: boolean;
}) {
  const palette = usePalette();
  return (
    <Arrival>
      <Press
        feedback="scale"
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: on, disabled }}
        disabled={disabled}
        onPress={onPress}
        style={[styles.key, disabled && { opacity: 0.35 }]}
      >
        <SymbolView
          name={icon}
          size={21}
          weight="medium"
          tintColor={on ? palette.accent : palette.ink}
        />
        <Dot on={on} />
      </Press>
    </Arrival>
  );
}

function Word({
  label,
  onPress,
  on,
  size = 15,
  weight = "400",
  mono = false,
}: {
  label: string;
  onPress: () => void;
  on: boolean;
  size?: number;
  weight?: "400" | "600" | "700";
  mono?: boolean;
}) {
  const palette = usePalette();
  return (
    <Arrival>
      <Press
        feedback="scale"
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: on }}
        onPress={onPress}
        style={styles.word}
      >
        <Text
          style={{
            color: on ? palette.accent : palette.ink,
            fontSize: size,
            fontWeight: weight,
            fontFamily: mono ? Platform.select({ ios: "Menlo", default: "monospace" }) : undefined,
          }}
        >
          {label}
        </Text>
        <Dot on={on} />
      </Press>
    </Arrival>
  );
}

const styles = StyleSheet.create({
  rail: { position: "absolute", left: 10, right: 10, height: BAR_HEIGHT, alignItems: "flex-end" },
  shadow: {
    shadowColor: "#000",
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  clip: { overflow: "hidden", borderCurve: "continuous" },
  row: {
    position: "absolute",
    top: 0,
    right: 0,
    height: BAR_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    paddingRight: PAD,
  },
  keys: { alignItems: "center", paddingLeft: PAD, height: BAR_HEIGHT },
  key: { width: KEY, height: KEY, alignItems: "center", justifyContent: "center" },
  word: { height: KEY, paddingHorizontal: 12, alignItems: "center", justifyContent: "center" },
  dot: { position: "absolute", bottom: 3, width: 4, height: 4, borderRadius: 2 },
  separator: { width: 1, height: 22, marginHorizontal: 4 },
  plus: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  ink: { width: 24, height: 24, borderRadius: 12 },
});
