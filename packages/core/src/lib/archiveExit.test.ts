import assert from "node:assert/strict";
import test from "node:test";
import { NOT_SAVED, STILL_SAVING, departArchive, enterArchive } from "./archiveExit.ts";

function exit(options: { waiting?: boolean; remaining?: string[] | Error } = {}) {
  const log: string[] = [];
  return {
    log,
    settle: async () => void log.push("settle"),
    waiting: () => options.waiting ?? false,
    enter: async (id: string) => void log.push(`enter ${id}`),
    remaining: async () => {
      log.push("remaining");
      if (options.remaining instanceof Error) throw options.remaining;
      return options.remaining ?? [];
    },
    clearDrafts: () => void log.push("clear"),
    signOut: async () => void log.push("sign out"),
  };
}

const act = (log: string[]) => async () => void log.push("act");

test("switching settles the writes, then enters the other archive", async () => {
  const e = exit();
  await enterArchive("a", "b", e);
  assert.deepEqual(e.log, ["settle", "enter b"]);
});

test("switching to the archive on screen does nothing", async () => {
  const e = exit();
  await enterArchive("a", "a", e);
  assert.deepEqual(e.log, []);
});

test("writes still waiting keep the window where it is", async () => {
  const e = exit({ waiting: true });
  await assert.rejects(enterArchive("a", "b", e), { message: STILL_SAVING });
  assert.deepEqual(e.log, ["settle"]);
});

test("leaving refuses before the act while writes are waiting", async () => {
  const e = exit({ waiting: true });
  await assert.rejects(departArchive("a", act(e.log), e), { message: NOT_SAVED });
  assert.deepEqual(e.log, ["settle"]);
});

test("leaving goes on to another archive, never the one just left", async () => {
  const e = exit({ remaining: ["a", "c", "d"] });
  await departArchive("a", act(e.log), e);
  assert.deepEqual(e.log, ["settle", "act", "clear", "remaining", "enter c"]);
});

test("with no archive left, or none known, the window goes to the door", async () => {
  for (const remaining of [["a"], new Error("offline")]) {
    const e = exit({ remaining });
    await departArchive("a", act(e.log), e);
    assert.deepEqual(e.log, ["settle", "act", "clear", "remaining", "sign out"]);
  }
});

test("a failed act leaves drafts and the window alone", async () => {
  const e = exit({ remaining: ["b"] });
  const failing = async () => {
    throw new Error("refused");
  };
  await assert.rejects(departArchive("a", failing, e), /refused/);
  assert.deepEqual(e.log, ["settle"]);
});
