import type { ReactNode } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  type PressableProps,
} from "react-native";
import { Stack } from "expo-router";
import { SymbolView } from "./icons";
import { quiet } from "./Grouped";
import { usePalette } from "./archive";

export function SettingsPage({ title, children }: { title: string; children: ReactNode }) {
  const palette = usePalette();
  const backgroundColor = palette.dark ? "#000000" : "#f2f2f7";
  return (
    <>
      <Stack.Screen options={{ title, contentStyle: { backgroundColor } }} />
      <ScrollView
        style={{ backgroundColor }}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingTop: 16, paddingBottom: 36 }}
      >
        {children}
      </ScrollView>
    </>
  );
}

/* Inset groups, system typography and named choices, like iOS Settings. */

export function Section({ title, children }: { title?: string; children: ReactNode }) {
  const palette = usePalette();
  return (
    <View style={styles.section}>
      {title ? <Text style={[styles.heading, { color: palette.ink3 }]}>{title}</Text> : null}
      <View style={[styles.group, { backgroundColor: palette.dark ? "#1c1c1e" : "#ffffff" }]}>
        {children}
      </View>
    </View>
  );
}

interface LineProps extends Omit<PressableProps, "style" | "children"> {
  label: string;
  value?: string | number;
  /** Before the name: a face, a swatch. */
  leading?: ReactNode;
  /** Where the value would be: a switch, a tick. */
  trailing?: ReactNode;
  /** Goes somewhere: the chevron. Otherwise the row acts where it stands. */
  opens?: boolean;
  tone?: "ink" | "action" | "danger";
}

/* `Link asChild` hands the row its press and its ref through `rest`. */
export function Line({ label, value, leading, trailing, opens, tone = "ink", ...rest }: LineProps) {
  const palette = usePalette();
  const colour =
    tone === "danger" ? palette.danger : tone === "action" ? palette.accent : palette.ink;
  const pressable = Boolean(rest.onPress) || opens;
  return (
    <Pressable
      {...rest}
      disabled={rest.disabled || !pressable}
      style={({ pressed }) => [
        styles.line,
        { borderBottomColor: palette.rule },
        pressed && { backgroundColor: quiet(palette) },
        rest.disabled && pressable && { opacity: 0.45 },
      ]}
    >
      {leading}
      <Text style={[styles.label, { color: colour }]} numberOfLines={1}>
        {label}
      </Text>
      {value !== undefined ? (
        <Text style={[styles.value, { color: palette.ink3 }]} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {trailing}
      {opens ? (
        <SymbolView name="chevron.right" tintColor={palette.ink4} size={12} weight="semibold" />
      ) : null}
    </Pressable>
  );
}

export function Toggle({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  const palette = usePalette();
  return (
    <Line
      label={label}
      trailing={
        <Switch
          accessibilityLabel={label}
          value={value}
          onValueChange={onChange}
          disabled={disabled}
          trackColor={{ true: palette.accent }}
        />
      }
    />
  );
}

/** One of a list, ticked. */
export function Choice({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const palette = usePalette();
  return (
    <Line
      label={label}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      trailing={
        selected ? (
          <SymbolView name="checkmark" tintColor={palette.accent} size={16} weight="semibold" />
        ) : null
      }
    />
  );
}

/** A few words, one of them chosen: the theme, the typeface, the size. */
export function Segments<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  const palette = usePalette();
  return (
    <View
      accessibilityRole="radiogroup"
      style={[styles.segments, { backgroundColor: quiet(palette) }]}
    >
      {options.map((option) => {
        const on = option.id === value;
        return (
          <Pressable
            key={String(option.id)}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            onPress={() => onChange(option.id)}
            style={[styles.segment, on && { backgroundColor: palette.paper }]}
          >
            <Text
              style={{
                color: on ? palette.ink : palette.ink3,
                fontSize: 15,
                fontWeight: on ? "600" : "500",
              }}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Colours to choose by looking at them: the ground with its accent on it,
 *  or a colour alone. The one chosen wears a ring of the accent. */
export function Swatches({
  items,
  value,
  onChange,
  labelled = false,
}: {
  items: { id: string; label: string; ground: string; dot?: string }[];
  labelled?: boolean;
  value: string | undefined;
  onChange: (id: string) => void;
}) {
  const palette = usePalette();
  return (
    <View style={styles.swatches}>
      {items.map((item) => {
        const on = item.id === value;
        return (
          <Pressable
            key={item.id}
            accessibilityRole="radio"
            accessibilityLabel={item.label}
            accessibilityState={{ checked: on }}
            onPress={() => onChange(item.id)}
            style={({ pressed }) => [
              styles.swatch,
              labelled && {
                width: "30%",
                flexGrow: 1,
                alignItems: "center",
                gap: 6,
                paddingVertical: 10,
                borderRadius: 12,
              },
              { borderColor: on ? palette.accent : "transparent" },
              pressed && { transform: [{ scale: 0.92 }] },
            ]}
          >
            <View
              style={[
                styles.swatchFace,
                { backgroundColor: item.ground, borderColor: palette.rule },
              ]}
            >
              {item.dot ? <View style={[styles.swatchDot, { backgroundColor: item.dot }]} /> : null}
            </View>
            {labelled ? (
              <Text
                style={{ color: palette.ink, fontSize: 13, fontWeight: on ? "600" : "400" }}
                numberOfLines={1}
              >
                {item.label}
                {on ? " ✓" : ""}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export function Status({ children }: { children: string }) {
  const palette = usePalette();
  return (
    <Text accessibilityRole="alert" style={{ color: palette.danger, margin: 20 }}>
      {children}
    </Text>
  );
}

export function Empty({ label }: { label: string }) {
  const palette = usePalette();
  return (
    <View style={{ padding: 40, alignItems: "center", gap: 12 }}>
      <SymbolView name="note.text" tintColor={palette.ink4} size={42} />
      <Text style={{ color: palette.ink3, fontSize: 17 }}>{label}</Text>
    </View>
  );
}

export async function attempt(action: () => Promise<unknown>) {
  try {
    await action();
  } catch (reason) {
    Alert.alert("Could not complete", reason instanceof Error ? reason.message : String(reason));
  }
}

const styles = StyleSheet.create({
  section: { marginHorizontal: 20, marginBottom: 24 },
  heading: { fontSize: 13, fontWeight: "500", marginLeft: 16, marginBottom: 8 },
  group: { borderRadius: 12, borderCurve: "continuous", overflow: "hidden", paddingHorizontal: 16 },
  line: {
    minHeight: 52,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  label: { flex: 1, fontSize: 17, letterSpacing: -0.2 },
  value: { fontSize: 17, flexShrink: 1, maxWidth: "55%" },
  segments: { flexDirection: "row", borderRadius: 12, padding: 3, marginVertical: 12 },
  segment: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    borderRadius: 9,
    borderCurve: "continuous",
  },
  swatches: { flexDirection: "row", flexWrap: "wrap", gap: 10, paddingVertical: 14 },
  swatch: { padding: 3, borderRadius: 24, borderWidth: 2 },
  swatchFace: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  swatchDot: { width: 13, height: 13, borderRadius: 7 },
});
