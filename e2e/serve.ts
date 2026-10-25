import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createCollaborationServer } from "../packages/collab-server/src/server.ts";
import { localStack } from "./local.ts";

const full = process.argv[2] === "fullstack";
const port = full ? 5200 : 5198;
let collaboration: ReturnType<typeof createCollaborationServer> | undefined;
// Test-only, loopback-only. Teardown waits for actual stores and version
// settling, rather than deleting fixture rows under a server still flushing.
const control = createServer((request, response) => {
  if (request.url !== "/idle") {
    response.writeHead(404).end();
    return;
  }
  const server = collaboration?.hocuspocus;
  const idle =
    server &&
    !server.documents.size &&
    !server.loadingDocuments.size &&
    !server.unloadingDocuments.size;
  response.writeHead(idle ? 204 : 503).end();
});
const env = { ...process.env, VITE_BASE_PATH: "/" };
if (full) {
  const stack = localStack();
  Object.assign(env, {
    VITE_SUPABASE_URL: stack.url,
    VITE_SUPABASE_PUBLISHABLE_KEY: stack.key,
    VITE_COLLAB_URL: "ws://127.0.0.1:1235",
    VITE_WEB_ORIGIN: `http://127.0.0.1:${port}/`,
  });
  collaboration = createCollaborationServer({
    supabaseUrl: stack.url,
    publishableKey: stack.key,
    serviceRoleKey: stack.serviceKey,
    allowedOrigins: [`http://127.0.0.1:${port}`],
    port: 1235,
  });
  await collaboration.listen();
  await new Promise<void>((resolve) => control.listen(1236, "127.0.0.1", resolve));
}
const args = full
  ? [
      "--filter",
      "@notes-app/web",
      "dev",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort",
    ]
  : [
      "exec",
      "vite",
      "--config",
      "vite.preview.config.ts",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort",
    ];
const child = spawn("pnpm", args, { env, stdio: "inherit" });
let stopping = false;
async function stop(code: number) {
  if (stopping) return;
  stopping = true;
  child.kill("SIGTERM");
  await collaboration?.destroy();
  control.close();
  process.exit(code);
}
child.on("error", () => void stop(1));
child.on("exit", (code) => void stop(code ?? 1));
for (const signal of ["SIGTERM", "SIGINT"] as const) process.on(signal, () => void stop(0));
