import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";

/* The renderer. The same core the browser mounts, built for a window that
   loads it from `app://notes` rather than from a server. */
export default defineConfig(({ mode }) => {
  const root = new URL("../../", import.meta.url).pathname;
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

  return {
    /* Relative, because the built index.html is fetched from app://notes and
       an absolute /assets/… would be a request for the root of that scheme. */
    base: "./",
    envDir: root,
    server: { port: 5174, strictPort: true },
    build: { outDir: "dist", emptyOutDir: true, chunkSizeWarningLimit: 1400 },
    plugins: [react(), tailwindcss(), tsConfigPaths({ root }), contentSecurityPolicy(env)],
  };
});

/* Production HTML only. The dev server needs the inline script and the
   websocket that hot reload is made of, and a policy strict enough to be worth
   having would refuse both — so dev gets none, and what ships gets one that
   names the two remote origins it is actually allowed to reach. It lives here,
   and not in the main process, because these values are the renderer's: the
   packaged main process has no .env to read them back out of. */
function contentSecurityPolicy(env: Record<string, string | undefined>): Plugin {
  const remote = [env.VITE_SUPABASE_URL, env.VITE_COLLAB_URL].filter(Boolean).join(" ");
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    /* The interface sets a style attribute from React on a great many
       elements, and a style attribute is what 'unsafe-inline' governs. */
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${remote}`,
    "font-src 'self' data:",
    `connect-src 'self' data: blob: ${remote}`,
    "media-src 'self' data: blob:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "frame-src 'none'",
    "base-uri 'none'",
  ].join("; ");

  return {
    name: "napp:content-security-policy",
    transformIndexHtml: {
      order: "pre",
      handler: (html, context) =>
        context.server
          ? html
          : html.replace(
              "<!--content-security-policy-->",
              `<meta http-equiv="Content-Security-Policy" content="${policy}" />`,
            ),
    },
  };
}
