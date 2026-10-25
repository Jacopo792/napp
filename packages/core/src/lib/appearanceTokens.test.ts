import assert from "node:assert/strict";
import { test } from "node:test";
import { appearanceTokens, DEFAULT_APPEARANCE } from "./appearance.ts";

test("one derivation gives every surface its whole palette", () => {
  for (const dark of [true, false]) {
    const tokens = appearanceTokens(DEFAULT_APPEARANCE, dark);
    for (const name of [
      "--page",
      "--paper",
      "--surface",
      "--ink",
      "--ink-3",
      "--rule",
      "--accent",
      "--on-accent",
      "--danger",
      "--glass-tint",
    ])
      assert.ok(tokens[name], `${name} when ${dark ? "dark" : "light"}`);
    assert.equal(tokens["--folder-tint"], undefined);
  }
  assert.equal(
    appearanceTokens({ ...DEFAULT_APPEARANCE, folderColour: "#30d158" }, true)["--folder-tint"],
    "#30d158",
  );
});

test("one of the five turns with the light, and the eighteen are worn as stored", async () => {
  const { wornSide, PHONE_PALETTES } = await import("./appearance.ts");
  const paper = PHONE_PALETTES[0];
  const stored = { ...DEFAULT_APPEARANCE, ...paper.light, theme: "system" as const };
  assert.deepEqual(wornSide(stored, true), paper.dark);
  assert.equal(appearanceTokens(stored, true)["--page"], paper.dark.background);
  assert.equal(appearanceTokens(stored, true)["--card"], paper.dark.card);
  /* An accent that is the ink stays the ink on the other side. */
  const graphite = PHONE_PALETTES[1];
  const mono = { ...graphite.dark, accent: graphite.dark.foreground };
  assert.equal(wornSide(mono, false)?.accent, graphite.light.foreground);
  /* A hand-set accent stays the reader's. */
  assert.equal(wornSide({ ...paper.light, accent: "#123456" }, true)?.accent, "#123456");
  /* The default is Graphite worn monochrome, so it turns with the light too. */
  assert.deepEqual(wornSide(DEFAULT_APPEARANCE, false), {
    ...graphite.light,
    accent: graphite.light.foreground,
  });
  assert.equal(appearanceTokens(DEFAULT_APPEARANCE, true)["--page"], DEFAULT_APPEARANCE.background);
});

test("a look nobody chose becomes Graphite monochrome; a chosen one stays", async () => {
  const { withDesktopDefault, APPEARANCE_PRESETS } = await import("./appearance.ts");
  const old = {
    ...DEFAULT_APPEARANCE,
    theme: "dark" as const,
    accent: "#0a84ff",
    background: "#1c1c1e",
    foreground: "#ececec",
  };
  const moved = withDesktopDefault(old);
  assert.equal(moved.theme, "system");
  assert.equal(moved.accent, moved.foreground);
  assert.equal(moved.background, "#000000");
  /* Light asked for stays light, in Graphite's light side. */
  const light = withDesktopDefault({
    ...DEFAULT_APPEARANCE,
    theme: "light" as const,
    accent: "#1677c8",
    background: "#fbfaf7",
    foreground: "#242424",
  });
  assert.equal(light.theme, "light");
  assert.equal(light.background, "#f2f2f7");
  assert.equal(light.accent, light.foreground);
  /* One of the eighteen is worn exactly as stored. (Their own Graphite was the
     old default's colours, so it moves with it — the same name, either way.) */
  const preset = APPEARANCE_PRESETS.find((one) => one.id === "midnight")!;
  const chosen = { ...DEFAULT_APPEARANCE, ...preset, theme: preset.theme };
  assert.deepEqual(withDesktopDefault(chosen), chosen);
  /* The new default is itself one of the five, worn monochrome. */
  assert.equal(withDesktopDefault(DEFAULT_APPEARANCE), DEFAULT_APPEARANCE);
});
