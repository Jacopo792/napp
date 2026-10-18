import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { DEFAULT_APPEARANCE } from "./appearance.ts";
import { DEFAULT_AXES } from "./axes.ts";
import { DEFAULT_WRITING_PREFERENCES } from "./writingPreferences.ts";
import * as shape from "./preferenceShape.ts";

const compiled = ts.transpileModule(
  readFileSync(new URL("./accountPreferences.ts", import.meta.url), "utf8"),
  {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  },
).outputText;
const session = { userId: "first", email: "first@example.invalid", archiveId: "notes" };
const custom = shape.accountPreferences(
  { ...DEFAULT_APPEARANCE, accent: "#123456" },
  DEFAULT_AXES,
  DEFAULT_WRITING_PREFERENCES,
  { ...shape.DEFAULT_FLAGS, presence: true },
  {},
  { appearance: { ...DEFAULT_APPEARANCE, background: "#abcdef" } },
);
function fixture() {
  let appearance = { ...DEFAULT_APPEARANCE };
  let axes = { ...DEFAULT_AXES };
  let writing = { ...DEFAULT_WRITING_PREFERENCES };
  const writes: { user_id: string; preferences: shape.AccountPreferences }[] = [];
  const timers = new Map<number, () => void>();
  const storage = new Map<string, string>();
  const controls = {
    fail: false,
    read: Promise.resolve({ data: { preferences: custom }, error: null }),
  };
  let receive: ((payload: { new: { preferences: shape.AccountPreferences } }) => void) | undefined;
  const channel = {
    on: (_event: unknown, _filter: unknown, handler: typeof receive) => {
      receive = handler;
      return channel;
    },
    subscribe: () => channel,
  };
  const supabase = {
    from: () => ({
      select() {
        return this;
      },
      eq() {
        return this;
      },
      maybeSingle: () => controls.read,
      upsert: async (row: (typeof writes)[number]) => {
        writes.push(row);
        return { error: controls.fail ? { message: "Write refused" } : null };
      },
    }),
    channel: () => channel,
  };
  const api = {} as typeof import("./accountPreferences");
  runInNewContext(compiled, {
    exports: api,
    console,
    window: {
      clearTimeout: (id: number) => timers.delete(id),
      setTimeout: (run: () => void) => {
        const id = timers.size + 1;
        timers.set(id, run);
        return id;
      },
    },
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
    require: (name: string) => {
      if (name === "./preferenceShape.ts") return shape;
      if (name === "./supabaseClient")
        return {
          supabase,
          fail: (error: unknown) => {
            if (error) throw error;
          },
        };
      if (name === "./appearance")
        return {
          DEFAULT_APPEARANCE,
          currentAppearance: () => appearance,
          setAppearance: (value: typeof appearance) => {
            appearance = value;
          },
          wallpaperBlob: async () => null,
        };
      if (name === "./axes")
        return {
          DEFAULT_AXES,
          currentAxes: () => axes,
          setAxes: (value: typeof axes) => {
            axes = value;
          },
        };
      if (name === "./writingPreferences")
        return {
          DEFAULT_WRITING_PREFERENCES,
          currentWritingPreferences: () => writing,
          setWritingPreferences: (value: typeof writing) => {
            writing = value;
          },
        };
      if (name === "@/features/editor/lib/proofread")
        return { loadProofreaderPreference: () => true, saveProofreaderPreference: () => {} };
      if (name === "@/features/editor/lib/autocorrect")
        return { loadAutocorrectPreference: () => true, saveAutocorrectPreference: () => {} };
      if (name === "./autoLock") return { loadAutoLock: () => 0, saveAutoLock: () => {} };
      if (name === "./whatsNew.ts") return { localWhatsNewSeen: () => "" };
      if (["./archiveAssets", "./image"].includes(name)) return {};
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  return {
    api,
    writes,
    timers,
    controls,
    appearance: () => appearance,
    receive: (preferences: shape.AccountPreferences) => receive?.({ new: { preferences } }),
  };
}
test("native account change flushes pending preferences before clearing the old account", async () => {
  const f = fixture();
  await f.api.pullAccountPreferences(session);
  f.api.pushAccountPreferences(session, { ...custom, collaborators: false });
  await f.api.releaseAccountPreferences(session);
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0].user_id, "first");
  assert.equal(f.writes[0].preferences.collaborators, false);
  assert.equal(f.timers.size, 0);
  const fresh = f.api.localPreferences({}, "second");
  assert.equal(fresh.phone, undefined);
  assert.equal(fresh.presence, shape.DEFAULT_FLAGS.presence);
  assert.equal(fresh.appearance.accent, DEFAULT_APPEARANCE.accent);
});
test("a delayed preference read cannot overwrite the next account", async () => {
  const f = fixture();
  let complete!: (value: { data: { preferences: shape.AccountPreferences }; error: null }) => void;
  f.controls.read = new Promise((resolve) => {
    complete = resolve;
  });
  const late = f.api.pullAccountPreferences(session);
  await f.api.releaseAccountPreferences();
  complete({ data: { preferences: custom }, error: null });
  await assert.rejects(late, /Account changed/);
  assert.equal(f.appearance().accent, DEFAULT_APPEARANCE.accent);
});
test("a late realtime callback from an old account cannot reapply its appearance", async () => {
  const f = fixture();
  f.api.subscribeToAccountPreferences(session, () => assert.fail("Old account received a change"));
  await f.api.releaseAccountPreferences();
  f.receive(custom);
  assert.equal(f.appearance().accent, DEFAULT_APPEARANCE.accent);
});
test("a refused preference flush keeps the current account and its pending values", async () => {
  const f = fixture();
  await f.api.pullAccountPreferences(session);
  f.api.pushAccountPreferences(session, { ...custom, collaborators: false });
  f.controls.fail = true;
  await assert.rejects(f.api.releaseAccountPreferences(session), /Write refused/);
  assert.equal(f.api.localPreferences({}, session.userId).collaborators, false);
});
