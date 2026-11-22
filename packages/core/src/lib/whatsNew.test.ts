import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { RELEASES, unseenReleases } from "./releaseHistory.ts";
import { CURRENT_RELEASE, compareVersions, laterVersion } from "./whatsNew.ts";

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

test("announcements are newest first and cover the shipped release line", () => {
  for (let index = 1; index < RELEASES.length; index += 1)
    assert.ok(compareVersions(RELEASES[index - 1].version, RELEASES[index].version) > 0);
  const versions: string[] = [];
  for (const shell of ["web", "desktop"]) {
    const manifest = JSON.parse(
      readFileSync(new URL(`../../../../apps/${shell}/package.json`, import.meta.url), "utf8"),
    ) as { version: string };
    versions.push(manifest.version);
    // Maintenance patches may keep the existing announcement and read state.
    assert.ok(compareVersions(manifest.version, CURRENT_RELEASE) >= 0);
    assert.equal(
      manifest.version.split(".").slice(0, 2).join("."),
      CURRENT_RELEASE.split(".").slice(0, 2).join("."),
    );
  }
  assert.equal(versions[0], versions[1], "web and desktop must ship the same version");
});

test("every entry says something", () => {
  for (const release of RELEASES) {
    assert.ok(release.headline && release.sections.length, release.version);
    for (const section of release.sections)
      for (const item of section.items) assert.ok(item.title && item.text, item.title);
  }
});

test("every picture a release names is in the bundle", () => {
  for (const release of RELEASES)
    for (const section of release.sections)
      for (const item of section.items)
        if (item.image)
          assert.ok(
            existsSync(new URL(`../assets/whats-new/${item.image}`, import.meta.url)),
            `${release.version}: ${item.image} is missing`,
          );
});
