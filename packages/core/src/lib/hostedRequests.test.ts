import assert from "node:assert/strict";
import test from "node:test";
import { HostedRequests } from "./hostedRequests.ts";

test("out-of-order responses settle only their own command", async () => {
  const requests = new HostedRequests();
  const first = requests.request("first", () => {}, 1000);
  const second = requests.request("second", () => {}, 1000);
  requests.settle("second", 2);
  requests.settle("first", 1);
  assert.deepEqual(await Promise.all([first, second]), [1, 2]);
  assert.equal(requests.settle("first", "duplicate"), false);
});
test("closing a note rejects outstanding commands and ignores late responses", async () => {
  const requests = new HostedRequests();
  const closing = assert.rejects(
    requests.request("old", () => {}, 1000),
    /note closed/,
  );
  requests.reset("note closed");
  await closing;
  const next = requests.request("new", () => {}, 1000);
  assert.equal(requests.settle("old", "late"), false);
  requests.settle("new", "new body");
  assert.equal(await next, "new body");
});
test("failed injection rejects immediately and releases its request", async () => {
  const requests = new HostedRequests();
  await assert.rejects(
    requests.request(
      "failed",
      () => {
        throw new Error("WebView gone");
      },
      1000,
    ),
    /WebView gone/,
  );
  assert.equal(requests.settle("failed"), false);
});
test("a timeout does not consume a different request", async () => {
  const requests = new HostedRequests();
  const other = requests.request("other", () => {}, 1000);
  await assert.rejects(
    requests.request("slow", () => {}, 5),
    /timed out/,
  );
  requests.settle("other", "still here");
  assert.equal(await other, "still here");
});
test("an accidental duplicate id cannot replace the existing recipient", async () => {
  const requests = new HostedRequests();
  const original = requests.request("same", () => {}, 1000);
  await assert.rejects(
    requests.request("same", () => assert.fail("must not send"), 1000),
    /Duplicate/,
  );
  requests.settle("same", "original");
  assert.equal(await original, "original");
});
