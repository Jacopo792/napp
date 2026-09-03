import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ mode }) => {
  /* The three names are read here, at the repository root, because that is
     where the `.env` files live for every workspace. */
  const root = new URL("../../", import.meta.url).pathname;
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
