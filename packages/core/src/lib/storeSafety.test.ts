import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Run the real module against a scripted `hidden_people` answer and a manual timer.
const compiled = ts.transpileModule(
  readFileSync(new URL("./storeSafety.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;

function load(answers: { data: unknown; error: unknown }[]) {
  const timers: (() => void)[] = [];
  const module = { exports: {} as Record<string, (...args: never[]) => unknown> };
  runInNewContext(compiled, {
    module,
    exports: module.exports,
    require: () => ({ supabase: { rpc: async () => answers.shift() } }),
    setTimeout: (run: () => void) => timers.push(run),
    clearTimeout: () => {},
  });
  const safety = module.exports as unknown as {
    refreshHiddenPeople(): Promise<void>;
    hiddenPeople(): ReadonlySet<string> | null;
    isHiddenPerson(id: string): boolean;
  };
  return { safety, timers };
}

test("nobody is shown until a lookup succeeds, and a failed one is retried", async () => {
  const { safety, timers } = load([
    { data: null, error: { message: "down" } },
    { data: ["blocked"], error: null },
  ]);
  await safety.refreshHiddenPeople();
  assert.equal(safety.hiddenPeople(), null);
  assert.equal(safety.isHiddenPerson("someone"), true);
  assert.equal(timers.length, 1);

  timers.shift()!();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual([...safety.hiddenPeople()!], ["blocked"]);
  assert.equal(safety.isHiddenPerson("blocked"), true);
  assert.equal(safety.isHiddenPerson("someone"), false);
});

test("a later failed refresh hides people again", async () => {
  const { safety } = load([
    { data: [], error: null },
    { data: null, error: { message: "down" } },
  ]);
  await safety.refreshHiddenPeople();
  assert.equal(safety.isHiddenPerson("someone"), false);
  await safety.refreshHiddenPeople();
  assert.equal(safety.hiddenPeople(), null);
  assert.equal(safety.isHiddenPerson("someone"), true);
});
