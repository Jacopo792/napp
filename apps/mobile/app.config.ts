import type { ExpoConfig } from "expo/config";

/* The identity the phone app has always had, so this build replaces the one
   already installed rather than standing beside it. */
const config: ExpoConfig = {
  name: "Napp",
  slug: "napp",
  icon: "../desktop/build/icon.png",
  scheme: "napp",
  version: "0.9.43",
  orientation: "default",
  userInterfaceStyle: "automatic",
  ios: {
    bundleIdentifier: "io.github.jacopo792.napp",
    supportsTablet: true,
    appleTeamId: "BMWS29KJPT",
  },
  android: {
    package: "io.github.jacopo792.napp",
    adaptiveIcon: { foregroundImage: "../desktop/build/icon.png", backgroundColor: "#1c1c1e" },
  },
  plugins: ["expo-sqlite", "expo-sharing", ["expo-router", { root: "./src/app" }]],
};

export default config;
