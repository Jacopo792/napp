import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";

/* The UI preview. Identical application code, with the modules that talk
   to Supabase swapped for the in-memory stand-ins in preview/ — so the notes
   surface can be looked at, on either breakpoint, without credentials, a
   network or a real archive. Never used by `pnpm build`.

   It runs against the web shell's index.html, but what it is previewing is the
   core, which the desktop shell mounts unchanged. One harness, both shells. */
const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  root: here("./apps/web"),
  envDir: here("."),
  server: { port: 5199 },
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
