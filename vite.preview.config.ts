import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";

/* The UI preview. Identical application code, with the three modules that talk
   to Supabase swapped for the in-memory stand-ins in preview/ — so the notes
   surface can be looked at, on either breakpoint, without credentials, a
   network or a real archive. Never used by `pnpm build`. */
const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  server: { port: 5199 },
  resolve: {
    alias: [
      { find: /^@\/lib\/supabase$/, replacement: here("./preview/supabase.mock.ts") },
      { find: /^@\/lib\/session$/, replacement: here("./preview/session.mock.ts") },
      { find: /^@\/lib\/sync$/, replacement: here("./preview/sync.mock.ts") },
    ],
  },
  plugins: [
    TanStackRouterVite({
      routesDirectory: "./src/routes",
      generatedRouteTree: "./src/routeTree.gen.ts",
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
    tsConfigPaths(),
  ],
});
