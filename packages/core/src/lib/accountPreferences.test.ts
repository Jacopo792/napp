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
function fixture(kind: "desktop" | "mobile" = "desktop", storage = new Map<string, string>()) {
  let appearance = { ...DEFAULT_APPEARANCE };
  let axes = { ...DEFAULT_AXES };
  let writing = { ...DEFAULT_WRITING_PREFERENCES };
  const appearances: (typeof appearance)[] = [];
  const downloads: string[] = [];
  const adopted: Blob[] = [];
  const writes: { user_id: string; preferences: shape.AccountPreferences }[] = [];
  const timers = new Map<number, () => void>();
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
      if (name === "../platform") return { platform: () => ({ kind }) };
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
            appearances.push(value);
          },
          wallpaperBlob: async () => null,
          adoptWallpaper: async (blob: Blob) => {
            adopted.push(blob);
          },
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
      if (name === "./archiveAssets")
        return {
          downloadObject: async (_session: unknown, id: string) => {
            downloads.push(id);
            return new Blob([id]);
          },
        };
      if (name === "./image") return {};
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  return {
    api,
    writes,
    timers,
    controls,
    appearance: () => appearance,
    appearances,
    downloads,
    adopted,
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

test("phone pulls and foreground refreshes never apply the desktop look", async () => {
  const f = fixture("mobile");
  const row = {
    ...custom,
    appearance: {
      ...custom.appearance,
      theme: "light" as const,
      wallpaper: true,
      wallpaperObject: "desktop-picture",
    },
    phone: {
      appearance: {
        ...DEFAULT_APPEARANCE,
        theme: "dark" as const,
        accent: "#c4643f",
        wallpaper: true,
        wallpaperObject: "phone-picture",
      },
    },
  };
  f.controls.read = Promise.resolve({ data: { preferences: row }, error: null });
  const first = await f.api.pullAccountPreferences(session);
  // The native provider can legitimately skip an unchanged row on wake.
  assert.equal(JSON.stringify(await f.api.pullAccountPreferences(session)), JSON.stringify(first));
  assert.equal(f.appearances.length, 1);
  for (const applied of f.appearances) {
    assert.equal(applied.theme, "dark");
    assert.equal(applied.accent, "#c4643f");
    assert.equal(applied.wallpaperObject, "phone-picture");
  }
  assert.equal(f.downloads.length, 0);
  assert.equal(f.adopted.length, 0);
  // Selecting the phone view must not mutate the account's desktop branch.
  assert.equal(first.appearance.wallpaperObject, "desktop-picture");
});

test("desktop Realtime changes leave the phone theme and wallpaper intact", async () => {
  const f = fixture("mobile");
  await f.api.pullAccountPreferences(session);
  let heard = 0;
  f.api.subscribeToAccountPreferences(session, () => {
    heard += 1;
  });
  f.receive({
    ...custom,
    appearance: {
      ...custom.appearance,
      theme: "light",
      wallpaper: true,
      wallpaperObject: "desktop-changed",
    },
    collaborators: false,
  });
  assert.equal(heard, 1);
  assert.equal(f.appearances.length, 1);
  assert.equal(f.appearance().theme, custom.phone!.appearance!.theme);
  assert.equal(f.appearance().background, "#abcdef");
  assert.equal(f.appearance().wallpaperObject, null);
  assert.equal(f.downloads.length, 0);
  // Other account preferences still sync, and subsequent native writes retain
  // the latest desktop branch rather than restoring its stale cached values.
  const current = f.api.localPreferences({}, session.userId);
  assert.equal(current.collaborators, false);
  assert.equal(current.appearance.wallpaperObject, "desktop-changed");
  f.controls.read = Promise.resolve({ data: { preferences: current }, error: null });
  f.api.pushAccountPreferences(session, { ...current, collaborators: true });
  await f.api.releaseAccountPreferences(session);
  assert.equal(f.writes[0].preferences.appearance.wallpaperObject, "desktop-changed");
  assert.equal(f.writes[0].preferences.phone?.appearance?.background, "#abcdef");
});

test("a phone without its own look uses defaults instead of the desktop wallpaper", async () => {
  const f = fixture("mobile");
  f.controls.read = Promise.resolve({
    data: {
      preferences: {
        ...custom,
        phone: undefined,
        appearance: {
          ...custom.appearance,
          theme: "light" as const,
          wallpaper: true,
          wallpaperObject: "desktop-only",
        },
      },
    },
    error: null,
  });
  await f.api.pullAccountPreferences(session);
  assert.equal(f.appearance().theme, DEFAULT_APPEARANCE.theme);
  assert.equal(f.appearance().wallpaper, false);
  assert.equal(f.appearance().wallpaperObject, null);
  assert.equal(f.downloads.length, 0);
});

test("desktop still applies and downloads its own wallpaper, independently of phone look", async () => {
  const f = fixture();
  f.controls.read = Promise.resolve({
    data: {
      preferences: {
        ...custom,
        appearance: {
          ...custom.appearance,
          theme: "light" as const,
          wallpaper: true,
          wallpaperObject: "desktop-only",
        },
      },
    },
    error: null,
  });
  await f.api.pullAccountPreferences(session);
  assert.equal(f.appearance().theme, "light");
  assert.equal(f.appearance().wallpaperObject, "desktop-only");
  assert.equal(f.downloads[0], "desktop-only");
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(f.adopted.length, 1);
});

const paper = { ...DEFAULT_APPEARANCE, theme: "light" as const, background: "#fbfaf7" };

test("a computer that missed the phone's choice writes the row's phone branch, not its own memory", async () => {
  const f = fixture();
  await f.api.pullAccountPreferences(session);
  // The phone chooses Paper while this window's channel hears nothing.
  f.controls.read = Promise.resolve({
    data: { preferences: { ...custom, phone: { appearance: paper } } },
    error: null,
  });
  f.api.pushAccountPreferences(session, f.api.preferencesWith(shape.DEFAULT_FLAGS, { n: "x" }));
  await f.api.releaseAccountPreferences(session);
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0].preferences.phone?.appearance?.background, "#fbfaf7");
  assert.equal(f.writes[0].preferences.remarksSeen.n, "x");
});

test("a phone keeps its own look when an older computer wrote the row without it", async () => {
  const storage = new Map<string, string>();
  const before = fixture("mobile", storage);
  before.controls.read = Promise.resolve({
    data: { preferences: { ...custom, phone: { appearance: paper } } },
    error: null,
  });
  await before.api.pullAccountPreferences(session);
  // Days later: the row has been rewritten by a computer that knows no phone.
  const after = fixture("mobile", storage);
  after.controls.read = Promise.resolve({
    data: { preferences: { ...custom, phone: undefined } },
    error: null,
  });
  const pulled = await after.api.pullAccountPreferences(session);
  assert.equal(after.appearance().background, "#fbfaf7");
  // And its next write of anything puts the branch back, over the row's desktop half.
  after.api.pushAccountPreferences(session, { ...pulled, collaborators: false });
  await after.api.releaseAccountPreferences(session);
  assert.equal(after.writes[0].preferences.phone?.appearance?.background, "#fbfaf7");
  assert.equal(after.writes[0].preferences.appearance.accent, "#123456");
});
