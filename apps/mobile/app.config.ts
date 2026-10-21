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
      backgroundColor: "#000000",
    },
  },
  plugins: [
    "expo-sqlite",
    "expo-sharing",
    ["expo-router", { root: "./src/app" }],
    /* The mark on the default palette's page, light and dark — the first frame
       of `src/Launch.tsx`, which draws the same sheets at the same size and
       centre, so the hand-off from the system to the app is not seen. */
    [
      "expo-splash-screen",
      {
        image: "./assets/splash-mark.png",
        imageWidth: 128,
        resizeMode: "contain",
        backgroundColor: "#f8f5ee",
        dark: { image: "./assets/splash-mark.png", backgroundColor: "#0d0d0e" },
      },
    ],
  ],
};

export default config;
