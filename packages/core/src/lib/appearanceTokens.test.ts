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
