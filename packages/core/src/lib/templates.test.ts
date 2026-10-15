import assert from "node:assert/strict";
import test from "node:test";
import { isTemplateFolder } from "./templates.ts";

test("a template folder is found by name, in either language", () => {
  assert.equal(isTemplateFolder(" Modelli "), true);
  assert.equal(isTemplateFolder("Templates"), true);
  assert.equal(isTemplateFolder("Studio"), false);
});
