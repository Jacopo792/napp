import assert from "node:assert/strict";
import test from "node:test";
import { readErasureRequest } from "./request.ts";

const url = "https://example.test/delete-account";
test("erasure accepts an object and rejects malformed JSON and other JSON shapes", async () => {
  assert.deepEqual(
    await readErasureRequest(new Request(url, { method: "POST", body: '{"confirm":true}' })),
    { confirm: true },
  );
  for (const body of ["", "{", "null", "[]", "true", '"delete"'])
    await assert.rejects(readErasureRequest(new Request(url, { method: "POST", body })));
});

test("erasure stops an oversized stream without relying on Content-Length", async () => {
  let canceled = false;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(new Uint8Array(4097));
    },
    cancel() {
      canceled = true;
    },
  });
  const request = new Request(url, {
    method: "POST",
    body: stream,
    duplex: "half",
  } as RequestInit);
  await assert.rejects(readErasureRequest(request), RangeError);
  assert.equal(canceled, true);
});

test("erasure limits UTF-8 bytes rather than JavaScript character count", async () => {
  const body = JSON.stringify({ password: "é".repeat(4100) });
  assert.ok(body.length < 8192);
  await assert.rejects(readErasureRequest(new Request(url, { method: "POST", body })), RangeError);
});
