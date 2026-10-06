import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  CURRENT_RELEASE,
  RELEASES,
  compareVersions,
  laterVersion,
  unseenReleases,
} from "./whatsNew.ts";

test("versions compare as numbers, and nothing is older than everything", () => {
  assert.ok(compareVersions("0.10.0", "0.9.0") > 0);
  assert.ok(compareVersions("0.9.0", "0.9.1") < 0);
  assert.equal(compareVersions("1.0", "1.0.0"), 0);
  assert.ok(compareVersions("", "0.1.0") < 0);
  assert.equal(laterVersion("0.8.0", "0.9.0"), "0.9.0");
  assert.equal(laterVersion("0.9.0", ""), "0.9.0");
});

test("what has not been read is every release after the last one read", () => {
  assert.deepEqual(
    unseenReleases("0.7.0").map((release) => release.version),
    RELEASES.filter((release) => compareVersions(release.version, "0.7.0") > 0).map(
      (release) => release.version,
    ),
  );
  assert.equal(unseenReleases(CURRENT_RELEASE).length, 0);
  assert.equal(unseenReleases("").length, RELEASES.length);
});

test("releases are newest first, and the newest is the version being shipped", () => {
  for (let index = 1; index < RELEASES.length; index += 1)
    assert.ok(compareVersions(RELEASES[index - 1].version, RELEASES[index].version) > 0);
  for (const shell of ["web", "desktop"]) {
    const manifest = JSON.parse(
      readFileSync(new URL(`../../../../apps/${shell}/package.json`, import.meta.url), "utf8"),
    ) as { version: string };
    assert.equal(manifest.version, CURRENT_RELEASE, `apps/${shell} says ${manifest.version}`);
  }
});

test("every entry says something", () => {
  for (const release of RELEASES) {
    assert.ok(release.headline && release.sections.length, release.version);
    for (const section of release.sections)
      for (const item of section.items) assert.ok(item.title && item.text, item.title);
  }
});
