import assert from "node:assert/strict";
import { test } from "node:test";
import { APPEARANCE_PRESETS, PHONE_PALETTES, phonePaletteOf, phoneSide } from "./appearance.ts";

test("either side of the phone's five reads back as itself", () => {
  for (const palette of PHONE_PALETTES)
    for (const dark of [false, true])
      assert.equal(phonePaletteOf(phoneSide(palette.id, dark)), palette.id);
});

test("every one of the computer's eighteen lands on one of the five", () => {
  const five = PHONE_PALETTES.map((palette) => palette.id as string);
  for (const preset of APPEARANCE_PRESETS) assert.ok(five.includes(phonePaletteOf(preset)));
  const of = (id: string) => phonePaletteOf(APPEARANCE_PRESETS.find((p) => p.id === id)!);
  assert.equal(of("ink"), "paper");
  assert.equal(of("plum"), "rosewood");
  assert.equal(of("moss"), "pine");
  assert.equal(of("abyss"), "fjord");
  assert.equal(of("cosmic"), "graphite");
});

test("a colour nobody chose from a list is Graphite", () => {
  assert.equal(phonePaletteOf({ background: "#123456", foreground: "#abcdef" }), "graphite");
});
