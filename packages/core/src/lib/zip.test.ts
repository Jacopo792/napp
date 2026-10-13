import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { crc32, storedZip } from "./zip.ts";

test("crc32 is the zip one", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
});

test("a stored zip opens, mimetype first and uncompressed", () => {
  const zip = storedZip([
    { name: "mimetype", data: "application/epub+zip" },
    { name: "OEBPS/città.xhtml", data: "<p>perché</p>" },
    { name: "img.bin", data: new Uint8Array([0, 255, 7]) },
  ]);
  assert.equal(new TextDecoder().decode(zip.slice(30, 38)), "mimetype");
  assert.equal(new TextDecoder().decode(zip.slice(38, 58)), "application/epub+zip");
  const dir = mkdtempSync(join(tmpdir(), "napp-zip-"));
  const file = join(dir, "t.zip");
  writeFileSync(file, zip);
  /* `unzip -t` checks every CRC; skipped where there is no unzip. */
  try {
    const report = execFileSync("unzip", ["-t", file], { encoding: "utf8" });
    assert.match(report, /No errors detected/);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
});
