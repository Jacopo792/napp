import type { ReactNode } from "react";
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { Stack } from "expo-router";
import { SymbolView } from "./icons";
import { Chip, Row } from "./Grouped";
import type { SFSymbol } from "expo-symbols";
import { Backdrop } from "./Backdrop";
import { usePalette } from "./archive";

export function SettingsPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <Stack.Screen options={{ title }} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingTop: 20, paddingBottom: 36 }}
      >
        {children}
      </ScrollView>
      <Backdrop />
    </>
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
  /** A chip before the name, when the rows around it carry one. */
  icon?: SFSymbol;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  const palette = usePalette();
  return (
    <View style={[styles.toggle, icon && { paddingLeft: 14 }, { borderBottomColor: palette.rule }]}>
      {icon ? <Chip icon={icon} /> : null}
      <Text style={[styles.label, { color: palette.ink }]}>{label}</Text>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ true: palette.accent }}
      />
    </View>
  );
}

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
    <Row
      icon={selected ? "checkmark" : "circle"}
      label={label}
      tint={selected ? palette.accent : palette.ink4}
      plain
      chevron={false}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
    />
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
  toggle: {
    minHeight: 60,
    paddingHorizontal: 18,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  label: { flex: 1, fontSize: 17, fontWeight: "600", letterSpacing: -0.2 },
});
