/* The grouped cards Folders and Settings are made of: Revolut's card — glass
 * over the reader's picture, solid on the near-black ground, a continuous
 * corner, its small grey heading inside it — and rows that lead with a tile,
 * a name and a count, with no rule between them. One shape language throughout: a thing (a
 * folder, a setting, the bin) sits on a rounded square, a person on a circle,
 * so a face is never mistaken for a place. A row lights under the finger at
 * once and lets go on a spring, on the UI thread. */
import type { ReactNode } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import type { SFSymbol } from "expo-symbols";
import { SymbolView } from "./icons";
import { usePalette, type Palette } from "./archive";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { useCard } from "./Backdrop";
import { release, trashGround } from "./theme";

/** Every card's corner, drawn continuous. */
export const CARD_RADIUS = 24;

const glassy = Platform.OS === "ios" && isLiquidGlassAvailable();

/** A card: the system's glass over the reader's picture, the card colour
 *  everywhere else (and on a system without the glass). */
export function Card({
  children,
  style,
  radius = CARD_RADIUS,
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  radius?: number;
}) {
  const palette = usePalette();
  const { card, wallpaper } = useCard();
  const shape = { borderRadius: radius, borderCurve: "continuous", overflow: "hidden" } as const;
  /* The picture fades into the ground a little way down the page, and the
     system's glass over that ground is the ground: a card there was text
     floating on nothing. So the glass carries the card's own colour as its
     tint — through it the picture still shows, on the bare ground it is the
     card — and a hairline edge, which is what the eye reads as an object. */
  if (wallpaper && glassy)
    return (
      <GlassView
        glassEffectStyle="regular"
        colorScheme={palette.dark ? "dark" : "light"}
        tintColor={tint(palette)}
        style={[
          shape,
          { borderWidth: StyleSheet.hairlineWidth, borderColor: edge(palette) },
          style,
        ]}
      >
        {children}
      </GlassView>
    );
  return <View style={[shape, { backgroundColor: card }, style]}>{children}</View>;
}

const tint = (palette: Palette) =>
  /^#[\da-f]{6}$/i.test(palette.paper) ? `${palette.paper}b3` : undefined;
const edge = (palette: Palette) => (palette.dark ? "#ffffff1f" : "#00000014");

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** A pressable that answers the finger on the UI thread: a row inside a card
 *  lights up (`highlight`); something standing on its own — a card, a swatch,
 *  a button — gives a little under it (`scale`). Never a bounce: the press
 *  goes in quickly and comes back on a spring with no overshoot.
 *  `Link asChild` hands it its press and its ref through `rest`. */
export function Press({
  feedback = "highlight",
  style,
  children,
  onPressIn,
  onPressOut,
  ...rest
}: Omit<PressableProps, "style" | "children"> & {
  feedback?: "highlight" | "scale";
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  const palette = usePalette();
  const down = useSharedValue(0);
  const give = useAnimatedStyle(() =>
    feedback === "scale" ? { transform: [{ scale: 1 - 0.04 * down.value }] } : {},
  );
  const glow = useAnimatedStyle(() => ({ opacity: down.value }));
  return (
    <AnimatedPressable
      {...rest}
      onPressIn={(event) => {
        down.value = withTiming(1, { duration: 90 });
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        down.value = withSpring(0, release);
        onPressOut?.(event);
      }}
      style={[style, give]}
    >
      {feedback === "highlight" ? (
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: quiet(palette) }, glow]}
        />
      ) : null}
      {children}
    </AnimatedPressable>
  );
}

export function Group({
  title,
  leading,
  children,
}: {
  title?: string;
  /** Drawn before the title: whose group this is. */
  leading?: ReactNode;
  children: ReactNode;
}) {
  const palette = usePalette();
  return (
    <Card style={styles.section}>
      {title ? (
        <View style={styles.header}>
          {leading}
          <Text style={[styles.heading, { color: palette.ink3 }]} numberOfLines={1}>
            {title}
          </Text>
        </View>
      ) : null}
      <View style={styles.group}>{children}</View>
    </Card>
  );
}

