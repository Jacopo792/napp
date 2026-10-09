import test from "node:test";
import assert from "node:assert/strict";
import { hardWraps } from "./reflow.ts";

test("a PDF's printed lines become its paragraphs", () => {
  const lines = [
    "Il bello",
    "Una volta le storie stavano accadendo. Ora ne è soltanto",
    "rimasto un ricordo sbiadito. Chi le viveva forse è morto – o",
    "amiche. È questo ciò che Roberto mi ha insegnato a sentire.",
    "Perché quando si entra nel flusso, il tempo sembra fermo. Ed",
    "è come un mare infinito in cui si può nuotare.",
    "La conoscenza è un viaggio. Può rendere opaca la",
    "strada, può farti soffocare. O può farti tornare a respirare.",
  ];
  assert.deepEqual(hardWraps(lines), [false, true, true, true, true, false, true]);
});

test("real paragraphs and short lines are left alone", () => {
  assert.deepEqual(hardWraps(["Uno.", "Due righe", "Tre"]), [false, false]);
  const long = "Parola ".repeat(40);
  assert.deepEqual(hardWraps([long, long, long]), [false, false]);
});
