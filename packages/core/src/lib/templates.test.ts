import assert from "node:assert/strict";
import test from "node:test";
import { dailyTitle, isDailyTemplate, isTemplateFolder } from "./templates.ts";

test("a template folder and the day's template are found by name, in either language", () => {
  assert.equal(isTemplateFolder(" Modelli "), true);
  assert.equal(isTemplateFolder("Templates"), true);
  assert.equal(isTemplateFolder("Studio"), false);
  assert.equal(isDailyTemplate("Giornaliera"), true);
  assert.equal(isDailyTemplate("Daily"), true);
  assert.equal(isDailyTemplate("Verbale"), false);
});

test("the day's note is titled with the date as the language writes it", () => {
  const day = new Date(2026, 9, 13);
  assert.equal(dailyTitle(day, "it-IT"), "Martedì 13 ottobre 2026");
  assert.equal(dailyTitle(day, "en-GB"), "Tuesday, 13 October 2026");
});
