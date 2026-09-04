/* Throwaway. The DESKTOP renderer — so its entry sets data-shell — against the
   in-memory fixture, on the port electron/main.js loads in dev. Delete after. */
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  root: here("./apps/desktop"),
  envDir: here("."),
  server: { port: 5174, strictPort: true },
  resolve: {
    alias: [
      { find: /^@\/lib\/supabase$/, replacement: here("./preview/supabase.mock.ts") },
      { find: /^@\/lib\/session$/, replacement: here("./preview/session.mock.ts") },
      { find: /^@\/lib\/sync$/, replacement: here("./preview/sync.mock.ts") },
      { find: /^@\/lib\/presence$/, replacement: here("./preview/presence.mock.ts") },
      {
        find: /^@\/lib\/accountPreferences$/,
        replacement: here("./preview/accountPreferences.mock.ts"),
      },
      { find: /^@\/lib\/collab$/, replacement: here("./preview/collab.mock.ts") },
      { find: /^@\/lib\/comments$/, replacement: here("./preview/comments.mock.ts") },
    ],
  },
  plugins: [react(), tailwindcss(), tsConfigPaths({ root: here(".") })],
});
