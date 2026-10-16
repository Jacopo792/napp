import type { CapacitorConfig } from "@capacitor/cli";

/* The phone's window. The built renderer is served by the WebView itself from
   `https://notes` on Android and `capacitor://notes` on iOS — origins of our
   own, for the reason the desktop app has `app://notes`: `originAllowed()` in
   the collaboration server refuses a socket whose Origin it was not told
   about, so both have to be in ALLOWED_ORIGINS on Render. */
const config: CapacitorConfig = {
  appId: "io.github.jacopo792.napp",
  appName: "Napp",
  webDir: "dist",
  server: { hostname: "notes", androidScheme: "https" },
  /* The stylesheet already reads `env(safe-area-inset-*)` for the browser on
     a phone, so the WebView only has to report them: on Chromium 140 and
     later it runs edge to edge, on older ones Capacitor pads it instead and
     the padding is the window's own dark ground (styles.xml). */
  plugins: { SystemBars: { insetsHandling: "native", style: "DARK" } },
};

export default config;
