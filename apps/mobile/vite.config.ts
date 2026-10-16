import { ocrAssets } from "../../scripts/ocrAssets";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";

/* The renderer the phone's WebView loads from `https://notes` (Android) or
   `capacitor://notes` (iOS). The same core, built the way the desktop's is. */
export default defineConfig(({ command, mode }) => {
  /* `fileURLToPath` and never `.pathname` — see apps/desktop/vite.config.ts. */
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const env = { ...loadEnv(mode, root, ""), ...process.env };
  const required = [
    "VITE_SUPABASE_URL",
    "VITE_SUPABASE_PUBLISHABLE_KEY",
    "VITE_COLLAB_URL",
    /* An invitation is opened on somebody else's phone, in a browser. */
    "VITE_WEB_ORIGIN",
  ];
  for (const name of required) {
    if (!env[name]) throw new Error(`Missing required environment variable: ${name}`);
  }

  /* An installed app addressed to this machine signs in and then says "Waking
     the server" for ever — see the same guard in apps/desktop. */
  const local = /(^|\/\/)(localhost|127\.0\.0\.1|\[::1\])(:|$|\/)/;
  if (command === "build" && !env.ALLOW_LOCAL_COLLAB && local.test(env.VITE_COLLAB_URL ?? "")) {
    throw new Error(
      `VITE_COLLAB_URL is ${env.VITE_COLLAB_URL}, which is this machine.\n` +
        `A phone cannot reach it. Build with the deployed server, e.g.\n` +
        `  VITE_COLLAB_URL=wss://notes-collab.onrender.com pnpm build:android\n` +
        `or set ALLOW_LOCAL_COLLAB=1 if a local server is really what you want.`,
    );
  }

  return {
    base: "./",
    envDir: root,
    server: { port: 5175, strictPort: true },
    build: { outDir: "dist", emptyOutDir: true, chunkSizeWarningLimit: 1400 },
    plugins: [ocrAssets(), react(), tailwindcss(), tsConfigPaths({ root })],
  };
});
