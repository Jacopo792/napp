import type { ExpoConfig } from "expo/config";

/* The identity the phone app has always had, so this build replaces the one
   already installed rather than standing beside it. */
const config: ExpoConfig = {
  name: "Napp",
  slug: "napp",
  icon: "./assets/icon.png",
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
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-foreground.png",
      monochromeImage: "./assets/adaptive-monochrome.png",
      backgroundColor: "#EDE6D7",
    },
  },
  plugins: ["expo-sqlite", "expo-sharing", ["expo-router", { root: "./src/app" }]],
};

export default config;
