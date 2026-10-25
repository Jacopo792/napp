import { Linking, Pressable, Text, View } from "react-native";
import { policyUrl } from "@/lib/storePolicies";
import { usePalette } from "./archive";

/** `centred`: the one small line at the foot of the account form. */
export function PolicyLinks({ color, centred }: { color?: string; centred?: boolean }) {
  const palette = usePalette();
  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        gap: centred ? 6 : 16,
        justifyContent: centred ? "center" : undefined,
        alignItems: "center",
      }}
    >
      {(
        [
          ["privacy", "Privacy"],
          ["terms", "Terms"],
          ["support", "Support"],
        ] as const
      ).map(([kind, label], index) => [
        centred && index ? (
          <Text key={`dot-${kind}`} style={{ color: color ?? palette.ink3, fontSize: 12 }}>
            ·
          </Text>
        ) : null,
        <Pressable
          key={kind}
          accessibilityRole="link"
          onPress={() => void Linking.openURL(policyUrl(kind))}
          style={{ minHeight: centred ? 32 : 44, justifyContent: "center" }}
        >
          <Text style={{ color: color ?? palette.ink3, fontSize: centred ? 12 : 13 }}>{label}</Text>
        </Pressable>,
      ])}
    </View>
  );
}
