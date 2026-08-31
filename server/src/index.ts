/* Bootstrap: read the environment, start the server, stop it cleanly. */
import { createCollaborationServer } from "./server.ts";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

const port = Number(process.env.PORT ?? 8080);
const server = createCollaborationServer({
  supabaseUrl: required("SUPABASE_URL"),
  publishableKey: required("SUPABASE_PUBLISHABLE_KEY"),
  serviceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  allowedOrigins: required("ALLOWED_ORIGINS")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  port,
});

await server.listen();
console.log(`collaboration server listening on ${port}`);

/* Render replaces an instance by sending SIGTERM and waiting. Every document
   still open has edits that may be inside the debounce window, so the flush has
   to finish before the process does — otherwise a deploy quietly drops the last
   few seconds of everybody's typing. */
let stopping = false;
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    console.log(`${signal}: flushing open documents`);
    server
      .destroy()
      .then(() => {
        console.log("flushed, closing");
        process.exit(0);
      })
      .catch((error: unknown) => {
        console.error("failed to flush on shutdown", error);
        process.exit(1);
      });
  });
}
