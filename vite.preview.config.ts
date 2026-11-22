import { ocrAssets } from "./scripts/ocrAssets";
import { defineConfig, loadEnv } from "vite";
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

export default defineConfig(({ mode }) => ({
  root: here(desktop ? "./apps/desktop" : "./apps/web"),
  envDir: here("."),
  /* The desktop port is the one the Electron window loads in development:
     5174, or `NAPP_DEV_PORT` when a second checkout runs its own window. */
  server: desktop
    ? { port: Number(process.env.NAPP_DEV_PORT) || 5174, strictPort: true }
    : { port: Number(process.env.PORT) || 5199 },
  /* Only the preview: the desktop renderer requires the published web origin
     (invitation and policy links), and the released build keeps requiring it.
     The fixture gets a placeholder unless one is set in the environment. */
  define: {
    "import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY": JSON.stringify("pk_preview"),
    "import.meta.env.VITE_PREVIEW_CHECKOUT_URL": JSON.stringify(
      desktop ? `http://localhost:${process.env.NAPP_PREVIEW_WEB_PORT || 5199}/` : "",
    ),
    "import.meta.env.VITE_WEB_ORIGIN": JSON.stringify(
      process.env.VITE_WEB_ORIGIN ||
        loadEnv(mode, here("."), "VITE_").VITE_WEB_ORIGIN ||
        "https://preview.example/",
    ),
  },
  resolve: {
    alias: [
      { find: /^@stripe\/react-stripe-js\/checkout$/, replacement: here("./preview/stripe.mock.tsx") },
      { find: /^@stripe\/stripe-js\/pure$/, replacement: here("./preview/stripe.mock.tsx") },
      {
        find: /^(?:@\/lib\/|\.\/)supabaseClient$/,
        replacement: here("./preview/supabaseClient.mock.ts"),
      },
      {
        find: /^@\/components\/PolicyGate$/,
        replacement: here("./preview/PolicyGate.mock.tsx"),
      },
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
      { find: /^@\/lib\/stickerPack$/, replacement: here("./preview/stickerPack.mock.ts") },
      { find: /^@\/lib\/plan$/, replacement: here("./preview/plan.mock.ts") },
      { find: /^@\/lib\/history$/, replacement: here("./preview/history.mock.ts") },
      { find: /^@\/lib\/mediaText$/, replacement: here("./preview/mediaText.mock.ts") },
      { find: /^@\/lib\/spaces$/, replacement: here("./preview/spaces.mock.ts") },
      { find: /^@\/lib\/drawHandoff$/, replacement: here("./preview/drawHandoff.mock.ts") },
    ],
  },
  plugins: [
    ocrAssets(),
    react(),
    tailwindcss(),
    tsConfigPaths({ root: here(".") }),
    /* Screenshots are taken in Blush, so a fresh preview opens in it. Only an
       empty store is seeded: a palette chosen in the preview stays. */
    {
      name: "preview-blush",
      transformIndexHtml: () => [
        {
          tag: "script",
          injectTo: "head-prepend" as const,
          children: `try{localStorage.getItem("napp:appearance:v1")||localStorage.setItem("napp:appearance:v1",'{"theme":"light","accent":"#b4606d","background":"#f6eeee","foreground":"#2c2325"}')}catch{}`,
        },
      ],
    },
  ],
}));
