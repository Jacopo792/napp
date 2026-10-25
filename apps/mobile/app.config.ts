import type { ExpoConfig } from "expo/config";

/* The identity the phone app has always had, so this build replaces the one
   already installed rather than standing beside it. */
const config: ExpoConfig = {
  name: "Napp",
  slug: "napp",
  icon: "./assets/icon.png",
  scheme: "napp",
  version: "0.9.46",
  orientation: "default",
  userInterfaceStyle: "automatic",
  ios: {
    bundleIdentifier: "io.github.jacopo792.napp",
    buildNumber: "46",
    supportsTablet: true,
    appleTeamId: "BMWS29KJPT",
    privacyManifests: {
      NSPrivacyTracking: false,
      NSPrivacyTrackingDomains: [],
      NSPrivacyCollectedDataTypes: [
        "Name",
        "EmailAddress",
        "UserID",
        "PhotosorVideos",
        "OtherUserContent",
        "CustomerSupport",
        "ProductInteraction",
        "OtherDiagnosticData",
        "OtherDataTypes",
      ].map((kind) => ({
        NSPrivacyCollectedDataType: `NSPrivacyCollectedDataType${kind}`,
        NSPrivacyCollectedDataTypeLinked: true,
        NSPrivacyCollectedDataTypeTracking: false,
        NSPrivacyCollectedDataTypePurposes: ["NSPrivacyCollectedDataTypePurposeAppFunctionality"],
      })),
      NSPrivacyAccessedAPITypes: [
        {
          NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryUserDefaults",
          NSPrivacyAccessedAPITypeReasons: ["CA92.1"],
        },
        {
          NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryFileTimestamp",
          NSPrivacyAccessedAPITypeReasons: ["C617.1", "0A2A.1", "3B52.1"],
        },
        {
          NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategorySystemBootTime",
          NSPrivacyAccessedAPITypeReasons: ["35F9.1"],
        },
        {
          NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryDiskSpace",
          NSPrivacyAccessedAPITypeReasons: ["E174.1", "85F4.1"],
        },
      ],
    },
  },
  android: {
    package: "io.github.jacopo792.napp",
    blockedPermissions: [
      "android.permission.CAMERA",
      "android.permission.RECORD_AUDIO",
      "android.permission.READ_MEDIA_IMAGES",
      "android.permission.READ_MEDIA_VIDEO",
      "android.permission.READ_EXTERNAL_STORAGE",
      "android.permission.WRITE_EXTERNAL_STORAGE",
      "android.permission.SYSTEM_ALERT_WINDOW",
    ],
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-foreground.png",
      monochromeImage: "./assets/adaptive-monochrome.png",
      backgroundColor: "#000000",
    },
  },
  plugins: [
    "./plugins/with-release-signing.cjs",
    "expo-sqlite",
    "expo-sharing",
    [
      "expo-image-picker",
      {
        photosPermission: "Choose photos for your Napp profile, notes or wallpaper.",
        cameraPermission: false,
        microphonePermission: false,
      },
    ],
    ["expo-router", { root: "./src/app" }],
    /* The mark on the default palette's page, light and dark — the first frame
       of `src/Launch.tsx`, which draws the same tile, arch and rules at the
       same size and centre, so the hand-off from the system is not seen. */
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
