import type { ExpoConfig } from "expo/config";

/* The identity the phone app has always had, so this build replaces the one
   already installed rather than standing beside it. */
const config: ExpoConfig = {
  name: "Napp",
  slug: "napp",
  scheme: "napp",
  version: "0.9.43",
  orientation: "default",
  userInterfaceStyle: "dark",
  ios: {
    bundleIdentifier: "io.github.jacopo792.napp",
    supportsTablet: true,
    appleTeamId: "BMWS29KJPT",
  },
  android: { package: "io.github.jacopo792.napp" },
  plugins: ["expo-sqlite", "expo-sharing"],
};

export default config;
