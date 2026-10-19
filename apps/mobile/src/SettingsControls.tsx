/* Settings' parts, in the shape of Revolut's Pocket pages: the page's title
 * in the page under a round back button, cards with their small grey heading
 * inside them, rows of a tile, a name, a line under it and a chevron, and the
 * page's one decisive act as a pill at its foot (`PillButton`). A choice is
 * shown by looking at it rather than described. The cards and the press are
 * Folders' own (`Grouped.tsx`, `Chrome.tsx`), so every screen is one material. */
import { useEffect, useState, type ReactNode } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  type PressableProps,
} from "react-native";
import { Stack } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import type { SFSymbol } from "expo-symbols";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { SymbolView } from "./icons";
import { Chip, Press, quiet } from "./Grouped";
import { Backdrop } from "./Backdrop";
import { usePalette } from "./archive";
import { glide } from "./theme";
import { Card, PageTitle } from "./Chrome";

/** A page of Settings. */
export function SettingsPage({ title, children }: { title?: string; children: ReactNode }) {
  const palette = usePalette();
  const backgroundColor = palette.page;
  /* iOS insets a scroller under a transparent bar by itself; Android does not. */
  const header = useHeaderHeight();
  const top = Platform.OS === "android" ? header : 0;
  return (
    <>
      <Stack.Screen options={{ title: "", contentStyle: { backgroundColor } }} />
      <Backdrop veil />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingTop: top + 8, paddingBottom: 48 }}
      >
        {title ? <PageTitle>{title}</PageTitle> : null}
        {children}
      </ScrollView>
    </>
  );
}

export function Section({ title, children }: { title?: string; children: ReactNode }) {
  const palette = usePalette();
  return (
    <Card style={styles.section}>
      {title ? (
        <Text style={[styles.heading, { color: palette.ink3 }]} numberOfLines={1}>
          {title}
        </Text>
      ) : null}
      <View style={styles.group}>{children}</View>
    </Card>
  );
}

interface LineProps extends Omit<PressableProps, "style" | "children"> {
  label: string;
  /** A line under the name: what is set there now. */
  note?: string;
  value?: string | number;
  /** A tile before the name. */
  icon?: SFSymbol;
  /** Before the name, in place of a tile: a face, a swatch. */
  leading?: ReactNode;
  /** Where the value would be: a switch, a tick. */
  trailing?: ReactNode;
  /** Goes somewhere: the chevron. Otherwise the row acts where it stands. */
  opens?: boolean;
  tone?: "ink" | "action" | "danger";
}

/* `Link asChild` hands the row its press and its ref through `rest`. */
/** Glyphs whose `.fill` form exists in SF Symbols. */
const SOLID = new Set<string>([
  "archivebox",
  "envelope",
  "folder",
  "hand.raised",
  "paintpalette",
  "person",
  "person.2",
  "person.badge.plus",
  "person.crop.circle",
  "photo",
  "rectangle.portrait.and.arrow.right",
]);

