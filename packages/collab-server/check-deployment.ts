import { readFile } from "node:fs/promises";
import { setTimeout as pause } from "node:timers/promises";
import { deploymentRevision, parseAllowedOrigins } from "./src/config.ts";
import { checkOrigin, checkRevision } from "./src/deployment.ts";

const origins = JSON.parse(
  await readFile(new URL("../../ops/collab-origins.json", import.meta.url), "utf8"),
);
const expected = parseAllowedOrigins(origins.production.join(","));
const address = new URL(process.env.VITE_COLLAB_URL ?? "");
if (
  !["wss:", "ws:"].includes(address.protocol) ||
  address.username ||
  address.password ||
  address.search ||
  address.hash
)
  throw new Error(
    "VITE_COLLAB_URL must be a public WebSocket URL without credentials or query parameters",
  );
const http = new URL(address);
http.protocol = address.protocol === "wss:" ? "https:" : "http:";
const revision = deploymentRevision(process.env.EXPECTED_REVISION);
const wait = Number(process.env.DEPLOY_WAIT_MS ?? 0);
if (!Number.isFinite(wait) || wait < 0 || wait > 900_000) throw new Error("Invalid DEPLOY_WAIT_MS");
if (revision) {
  const deadline = Date.now() + wait;
  for (;;) {
    try {
      await checkRevision(http, revision);
      break;
    } catch {
      if (Date.now() >= deadline)
        throw new Error("Deployment did not serve the expected revision before the deadline");
      await pause(Math.min(5000, Math.max(0, deadline - Date.now())));
    }
  }
}
const readiness = await fetch(new URL("/readyz", http), {
  signal: AbortSignal.timeout(15_000),
  redirect: "error",
});
if (!readiness.ok)
  throw new Error(`Deployed dependencies are not ready (HTTP ${readiness.status})`);
for (const origin of expected) {
  await checkOrigin(address.href, origin, true);
  console.log(`Origin accepted: ${origin}`);
}
await checkOrigin(address.href, "https://origin-check.example.invalid", false);
console.log(
  revision
    ? "Deployment revision and origin checks passed"
    : "Origin checks passed (revision not checked)",
);
