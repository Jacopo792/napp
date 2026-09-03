import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ mode }) => {
  /* The three names are read here, at the repository root, because that is
     where the `.env` files live for every workspace. */
  /* `fileURLToPath` and never `.pathname`. On Windows a file URL's pathname is
   `/D:/a/repo`, with a slash in front of the drive letter, which is not a path
   any Windows API accepts — so `vite-tsconfig-paths` found no tsconfig, the `@`
   alias resolved to nothing, and the Windows half of the release matrix died on
   `Rollup failed to resolve import "@/lib/axes"`. It cannot fail on Linux or
   macOS, where the two happen to agree, which is why it survived every check
   this repository runs. */
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const env = { ...loadEnv(mode, root, ""), ...process.env };
  for (const name of ["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY", "VITE_COLLAB_URL"]) {
    if (!env[name]) throw new Error(`Missing required environment variable: ${name}`);
  }

  return {
    base: env.VITE_BASE_PATH ?? "/",
    envDir: root,
    build: { chunkSizeWarningLimit: 1400 },
    plugins: [react(), tailwindcss(), tsConfigPaths({ root })],
  };
});
