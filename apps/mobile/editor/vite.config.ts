import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";

/* The note page, built into one HTML file with everything inside it.
 *
 * The WebView is handed this file as a string with `https://notes` as its base
 * URL, because that origin is what the collaboration server accepts and what
 * IndexedDB keeps the Yjs stores under. Nothing answers at that address, so
 * the page may load nothing from it: the script, the stylesheet and the fonts
 * all travel inside the HTML. `NAPP_PREVIEW=1` swaps in the same stand-ins
 * `vite.preview.config.ts` does. */
const root = fileURLToPath(new URL("../../../", import.meta.url));
const mobileCollabUrl = createRequire(import.meta.url)("../collab-url.cjs");
const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

const MOCKED = [
  "supabaseClient",
  "supabase",
  "session",
  "sync",
  "presence",
  "accountPreferences",
  "collab",
  "comments",
  "history",
  "mediaText",
  "spaces",
];

function inline(): Plugin {
  return {
    name: "napp-inline",
    enforce: "post",
    transformIndexHtml(html) {
      return html.replace(
        "</head>",
        `<meta name="napp-editor-mode" content="${process.env.NAPP_PREVIEW === "1" ? "preview" : "production"}"></head>`,
      );
    },
    // Vite resolves dynamic-import preload markers in its generateBundle.
    // Inline only after that pass, or lazy exports retain __VITE_PRELOAD__.
    generateBundle: {
      order: "post",
      handler(_options, bundle) {
        const page = bundle["index.html"];
        if (page?.type !== "asset") return;
        let html = String(page.source);
        for (const [name, file] of Object.entries(bundle)) {
          if (file.type === "chunk") {
            if (file.code.includes("__VITE_PRELOAD__"))
              this.error(`Unresolved preload marker in ${name}`);
            /* A `</script>` inside the code would end the tag that holds it. */
            const code = file.code.replace(/<\/script/gi, "<\\/script");
            html = html.replace(
              new RegExp(`<script[^>]*src="[^"]*${name}"[^>]*></script>`),
              () => `<script type="module">${code}</script>`,
            );
            delete bundle[name];
          } else if (name.endsWith(".css")) {
            html = html.replace(
              new RegExp(`<link[^>]*href="[^"]*${name}"[^>]*>`),
              () => `<style>${String(file.source)}</style>`,
            );
            delete bundle[name];
          }
        }
        page.source = html;
      },
    },
  };
}

export default defineConfig({
  root: here("."),
  base: "./",
  envDir: root,
  define: { "import.meta.env.VITE_COLLAB_URL": JSON.stringify(mobileCollabUrl()) },
  resolve: {
    /* The stand-ins in preview/ sit outside every package, where `react` does
       not resolve; one copy, from here, for them and for the core alike. */
    dedupe: ["react", "react-dom"],
    alias:
      process.env.NAPP_PREVIEW === "1"
        ? MOCKED.map((lib) => ({
            find: new RegExp(`^@/lib/${lib}$`),
            replacement: `${root}preview/${lib}.mock.ts`,
          }))
        : [],
  },
  build: {
    outDir: here("dist"),
    emptyOutDir: true,
    target: "es2022",
    cssCodeSplit: false,
    assetsInlineLimit: () => true,
    modulePreload: false,
    chunkSizeWarningLimit: 8000,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
  plugins: [react(), tailwindcss(), tsConfigPaths({ root }), inline()],
});
