/* The three places a hand goes back to, under the system's own floating tab
 * bar — on iOS the Liquid Glass pill Revolut's sits in, on Android the
 * Material bar. It minimises as a list scrolls down and comes back on the way
 * up. Everything opened from a tab is pushed over the bar by the stack above. */
import { Platform } from "react-native";
import { NativeTabs } from "expo-router/native-tabs";
import { usePalette } from "../../archive";

export default function Tabs() {
  const palette = usePalette();
  return (
    <NativeTabs
      tintColor={palette.ink}
      minimizeBehavior="onScrollDown"
      labelVisibilityMode="labeled"
      backgroundColor={Platform.OS === "android" ? palette.paper : undefined}
      indicatorColor={palette.dark ? "#ffffff29" : "#0000001a"}
      iconColor={{ default: palette.ink3, selected: palette.ink }}
      labelStyle={{
        default: { fontSize: 11, fontWeight: "600", color: palette.ink3 },
        selected: { fontSize: 11, fontWeight: "700", color: palette.ink },
      }}
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon sf={{ default: "house", selected: "house.fill" }} md="home" />
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="all">
        <NativeTabs.Trigger.Icon
          sf={{ default: "note.text", selected: "note.text" }}
          md="description"
        />
        <NativeTabs.Trigger.Label>Notes</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="remarks">
        <NativeTabs.Trigger.Icon
          sf={{
            default: "bubble.left.and.bubble.right",
            selected: "bubble.left.and.bubble.right.fill",
          }}
          md="forum"
        />
        <NativeTabs.Trigger.Label>Comments</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
