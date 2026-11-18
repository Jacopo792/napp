import test from "node:test";
import assert from "node:assert/strict";
import { decode, imageSize, linkPreview, readTags } from "./linkPreview.ts";

test("link preview reads Open Graph before Twitter and the title tag", () => {
  const { tags, title } = readTags(`<html><head><title>Plain &amp; simple</title>
    <meta name="twitter:title" content="Twitter one">
    <meta content='Graph &#8217;one&#x27;' property="og:title" />
    <meta property=og:site_name content=Example>
    </head><body><meta property="og:image" content="/late.png"></body></html>`);
  assert.equal(tags.get("og:title"), "Graph ’one'");
  assert.equal(tags.get("twitter:title"), "Twitter one");
  assert.equal(tags.get("og:site_name"), "Example");
  assert.equal(tags.get("og:image"), undefined, "tags past the head are not read");
  assert.equal(title, "Plain & simple");
  assert.equal(decode("  a\n\n b &bogus; "), "a b &bogus;");
});

test("link preview measures PNG and GIF headers", () => {
  const png = Buffer.alloc(32);
  png.writeUInt32BE(0x89504e47, 0);
  png.writeUInt32BE(1200, 16);
  png.writeUInt32BE(630, 20);
  assert.deepEqual(imageSize(png), { width: 1200, height: 630 });
  const gif = Buffer.from("GIF89a\x40\x01\xf0\x00xxxx", "latin1");
  assert.deepEqual(imageSize(gif), { width: 320, height: 240 });
  assert.equal(imageSize(Buffer.from("nothing")), null);
});

test("link preview refuses private and non-HTTPS addresses before the network", async () => {
  for (const url of [
    "http://example.com",
    "https://127.0.0.1/",
    "https://localhost/",
    "file:///etc/passwd",
  ])
    await assert.rejects(linkPreview(url));
});
