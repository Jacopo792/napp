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
  assert.equal(wornSide(DEFAULT_APPEARANCE, false), null);
  assert.equal(appearanceTokens(DEFAULT_APPEARANCE, true)["--page"], DEFAULT_APPEARANCE.background);
});
