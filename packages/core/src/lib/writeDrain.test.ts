import assert from "node:assert/strict";
import test from "node:test";
import { RETRY_MAX_MS, RETRY_MIN_MS, nextRetryDelay, waitUntilIdle } from "./writeDrain.ts";

test("retries back off by doubling, up to the ceiling", () => {
  assert.equal(nextRetryDelay(RETRY_MIN_MS), RETRY_MIN_MS * 2);
  assert.equal(nextRetryDelay(RETRY_MAX_MS), RETRY_MAX_MS);
  assert.equal(nextRetryDelay(RETRY_MAX_MS - 1), RETRY_MAX_MS);
});

test("waiting returns once the save in flight is done", async () => {
  let checks = 0;
  const stillBusy = await waitUntilIdle(() => ++checks < 3, Infinity, 1);
  assert.equal(stillBusy, false);
  assert.ok(checks >= 3);
});

test("a bounded wait gives up and says it is still busy", async () => {
  const started = Date.now();
  assert.equal(await waitUntilIdle(() => true, 20, 5), true);
  assert.ok(Date.now() - started < 1000);
});

test("nothing in flight means no wait at all", async () => {
  assert.equal(await waitUntilIdle(() => false, 0), false);
});
