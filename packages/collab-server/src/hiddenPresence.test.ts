import test from "node:test";
import assert from "node:assert/strict";
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import { withoutHiddenPresence } from "./hiddenPresence.ts";

function awareness(type: number, entries: [number, string | null][]) {
  const states = encoding.createEncoder();
  encoding.writeVarUint(states, entries.length);
  for (const [client, userId] of entries) {
    encoding.writeVarUint(states, client);
    encoding.writeVarUint(states, 1);
    encoding.writeVarString(states, JSON.stringify(userId ? { user: { userId } } : null));
  }
  const out = encoding.createEncoder();
  encoding.writeVarString(out, "note:1");
  encoding.writeVarUint(out, type);
  encoding.writeVarUint8Array(out, encoding.toUint8Array(states));
  return encoding.toUint8Array(out);
}

function clients(message: Uint8Array) {
  const decoder = decoding.createDecoder(message);
  decoding.readVarString(decoder);
  decoding.readVarUint(decoder);
  const update = decoding.createDecoder(decoding.readVarUint8Array(decoder));
  const ids: number[] = [];
  for (let n = decoding.readVarUint(update); n > 0; n--) {
    ids.push(decoding.readVarUint(update));
    decoding.readVarUint(update);
    decoding.readVarString(update);
  }
  return ids;
}

test("presence across a block never reaches the recipient", () => {
  const message = awareness(1, [
    [1, "me"],
    [2, "blocked"],
    [3, "friend"],
    [4, null],
  ]);
  assert.deepEqual(clients(withoutHiddenPresence(message, new Set(["blocked"]), "me")!), [1, 3, 4]);
  assert.equal(
    withoutHiddenPresence(message, new Set(), "me"),
    message,
    "nothing hidden, same bytes",
  );
  assert.deepEqual(
    clients(withoutHiddenPresence(message, null, "me")!),
    [1, 4],
    "unverified: only self",
  );
  assert.equal(
    withoutHiddenPresence(awareness(1, [[2, "blocked"]]), new Set(["blocked"]), "me"),
    null,
  );
  const sync = awareness(0, [[2, "blocked"]]);
  assert.equal(withoutHiddenPresence(sync, new Set(["blocked"]), "me"), sync, "documents pass");
});
