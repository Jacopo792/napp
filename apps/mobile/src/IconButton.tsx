import type { SFSymbol } from "expo-symbols";
import { SymbolView } from "./icons";
import { usePalette } from "./archive";
import { Press } from "./Grouped";

/** A legible system symbol inside a full 44-point touch target, giving a
 *  little under the finger. */
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
    <Press
      feedback="scale"
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={{
        width: 44,
        height: 44,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.35 : 1,
      }}
    >
      <SymbolView name={icon} size={24} weight="medium" tintColor={palette.ink} />
    </Press>
  );
}
