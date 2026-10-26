import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { probeSupabase } from "./health.ts";

test("readiness tolerates a slow database without requesting an exact count", async (t) => {
  const server = createServer((request, response) => {
    assert.equal(request.method, "HEAD");
    assert.equal(request.headers.prefer?.includes("count=exact") ?? false, false);
    assert.equal(new URL(request.url!, "http://localhost").searchParams.get("limit"), "1");
    setTimeout(() => response.writeHead(200).end(), 1350);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const address = server.address() as { port: number };
  const service = createClient(`http://127.0.0.1:${address.port}`, "test-key");
  assert.deepEqual(await probeSupabase(service), { ok: true, failure: null });
});

test("readiness aborts a hung database and still reports real HTTP failures", async (t) => {
  let status = 0;
  const server = createServer((_request, response) => {
    if (status) response.writeHead(status).end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const address = server.address() as { port: number };
  const service = createClient(`http://127.0.0.1:${address.port}`, "test-key");
  assert.deepEqual(await probeSupabase(service, 50), { ok: false, failure: "timeout" });
  status = 503;
  const failed = await probeSupabase(service);
  assert.equal(failed.ok, false);
  assert.match(failed.failure!, /HTTP 503/);
  status = 200;
  assert.deepEqual(await probeSupabase(service), { ok: true, failure: null });
});
