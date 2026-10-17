import assert from "node:assert/strict";
import test from "node:test";
import { restoreKeptVersion } from "./historyRestore.ts";
const body = (title: string) => ({
  title,
  content: {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: title }] }],
  },
});

test("a restore keeps the live unsaved body before applying the earlier one", async () => {
  const live = body("unsaved");
  const earlier = body("earlier");
  const events: string[] = [];
  const kept = await restoreKeptVersion({
    current: () => live,
    canWrite: () => true,
    earlier,
    keep: async (value) => {
      assert.deepEqual(value, live);
      events.push("keep");
      return "version-id";
    },
    apply: (value) => {
      assert.deepEqual(value, earlier);
      events.push("apply");
    },
  });
  assert.equal(kept, "version-id");
  assert.deepEqual(events, ["keep", "apply"]);
});

test("an unsuccessful preservation leaves the document untouched", async () => {
  await assert.rejects(
    restoreKeptVersion({
      current: () => body("live"),
      canWrite: () => true,
      earlier: body("old"),
      keep: async () => {
        throw new Error("offline");
      },
      apply: () => assert.fail("must not restore"),
    }),
    /offline/,
  );
});

test("a lock arriving during preservation prevents a restore", async () => {
  let writable = true;
  await assert.rejects(
    restoreKeptVersion({
      current: () => body("live"),
      canWrite: () => writable,
      earlier: body("old"),
      keep: async () => {
        writable = false;
      },
      apply: () => assert.fail("must not restore"),
    }),
    /became read-only/,
  );
});

test("a collaborator changing either body or title during preservation prevents a restore", async () => {
  for (const change of ["title", "content"]) {
    const live = body("live");
    await assert.rejects(
      restoreKeptVersion({
        current: () => live,
        canWrite: () => true,
        earlier: body("old"),
        keep: async () => {
          if (change === "title") live.title = "changed";
          else live.content.content[0].content[0].text = "another hand";
        },
        apply: () => assert.fail("must not restore"),
      }),
      /note changed/,
    );
  }
});

test("read-only and not-yet-loaded notes cannot create or restore a version", async () => {
  for (const writable of [false, true]) {
    await assert.rejects(
      restoreKeptVersion({
        current: () => null,
        canWrite: () => writable,
        earlier: body("old"),
        keep: async () => assert.fail("must not save"),
        apply: () => assert.fail("must not restore"),
      }),
      writable ? /still loading/ : /read-only/,
    );
  }
});