/** The ink at low strength: present on any ground, loud on none. */
export const quiet = (palette: Palette) => (palette.dark ? "#ffffff17" : "#0000000d");

export function Chip({
  icon,
  tint,
  fill,
  size = 38,
}: {
  icon?: SFSymbol;
  tint?: string;
  fill?: string;
  size?: number;
}) {
  const palette = usePalette();
  /* One system-symbol style throughout the app. Only destructive actions
     use red; folders keep the default ink on a quiet disc. */
  const colour =
    fill === trashGround || tint === palette.danger ? palette.danger : (tint ?? palette.ink);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.3),
        borderCurve: "continuous",
        backgroundColor: quiet(palette),
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {icon ? (
        <SymbolView name={icon} size={Math.round(size * 0.52)} weight="medium" tintColor={colour} />
      ) : null}
    </View>
  );
}

interface RowProps extends Omit<PressableProps, "style" | "children"> {
  icon?: SFSymbol;
  label: string;
  /** A second line under the name. */
  note?: string;
  detail?: string | number;
  /** The glyph's colour on a quiet disc. */
  tint?: string;
  /** A filled chip: the glyph goes white on it. */
  fill?: string;
  /** In place of the chip: a face, say. */
  leading?: ReactNode;
  /** A bare glyph, no disc — a radio's circle and tick. */
  plain?: boolean;
  depth?: number;
  chevron?: boolean;
  destructive?: boolean;
  last?: boolean;
}

/* `Link asChild` hands the row its press and its ref through `rest`. */
export function Row({
  icon,
  label,
  note,
  detail,
  tint,
  fill,
  leading,
  plain,
  depth = 0,
  chevron = true,
  destructive,
  last,
  ...rest
}: RowProps) {
  return (
    <Press {...rest}>
      <RowFace
        {...{ icon, label, note, detail, tint, fill, leading, plain, depth, chevron, last }}
        destructive={destructive}
      />
    </Press>
  );
}

/** A row's insides, shared by `Row` and the folder rows that also swipe. */
export function RowFace({
  icon,
  label,
  note,
  detail,
  tint,
  fill,
  leading,
  plain,
  depth = 0,
  chevron = true,
  destructive,
  last,
}: Omit<RowProps, keyof PressableProps>) {
  const palette = usePalette();
  const colour = destructive ? palette.danger : palette.ink;
  return (
    <View style={styles.face}>
      <View style={[styles.lead, { paddingLeft: 16 + depth * 20 }]}>
        {leading ??
          (plain ? (
            <View style={{ width: 38, alignItems: "center" }}>
              {icon ? (
                <SymbolView
                  name={icon}
                  tintColor={tint ?? palette.ink}
                  size={24}
                  weight="semibold"
                />
              ) : null}
            </View>
          ) : (
            <Chip icon={icon} tint={destructive ? palette.danger : tint} fill={fill} />
          ))}
      </View>
      <View style={[styles.body]}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[styles.label, { color: colour }]} numberOfLines={1}>
            {label}
          </Text>
          {note ? (
            <Text style={[styles.note, { color: palette.ink3 }]} numberOfLines={2}>
              {note}
            </Text>
          ) : null}
        </View>
        {detail !== undefined ? (
          <Text numberOfLines={1} style={[styles.detail, { color: palette.ink3 }]}>
            {detail}
          </Text>
        ) : null}
        {chevron ? (
          <SymbolView name="chevron.right" tintColor={palette.ink4} size={14} weight="semibold" />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginHorizontal: 16, marginBottom: 16 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingTop: 16,
  },
  heading: { flexShrink: 1, fontSize: 13, fontWeight: "600", letterSpacing: -0.1 },
  group: { paddingVertical: 6 },
  face: { flexDirection: "row", alignItems: "center", minHeight: 62 },
  lead: { paddingRight: 14 },
  body: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "stretch",
    paddingVertical: 10,
    paddingRight: 18,
    gap: 8,
  },
  label: { fontSize: 16, fontWeight: "600", letterSpacing: -0.3 },
  note: { fontSize: 13 },
  detail: { fontSize: 17, flexShrink: 1, maxWidth: "50%" },
});
