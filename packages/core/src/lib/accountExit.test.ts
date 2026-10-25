import assert from "node:assert/strict";
import { test } from "node:test";
import { signOutWithDeviceCleanup } from "./accountExit.ts";

test("native sign-out clears the editor before the transition unmounts its cleanup host", async () => {
  let hostMounted = true;
  let editorHasContent = true;
  await signOutWithDeviceCleanup({
    writes: Promise.resolve(),
    removeContent: async () => {
      if (hostMounted) editorHasContent = false;
    },
    leave: async () => {
      hostMounted = false;
      // This models onAccountChange: teardown happens before its auth action.
      assert.equal(
        editorHasContent,
        false,
        "removing the host first would silently skip its cleanup",
      );
    },
  });
  assert.equal(hostMounted, false);
});

test("a failed editor cleanup keeps the native account host and credentials available", async () => {
  let transitioned = false;
  await assert.rejects(
    signOutWithDeviceCleanup({
      writes: Promise.resolve(),
      removeContent: async () => {
        throw new Error("WebView did not acknowledge cleanup");
      },
      leave: async () => {
        transitioned = true;
      },
    }),
    /did not acknowledge/,
  );
  assert.equal(transitioned, false);
});
