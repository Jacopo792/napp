import assert from "node:assert/strict";
import { test } from "node:test";
import { processErasure, type ErasureBackend } from "./worker.ts";

function fixture(failRemoval = false) {
  const objects = [
    { bucket_id: "avatars", object_name: "user/avatar" },
    { bucket_id: "note-images", object_name: "archive/file" },
  ];
  const calls: string[] = [];
  const backend: ErasureBackend = {
    listObjects: async () => [...objects],
    remove: async (bucket) => {
      calls.push(`remove:${bucket}`);
      if (failRemoval) throw new Error("Storage unavailable");
    },
    acknowledge: async (_user, bucket, paths) => {
      calls.push(`ack:${bucket}`);
      for (let index = objects.length - 1; index >= 0; index--)
        if (objects[index].bucket_id === bucket && paths.includes(objects[index].object_name))
          objects.splice(index, 1);
    },
    finish: async () => {
      calls.push("finish");
      return true;
    },
  };
  return { backend, calls, objects };
}

test("the account is deleted only after all buckets have confirmed removal", async () => {
  const flow = fixture();
  assert.equal(await processErasure(flow.backend, "user", 10, () => 0), true);
  assert.deepEqual(flow.calls, [
    "remove:avatars",
    "ack:avatars",
    "remove:note-images",
    "ack:note-images",
    "finish",
  ]);
});

test("a Storage failure leaves the durable manifest untouched and never finishes", async () => {
  const flow = fixture(true);
  await assert.rejects(
    processErasure(flow.backend, "user", 10, () => 0),
    /unavailable/,
  );
  assert.equal(flow.objects.length, 2);
  assert.deepEqual(flow.calls, ["remove:avatars"]);
});

test("a worker timeout yields to the next scheduled run without reporting completion", async () => {
  const flow = fixture();
  assert.equal(await processErasure(flow.backend, "user", 10, () => 10), false);
  assert.deepEqual(flow.calls, []);
});

test("a crash after removal retries the same file before finishing", async () => {
  const flow = fixture();
  const acknowledge = flow.backend.acknowledge;
  flow.backend.acknowledge = async () => {
    throw new Error("Interrupted");
  };
  await assert.rejects(
    processErasure(flow.backend, "user", 10, () => 0),
    /Interrupted/,
  );
  flow.backend.acknowledge = acknowledge;
  assert.equal(await processErasure(flow.backend, "user", 10, () => 0), true);
  assert.deepEqual(flow.calls.slice(0, 3), ["remove:avatars", "remove:avatars", "ack:avatars"]);
});
