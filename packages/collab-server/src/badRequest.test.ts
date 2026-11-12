/* A request line that does not parse is answered, not thrown: an exception in
 * the request hook is an unhandled rejection, and that ends the process for
 * everybody connected to it. Needs no database — nothing is consulted. */
import assert from "node:assert/strict";
import { connect } from "node:net";
import test from "node:test";
import { createCollaborationServer } from "./server.ts";

test("an unparseable request path gets 400 and the server stays up", async () => {
  const port = 14000 + Math.floor(Math.random() * 1000);
  const server = createCollaborationServer({
    port,
    supabaseUrl: "http://127.0.0.1:9",
    serviceRoleKey: "x",
    publishableKey: "x",
    allowedOrigins: ["http://localhost:5173"],
  } as Parameters<typeof createCollaborationServer>[0]);
  await server.listen();
  try {
    // fetch() would normalise the path; a raw socket sends it as written.
    const status = await new Promise<string>((resolve, reject) => {
      const socket = connect(port, "127.0.0.1", () =>
        socket.write("GET // HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n"),
      );
      socket.once("data", (chunk) => resolve(chunk.toString().split("\r\n")[0]));
      socket.once("error", reject);
    });
    assert.match(status, / 400 /);
    const alive = await fetch(`http://127.0.0.1:${port}/healthz`);
    assert.equal(alive.status, 200);
  } finally {
    await server.destroy();
  }
});
