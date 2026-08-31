/* The two probes.
 *
 * `/healthz` answers for this process and consults nothing: a Supabase outage
 * that made liveness fail would have every instance restarted for a fault that
 * is not theirs, which turns a recoverable outage into a crash loop.
 *
 * `/readyz` answers for the dependencies a document actually needs, each one
 * bounded, so an unreachable backend takes the instance out of rotation
 * instead of making the platform wait on a socket that will never reply.
 *
 * A deployment with no bus is a valid deployment — one instance — so "no Redis
 * configured" is not the same answer as "Redis did not reply". */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { Server } from "@hocuspocus/server";
import { localStack } from "./fixture.ts";
import { createCollaborationServer, type Context } from "./server.ts";

const stack = localStack();

function refuseToSkip(reason: string | false): string | false {
  if (reason && process.env.REQUIRE_INTEGRATION === "1") {
    throw new Error(`REQUIRE_INTEGRATION is set and the suite cannot run: ${reason}`);
  }
  return reason;
}

const skip = refuseToSkip(stack ? false : "run `supabase start` first");

interface Probe {
  status: number;
  body: { status: string; checks?: { supabase: boolean; redis: boolean | null } };
}

async function probe(port: number, path: string): Promise<Probe> {
  const response = await fetch(`http://127.0.0.1:${port}${path}`);
  return { status: response.status, body: await response.json() };
}

describe("the health probes", { skip }, () => {
  const local = stack!;
  const started: Server<Context>[] = [];

  function serve(port: number, overrides: { redisUrl?: string; supabaseUrl?: string } = {}) {
    const server = createCollaborationServer({
      supabaseUrl: overrides.supabaseUrl ?? local.apiUrl,
      publishableKey: local.publishableKey,
      serviceRoleKey: local.serviceRoleKey,
      allowedOrigins: ["http://localhost:5173"],
      port,
      redisUrl: overrides.redisUrl,
    });
    started.push(server);
    return server;
  }

  /* Ports of its own: this file runs alongside the other suites under
     `node --test`, and a shared port would make them fail each other. */
  const base = 9600 + Math.floor(Math.random() * 300);

  before(async () => {
    await Promise.all([
      serve(base).listen(),
      serve(base + 1, { redisUrl: "redis://127.0.0.1:6399" }).listen(),
      serve(base + 2, { supabaseUrl: "http://127.0.0.1:1" }).listen(),
    ]);
  });

  after(async () => {
    await Promise.all(started.map((server) => server.destroy()));
  });

  it("reports liveness without consulting anything", async () => {
    /* Pointed at a Supabase that is not there, and still alive: this is the
       distinction the two probes exist to make. */
    const alive = await probe(base + 2, "/healthz");
    assert.equal(alive.status, 200);
    assert.equal(alive.body.status, "ok");
  });

  it("is ready with Supabase up and no bus configured", async () => {
    const ready = await probe(base, "/readyz");
    assert.equal(ready.status, 200);
    assert.equal(ready.body.checks?.supabase, true);
    // Absent, not failed. A single instance needs no bus.
    assert.equal(ready.body.checks?.redis, null);
  });

  it("is not ready when the configured bus does not answer", async () => {
    const ready = await probe(base + 1, "/readyz");
    assert.equal(ready.status, 503);
    assert.equal(ready.body.checks?.supabase, true);
    assert.equal(ready.body.checks?.redis, false);
  });

  it("is not ready when Supabase does not answer", async () => {
    const ready = await probe(base + 2, "/readyz");
    assert.equal(ready.status, 503);
    assert.equal(ready.body.checks?.supabase, false);
  });

  it("is ready when the configured bus answers", async () => {
    const port = base + 3;
    const server = serve(port, { redisUrl: process.env.REDIS_URL ?? "redis://127.0.0.1:6380" });
    await server.listen();
    const ready = await probe(port, "/readyz");
    assert.equal(ready.status, 200);
    assert.equal(ready.body.checks?.redis, true);
  });
});
