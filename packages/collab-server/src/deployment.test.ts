import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { checkOrigin, checkRevision } from "./deployment.ts";
import { createCollaborationServer } from "./server.ts";

test("deployment probes verify the running SHA and real origin upgrades without a database", async (t) => {
  const revision = "a".repeat(40);
  const server = createCollaborationServer({
    supabaseUrl: "http://127.0.0.1:1",
    publishableKey: "test-key",
    serviceRoleKey: "test-key",
    allowedOrigins: ["app://notes", "https://notes"],
    port: 0,
    revision,
  });
  await server.listen();
  t.after(() => server.destroy());
  const port = server.httpServer.address();
  assert.ok(port && typeof port !== "string");
  const http = new URL(`http://127.0.0.1:${port.port}`);
  const response = await fetch(new URL("/version", http));
  assert.equal(response.headers.get("cache-control"), "no-store");
  await checkRevision(http, revision);
  await assert.rejects(checkRevision(http, "b".repeat(40)), /expected revision/);
  for (const origin of ["app://notes", "https://notes"])
    await checkOrigin(`ws://127.0.0.1:${port.port}`, origin, true);
  await checkOrigin(`ws://127.0.0.1:${port.port}`, "https://foreign.example.invalid", false);
  await assert.rejects(
    checkOrigin(`ws://127.0.0.1:${port.port}`, "app://notes", false),
    /foreign origin/,
  );
  await assert.rejects(
    checkOrigin(`ws://127.0.0.1:${port.port}`, "https://foreign.example.invalid", true),
    /403/,
  );
});

test("HTTP success and a wrong HTTP error cannot masquerade as a WebSocket check", async (t) => {
  const server = createServer((_req, res) => res.writeHead(200).end("ok"));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const url = `ws://127.0.0.1:${address.port}`;
  await assert.rejects(checkOrigin(url, "app://notes", true), /200/);
  await assert.rejects(checkOrigin(url, "app://notes", false), /200/);
});
