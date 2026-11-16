import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { setTimeout as tick } from "node:timers/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("./appearance.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

/* Switching account reloads with the previous account's appearance, then
   applies this account's. A wallpaper turned on that way must still show the
   picture this device holds, or a Mac's columns fall through to the material. */
test("a wallpaper switched on after boot shows the picture the device holds", async () => {
  const classes = new Set<string>();
  const storage = new Map([["napp:appearance:v1", JSON.stringify({ wallpaper: false })]]);
  const held = new Blob(["picture"], { type: "image/webp" });
  const later = <T>(request: { onsuccess?: () => void; result?: T }, result: T) => {
    request.result = result;
    queueMicrotask(() => request.onsuccess?.());
    return request;
  };
  const db = {
    transaction: () => ({ objectStore: () => ({ get: () => later({}, held) }) }),
  };
  const exports = {} as typeof import("./appearance");
  runInNewContext(compiled, {
    exports,
    URL,
    Blob,
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
    indexedDB: { open: () => later({}, db) },
    window: { matchMedia: () => ({ matches: true, addEventListener: () => {} }) },
    document: {
      documentElement: {
        dataset: {},
        style: { setProperty: () => {}, removeProperty: () => {} },
        classList: {
          toggle: (name: string, on: boolean) => (on ? classes.add(name) : classes.delete(name)),
        },
      },
      querySelector: () => null,
    },
    require: (name: string) => {
      if (name === "react") return { useSyncExternalStore: () => {} };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });

  exports.initAppearance();
  await tick(0);
  assert.equal(classes.has("has-wallpaper"), false);

  exports.setAppearance({ ...exports.currentAppearance(), wallpaper: true });
  await tick(0);
  assert.equal(classes.has("has-wallpaper"), true);
});
