const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const {
  trustedRendererUrl,
  trustedSender,
  rendererPermission,
  rendererFile,
  safeFileName,
  opensInViewer,
} = require("./security");

test("renderer trust compares parsed origins rather than prefixes", () => {
  assert.equal(trustedRendererUrl("http://localhost:5174/#/notes", true), true);
  assert.equal(trustedRendererUrl("app://notes/index.html", false), true);
  for (const url of [
    "http://localhost:51740/",
    "http://localhost:5174@evil.test/",
    "http://localhost:5174.evil.test/",
    "app://notes.evil.test/",
    "app://user@notes/",
    "https://evil.test/",
    "invalid",
  ]) {
    assert.equal(trustedRendererUrl(url, true), false, url);
    assert.equal(trustedRendererUrl(url, false), false, url);
  }
});

test("IPC accepts only the trusted main frame", () => {
  const mainFrame = { url: "app://notes/index.html" };
  const sender = { mainFrame };
  assert.equal(trustedSender({ sender, senderFrame: mainFrame }, false), true);
  assert.equal(trustedSender({ sender, senderFrame: { ...mainFrame } }, false), false);
  assert.equal(trustedSender({ sender, senderFrame: null }, false), false);
  mainFrame.url = "https://evil.test/";
  assert.equal(trustedSender({ sender, senderFrame: mainFrame }, false), false);
});

test("device permissions are denied except for the app's clipboard writes, fonts and video fullscreen", () => {
  for (const permission of ["clipboard-sanitized-write", "local-fonts", "fullscreen"]) {
    assert.equal(rendererPermission(permission, "app://notes/", false), true);
    assert.equal(rendererPermission(permission, "https://evil.test/", false), false);
  }
  for (const permission of ["media", "geolocation", "notifications", "clipboard-read", "unknown"])
    assert.equal(rendererPermission(permission, "app://notes/", false), false);
});

test("renderer assets stay inside dist and decode spaces and non-ASCII names", () => {
  const root = path.resolve("/tmp/napp dist");
  assert.equal(rendererFile(root, "app://notes/"), path.join(root, "index.html"));
  assert.equal(
    rendererFile(root, "app://notes/assets/caf%C3%A9%20image.png"),
    path.join(root, "assets", "café image.png"),
  );
  for (const url of [
    "app://foreign/index.html",
    "app://notes/%2e%2e%2fdist-other/secret.txt",
    "app://notes/%2e%2e%5csecret.txt",
    "app://notes/%00.png",
    "app://notes/%broken.png",
  ])
    assert.throws(() => rendererFile(root, url), undefined, url);
});

test("attachment names cannot escape a temporary directory or target Windows devices", () => {
  assert.equal(safeFileName("../chapter.pdf"), "chapter.pdf");
  assert.equal(safeFileName("C:\\folder\\chapter.pdf"), "chapter.pdf");
  assert.equal(safeFileName("Café.pdf"), "Café.pdf");
  for (const name of [
    "",
    ".",
    "..",
    "/tmp/..",
    "CON.pdf",
    "nul",
    "COM1.txt",
    "a:b.pdf",
    "a\0.pdf",
    "a.pdf.",
    "a.pdf ",
  ])
    assert.throws(() => safeFileName(name), undefined, name);
});

test("attachments open in a viewer only when they cannot run code", () => {
  for (const name of ["Chapter.PDF", "clip.mov", "notes.docx"])
    assert.equal(opensInViewer(name), true);
  for (const name of ["x.svg", "x.html", "x.xls", "x.doc", "x.ppt", "x.app", "x.exe", "pdf"])
    assert.equal(opensInViewer(name), false, name);
});
