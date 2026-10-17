/* The grouped cards Folders and Settings are made of: a rounded card standing
 * on the reader's ground — translucent over their wallpaper, solid over the
 * page — and rows that lead with a round chip, a name and a count. A chip is
 * filled when the row is a place of its own (the archive, the bin, a colour)
 * and a quiet disc when it is one of many, the way Revolut tells a category
 * from a line. A row lights up under the finger instantly and lets go eased. */
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type PressableProps } from "react-native";
import type { SFSymbol } from "expo-symbols";
import { SymbolView } from "./icons";
import { usePalette, type Palette } from "./archive";
import { useCard } from "./Backdrop";
import { trashGround } from "./theme";

export const CARD_RADIUS = 18;

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
  const { card } = useCard();
  return (
    <View style={styles.section}>
      {title ? (
        <View style={styles.header}>
          {leading}
          <Text style={[styles.heading, { color: palette.ink }]} numberOfLines={1}>
            {title}
          </Text>
        </View>
      ) : null}
      <View style={[styles.group, { backgroundColor: card }]}>{children}</View>
    </View>
  );
}

/** A disc of the ink at low strength: present on any ground, loud on none. */
export const quiet = (palette: Palette) => (palette.dark ? "#ffffff1a" : "#0000000f");

export function Chip({
  icon,
  tint,
  fill,
  size = 40,
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
        borderRadius: size / 2,
        backgroundColor: quiet(palette),
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {icon ? (
        <SymbolView name={icon} size={size * 0.6} weight="semibold" tintColor={colour} />
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
  const palette = usePalette();
  return (
    <Pressable
      {...rest}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: quiet(palette) }]}
    >
      <RowFace
        {...{ icon, label, note, detail, tint, fill, leading, plain, depth, chevron, last }}
        destructive={destructive}
      />
    </Pressable>
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
      <View style={[styles.lead, { paddingLeft: 14 + depth * 20 }]}>
        {leading ??
          (plain ? (
            <View style={{ width: 40, alignItems: "center" }}>
              {icon ? (
                <SymbolView
                  name={icon}
                  tintColor={tint ?? palette.accent}
                  size={25}
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
          <SymbolView name="chevron.right" tintColor={palette.ink4} size={13} weight="semibold" />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginHorizontal: 16, marginBottom: 30 },
  header: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10, marginLeft: 4 },
  heading: { flexShrink: 1, fontSize: 20, fontWeight: "700", letterSpacing: -0.4 },
  group: {
    borderRadius: CARD_RADIUS,
    borderCurve: "continuous",
    overflow: "hidden",
    paddingVertical: 4,
  },
  row: {},
  face: { flexDirection: "row", alignItems: "center", minHeight: 64 },
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
  label: { fontSize: 17, fontWeight: "600", letterSpacing: -0.2 },
  note: { fontSize: 15 },
  detail: { fontSize: 17, flexShrink: 1, maxWidth: "50%" },
});
