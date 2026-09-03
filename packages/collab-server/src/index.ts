/* Bootstrap: read the environment, start the server, stop it cleanly. */
import { createCollaborationServer } from "./server.ts";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

function optionalNumber(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} is not a number`);
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
  /* The bus between instances. Absent, this process assumes it is the only
     one — which is true of a single Render instance and false the moment a
     deploy overlaps two. */
  redisUrl: process.env.REDIS_URL?.trim() || undefined,
  instanceName: process.env.RENDER_INSTANCE_ID?.trim() || undefined,
  authorizationTtl: optionalNumber("AUTHORIZATION_TTL_MS", 5000),
  tokenRefresh: optionalNumber("TOKEN_REFRESH_MS", 60_000),
});

await server.listen();
console.log(
  `collaboration server listening on ${port}` +
    (process.env.REDIS_URL ? " (clustered)" : " (single instance)"),
);

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
