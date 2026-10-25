import assert from "node:assert/strict";
import { test } from "node:test";
import { accountDocumentStores } from "./accountContentShape.ts";

test("device content removal is scoped to the exact account across all archives", () => {
  const names = [
    undefined,
    "napp:notes",
    "napp:yjs:a:one:n",
    "napp:yjs:b:one:m",
    "napp:yjs:a:someone:n",
    "napp:yjs:one:two:n",
    "napp:yjs:a:two:one",
    "napp:yjs::one:n",
    "napp:yjs:a:one:",
    "other:yjs:a:one:n",
  ];
  assert.deepEqual(accountDocumentStores(names, "one"), ["napp:yjs:a:one:n", "napp:yjs:b:one:m"]);
  assert.deepEqual(accountDocumentStores(names, ""), []);
});
