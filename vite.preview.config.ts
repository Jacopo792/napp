import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";

/* The UI preview. Identical application code, with the modules that talk
   to Supabase swapped for the in-memory stand-ins in preview/ — so the notes
   surface can be looked at, on either breakpoint, without credentials, a
   network or a real archive. Never used by `pnpm build`.

   One harness, both shells, and that is not a figure of speech: what is being
   previewed is the core, which each shell mounts unchanged, so the shell is a
   root and a port rather than a second file. `NAPP_SHELL=desktop` runs the
   desktop renderer instead — whose entry is what sets `data-shell`, and which
   is therefore the only way to look at the traffic-light gutter, the vibrancy
   behind the sidebar, the system menus or the full-screen attribute — on the
   port `electron/main.js` loads in development. There was a second config for
   that, copied from this one and labelled "throwaway", and it shipped in a
   tagged release. */
const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

const desktop = process.env.NAPP_SHELL === "desktop";

export default defineConfig({
  root: here(desktop ? "./apps/desktop" : "./apps/web"),
  envDir: here("."),
  /* The desktop port is not a preference: it is the one the Electron window
     loads in development, so it has to be that port or nothing. */
  server: desktop ? { port: 5174, strictPort: true } : { port: 5199 },
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
