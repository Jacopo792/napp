import { Pressable } from "react-native";
import type { SFSymbol } from "expo-symbols";
import { SymbolView } from "./icons";
import { usePalette } from "./archive";

/** A legible system symbol inside a full 44-point touch target. */
export function IconButton({
  icon,
  label,
  onPress,
  disabled = false,
}: {
  icon: SFSymbol;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.35 : pressed ? 0.5 : 1,
      })}
    >
      <SymbolView name={icon} size={26} weight="semibold" tintColor={palette.accent} />
    </Pressable>
  );
}
