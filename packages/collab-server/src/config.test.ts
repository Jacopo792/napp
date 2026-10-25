import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { deploymentRevision, parseAllowedOrigins } from "./config.ts";

test("origin configuration supports the real web and native schemes", () => {
  assert.deepEqual(
    parseAllowedOrigins(" https://example.com,app://notes,capacitor://notes,https://example.com "),
    ["https://example.com", "app://notes", "capacitor://notes"],
  );
  for (const value of [
    "",
    "*",
    "null",
    "file://",
    "https://*.example.com",
    "https://example.com/",
    "https://example.com/path",
    "https://user:secret@example.com",
    "https://example.com?x=1",
    "https://example.com#x",
    "https://EXAMPLE.com",
  ]) {
    assert.throws(() => parseAllowedOrigins(value), /ALLOWED_ORIGINS/);
  }
});

test("the documented Render origins match the checked origin manifest", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("../../../ops/collab-origins.json", import.meta.url), "utf8"),
  );
  const blueprint = await readFile(new URL("../../../render.yaml", import.meta.url), "utf8");
  const configured = blueprint.match(/- key: ALLOWED_ORIGINS\s+value: ([^\r\n]+)/)?.[1];
  assert.ok(configured, "Render blueprint must document ALLOWED_ORIGINS");
  assert.deepEqual(
    parseAllowedOrigins(configured).sort(),
    parseAllowedOrigins([...manifest.production, ...manifest.development].join(",")).sort(),
  );
});

test("revision is a full SHA or explicitly unknown", () => {
  assert.equal(deploymentRevision(undefined), null);
  assert.equal(deploymentRevision("A".repeat(40)), "a".repeat(40));
  assert.throws(() => deploymentRevision("main"), /full Git commit/);
});
