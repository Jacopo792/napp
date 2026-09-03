import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";

/* The renderer. The same core the browser mounts, built for a window that
   loads it from `app://notes` rather than from a server. */
export default defineConfig(({ command, mode }) => {
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
  /* Both schemes for every host, and this is not belt and braces.
     Chromium does not match a `wss://host` request against an `https://host`
     source expression, whatever CSP3 says about scheme-part upgrades — so a
     policy naming only the Supabase https origin silently refused its Realtime
     socket while every ordinary request to the same host went through.
     Nothing looked broken: notes saved, the collaboration socket was fine, and
     the list simply never heard that a row had changed. An edit landed in
     Postgres and the "edited" line stayed where it was. */
  const remote = [env.VITE_SUPABASE_URL, env.VITE_COLLAB_URL]
    .filter((value): value is string => Boolean(value))
    .flatMap((value) => {
      const url = new URL(value);
      const secure = url.protocol === "https:" || url.protocol === "wss:";
      return [
        `${secure ? "https" : "http"}://${url.host}`,
        `${secure ? "wss" : "ws"}://${url.host}`,
      ];
    })
    .join(" ");
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
