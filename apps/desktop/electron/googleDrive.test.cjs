const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { test } = require("node:test");
const { pickDriveFiles } = require("./googleDrive");

const clientId = "test.apps.googleusercontent.com";
const credentials = { clientId, clientSecret: "fake-desktop-client-secret" };
const scope = "https://www.googleapis.com/auth/drive.file";

test("desktop Drive picker uses PKCE and accepts only its own loopback callback", async () => {
  const controller = new AbortController();
  let challenge;
  let redirectUri;
  const picked = await pickDriveFiles(
    credentials,
    async (authorize) => {
      const url = new URL(authorize);
      assert.equal(url.origin, "https://accounts.google.com");
      assert.equal(url.searchParams.get("trigger_onepick"), "true");
      assert.equal(url.searchParams.get("allow_multiple"), "true");
      assert.equal(url.searchParams.get("scope"), scope);
      assert.equal(url.searchParams.get("code_challenge_method"), "S256");
      assert.equal(url.searchParams.has("client_secret"), false);
      challenge = url.searchParams.get("code_challenge");
      redirectUri = url.searchParams.get("redirect_uri");
      const callback = new URL(redirectUri);
      assert.equal(callback.hostname, "127.0.0.1");
      callback.search = new URLSearchParams({
        code: "chosen-code",
        picked_file_ids: "doc-1,sheet_2,doc-1,slides-3",
        state: "wrong-state",
      });
      assert.equal((await fetch(callback)).status, 404);
      callback.searchParams.set("state", url.searchParams.get("state"));
      const response = await fetch(callback);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("referrer-policy"), "no-referrer");
      assert.match(await response.text(), /Return to Napp/);
    },
    controller.signal,
    async (url, { body }) => {
      assert.equal(url, "https://oauth2.googleapis.com/token");
      assert.equal(body.get("client_id"), clientId);
      assert.equal(body.get("client_secret"), credentials.clientSecret);
      assert.equal(body.get("code"), "chosen-code");
      assert.equal(body.get("redirect_uri"), redirectUri);
      assert.equal(
        createHash("sha256").update(body.get("code_verifier")).digest("base64url"),
        challenge,
      );
      return Response.json({ access_token: "test-token", scope });
    },
  );
  assert.deepEqual(picked, { ids: ["doc-1", "sheet_2", "slides-3"], accessToken: "test-token" });
  await assert.rejects(fetch(redirectUri));
});

test("closing the import sheet cancels the native listener", async () => {
  const controller = new AbortController();
  let redirectUri;
  await assert.rejects(
    pickDriveFiles(
      credentials,
      async (authorize) => {
        redirectUri = new URL(authorize).searchParams.get("redirect_uri");
        controller.abort();
      },
      controller.signal,
    ),
    { name: "AbortError" },
  );
  await assert.rejects(fetch(redirectUri));
});