export function Line({
  label,
  note,
  value,
  icon,
  leading,
  trailing,
  opens,
  tone = "ink",
  ...rest
}: LineProps) {
  const palette = usePalette();
  const colour =
    tone === "danger" ? palette.danger : tone === "action" ? palette.accent : palette.ink;
  const pressable = Boolean(rest.onPress) || opens;
  return (
    <Press
      accessibilityRole={pressable ? "button" : undefined}
      {...rest}
      disabled={rest.disabled || !pressable}
      style={[styles.line, rest.disabled && pressable && { opacity: 0.4 }]}
    >
      {/* Revolut's row: a solid glyph standing on the card itself, not a
          grey tile — the tile was the flattest thing on the page. */}
      {icon ? (
        <View style={styles.glyph}>
          <SymbolView
            name={(SOLID.has(icon) ? `${icon}.fill` : icon) as SFSymbol}
            size={21}
            weight="semibold"
            tintColor={colour}
          />
        </View>
      ) : (
        leading
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[styles.label, { color: colour }]} numberOfLines={1}>
          {label}
        </Text>
        {note ? (
          <Text style={[styles.note, { color: palette.ink3 }]} numberOfLines={1}>
            {note}
          </Text>
        ) : null}
      </View>
      {value !== undefined ? (
        <Text style={[styles.value, { color: palette.ink3 }]} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {trailing}
      {opens ? (
        <SymbolView name="chevron.right" tintColor={palette.ink4} size={14} weight="semibold" />
      ) : null}
    </Press>
  );
}

export function Toggle({
  label,
  icon,
  value,
  onChange,
  disabled,
}: {
  label: string;
  icon?: SFSymbol;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  const palette = usePalette();
  return (
    <Line
      label={label}
      icon={icon}
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

/** A few words, one of them chosen: the theme. The chosen one is a solid
 *  plate that glides to it, as the system's segmented control does. */
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
  const at = Math.max(
    0,
    options.findIndex((option) => option.id === value),
  );
  const [width, setWidth] = useState(0);
  const step = (width - 6) / options.length;
  /* Where the plate stands, in segments; set without motion on the first
     frame and sprung to after, so a page opening does not slide it in. */
  const place = useSharedValue(at);
  useEffect(() => {
    place.value = withSpring(at, glide);
  }, [at, place]);
  const plate = useAnimatedStyle(() => ({ transform: [{ translateX: place.value * step }] }));
  return (
    <View
      accessibilityRole="radiogroup"
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={[styles.segments, { backgroundColor: quiet(palette) }]}
    >
      {width ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.plate,
            { width: step, backgroundColor: palette.dark ? "#ffffff2b" : "#ffffff" },
            plate,
          ]}
        />
      ) : null}
      {options.map((option) => {
        const on = option.id === value;
        return (
          <Pressable
            key={String(option.id)}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            onPress={() => onChange(option.id)}
            style={styles.segment}
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

/** Colours to choose by looking at them, each named under its disc. The one
 *  chosen wears a ring of its own colour. */
export function Swatches({
  items,
  value,
  onChange,
}: {
  items: { id: string; label: string; ground: string }[];
  value: string | undefined;
  onChange: (id: string) => void;
}) {
  const palette = usePalette();
  return (
    <View style={styles.swatches}>
      {items.map((item) => {
        const on = item.id === value;
        return (
          <Press
            key={item.id}
            feedback="scale"
            accessibilityRole="radio"
            accessibilityLabel={item.label}
            accessibilityState={{ checked: on }}
            onPress={() => onChange(item.id)}
            style={styles.swatch}
          >
            <View style={[styles.swatchRing, { borderColor: on ? item.ground : "transparent" }]}>
              <View style={[styles.swatchFace, { backgroundColor: item.ground }]}>
                {on ? (
                  <SymbolView name="checkmark" tintColor="#ffffff" size={16} weight="bold" />
                ) : null}
              </View>
            </View>
            <Text
              style={{
                color: on ? palette.ink : palette.ink3,
                fontSize: 13,
                fontWeight: on ? "600" : "500",
              }}
              numberOfLines={1}
            >
              {item.label}
            </Text>
          </Press>
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
  section: { marginHorizontal: 16, marginBottom: 16 },
  heading: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: -0.1,
    marginHorizontal: 16,
    marginTop: 16,
  },
  group: { paddingVertical: 6 },
  glyph: { width: 32, alignItems: "center", justifyContent: "center" },
  line: {
    minHeight: 60,
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  label: { fontSize: 16, fontWeight: "600", letterSpacing: -0.3 },
  note: { fontSize: 13 },
  value: { fontSize: 17, flexShrink: 1, maxWidth: "55%", letterSpacing: -0.3 },
  segments: {
    flexDirection: "row",
    borderRadius: 14,
    borderCurve: "continuous",
    padding: 3,
    marginHorizontal: 12,
    marginVertical: 8,
  },
  plate: {
    position: "absolute",
    top: 3,
    bottom: 3,
    left: 3,
    borderRadius: 11,
    borderCurve: "continuous",
  },
  segment: { flex: 1, alignItems: "center", paddingVertical: 9 },
  swatches: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: 16,
    paddingHorizontal: 8,
    paddingVertical: 14,
  },
  swatch: { width: "25%", alignItems: "center", gap: 6 },
  swatchRing: { padding: 3, borderRadius: 30, borderWidth: 2.5 },
  swatchFace: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
});
