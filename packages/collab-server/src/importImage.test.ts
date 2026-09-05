import test from "node:test";
import assert from "node:assert/strict";
import { publicAddress, importImage } from "./importImage.ts";
test("image fetch rejects local, reserved and mapped addresses", () => {
  for (const ip of [
    "127.0.0.1",
    "10.1.1.1",
    "172.16.2.3",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "::1",
    "fc00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "2001:db8::1",
    "2002:7f00:1::",
    "invalid",
  ])
    assert.equal(publicAddress(ip), false, ip);
  assert.equal(publicAddress("8.8.8.8"), true);
  assert.equal(publicAddress("2606:4700:4700::1111"), true);
});
test("image fetch rejects schemes, credentials and non-HTTPS ports before network access", async () => {
  for (const url of [
    "file:///etc/passwd",
    "http://example.com/a.png",
    "https://a:b@example.com/a.png",
    "https://example.com:8443/a.png",
  ])
    await assert.rejects(importImage(url));
});
