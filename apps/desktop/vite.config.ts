import { contentSecurityPolicy } from "../../scripts/contentSecurityPolicy";
import { ocrAssets } from "../../scripts/ocrAssets";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";

/* The renderer. The same core the browser mounts, built for a window that
   loads it from `app://notes` rather than from a server. */
export default defineConfig(({ command, mode }) => {
  /* `fileURLToPath` and never `.pathname`. On Windows a file URL's pathname is
   `/D:/a/repo`, with a slash in front of the drive letter, which is not a path
   any Windows API accepts — so `vite-tsconfig-paths` found no tsconfig, the `@`
   alias resolved to nothing, and the Windows half of the release matrix died on
   `Rollup failed to resolve import "@/lib/axes"`. It cannot fail on Linux or
   macOS, where the two happen to agree, which is why it survived every check
   this repository runs. */
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const env = { ...loadEnv(mode, root, ""), ...process.env };
  const required = [
    "VITE_SUPABASE_URL",
    "VITE_SUPABASE_PUBLISHABLE_KEY",
    "VITE_COLLAB_URL",
    /* Where an invitation has to point. The desktop app cannot be the place a
       link lands, so it has to know the address of the app that can. */
    "VITE_WEB_ORIGIN",
  ];
  for (const name of required) {
    if (!env[name]) throw new Error(`Missing required environment variable: ${name}`);
  }

  /* A build reads the same `.env.local` the dev server does, and that file
     points the collaboration URL at a server on this machine. An installed app
     carries that address to a laptop where nothing answers it — and the way
     that fails is not an error: an editor opens only after the server has
     synced, so the app signs in, says "Waking the server", and never opens a
     note. It is indistinguishable from being slow.
     A packaged app addressed to localhost is always a mistake, so it is one
     here rather than an afternoon later. Explicitly wanted, for a build aimed
     at a server on this machine: ALLOW_LOCAL_COLLAB=1. */
  const local = /(^|\/\/)(localhost|127\.0\.0\.1|\[::1\])(:|$|\/)/;
  if (command === "build" && !env.ALLOW_LOCAL_COLLAB && local.test(env.VITE_COLLAB_URL ?? "")) {
    throw new Error(
      `VITE_COLLAB_URL is ${env.VITE_COLLAB_URL}, which is this machine.\n` +
        `A packaged app cannot reach it. Build with the deployed server, e.g.\n` +
        `  VITE_COLLAB_URL=wss://notes-collab.onrender.com pnpm build:desktop\n` +
        `or set ALLOW_LOCAL_COLLAB=1 if a local server is really what you want.`,
    );
  }

  return {
    /* Relative, because the built index.html is fetched from app://notes and
       an absolute /assets/… would be a request for the root of that scheme. */
    base: "./",
    envDir: root,
    server: { port: 5174, strictPort: true },
    build: { outDir: "dist", emptyOutDir: true, chunkSizeWarningLimit: 1400 },
    plugins: [
      ocrAssets(),
      react(),
      tailwindcss(),
      tsConfigPaths({ root }),
      contentSecurityPolicy(env),
    ],
  };
});
