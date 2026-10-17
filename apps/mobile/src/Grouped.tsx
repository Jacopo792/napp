/* The inset grouped rows Notes and Settings are made of: a rounded group on the
 * page, rows with a glyph, a name, a count and a chevron, and a hairline that
 * starts where the words do. A row lights up under the finger the way a system
 * row does — instantly in, eased out — which is the press, and the push that
 * follows is the system's. */
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type PressableProps } from "react-native";
import type { SFSymbol } from "expo-symbols";
import { SymbolView } from "./icons";
import { usePalette } from "./archive";

export function Group({ title, children }: { title?: string; children: ReactNode }) {
  const palette = usePalette();
  return (
    <View style={styles.section}>
      {title ? <Text style={[styles.heading, { color: palette.ink }]}>{title}</Text> : null}
      <View style={[styles.group, { backgroundColor: palette.paper }]}>{children}</View>
    </View>
  );
}

interface RowProps extends Omit<PressableProps, "style" | "children"> {
  icon: SFSymbol;
  label: string;
  detail?: string | number;
  tint?: string;
  depth?: number;
  chevron?: boolean;
  destructive?: boolean;
  last?: boolean;
}

/* `Link asChild` hands the row its press and its ref through `rest`. */
export function Row({
  icon,
  label,
  detail,
  tint,
  depth = 0,
  chevron = true,
  destructive,
  last,
  ...rest
}: RowProps) {
  const palette = usePalette();
  const colour = destructive ? palette.danger : palette.ink;
  return (
    <Pressable
      {...rest}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: palette.surface }]}
    >
      <View style={[styles.lead, { paddingLeft: 16 + depth * 22, width: 54 + depth * 22 }]}>
        <SymbolView name={icon} tintColor={tint ?? palette.accent} size={22} />
      </View>
      <View
        style={[
          styles.body,
          !last && { borderBottomColor: palette.rule, borderBottomWidth: StyleSheet.hairlineWidth },
        ]}
      >
        <Text style={[styles.label, { color: colour }]} numberOfLines={1}>
          {label}
        </Text>
        {detail !== undefined ? (
          <Text numberOfLines={1} style={[styles.detail, { color: palette.ink3 }]}>
            {detail}
          </Text>
        ) : null}
        {chevron ? (
          <SymbolView name="chevron.right" tintColor={palette.ink4} size={13} weight="semibold" />
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: { marginHorizontal: 16, marginBottom: 24 },
  heading: { fontSize: 22, fontWeight: "700", marginBottom: 8, marginLeft: 4 },
  group: { borderRadius: 26, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", minHeight: 50 },
  lead: { width: 54, alignItems: "flex-start" },
  body: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "stretch",
    paddingRight: 16,
    gap: 8,
  },
  label: { flex: 1, fontSize: 17 },
  detail: { fontSize: 17, flexShrink: 1, maxWidth: "55%" },
});
