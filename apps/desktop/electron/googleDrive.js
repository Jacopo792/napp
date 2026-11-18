const { createHash, randomBytes } = require("node:crypto");
const { once } = require("node:events");
const { readFile } = require("node:fs/promises");
const path = require("node:path");
const { parseEnv } = require("node:util");
const { createServer } = require("node:http");

const scope = "https://www.googleapis.com/auth/drive.file";
const types = [
  "application/vnd.google-apps.document",
  "application/vnd.google-apps.spreadsheet",
  "application/vnd.google-apps.presentation",
  "application/pdf",
];

async function readLocalDriveCredentials() {
  const local = await readFile(path.join(__dirname, "../../../.env.local"), "utf8").then(
    parseEnv,
    () => ({}),
  );
  return {
    clientId:
      process.env.VITE_GOOGLE_DRIVE_DESKTOP_CLIENT_ID ?? local.VITE_GOOGLE_DRIVE_DESKTOP_CLIENT_ID,
    clientSecret:
      process.env.GOOGLE_DRIVE_DESKTOP_CLIENT_SECRET ?? local.GOOGLE_DRIVE_DESKTOP_CLIENT_SECRET,
  };
}

async function pickDriveFiles({ clientId, clientSecret }, openBrowser, signal, exchange = fetch) {
  if (
    typeof clientId !== "string" ||
    !/^[\w-]+\.apps\.googleusercontent\.com$/.test(clientId) ||
    typeof clientSecret !== "string" ||
    !clientSecret
  )
    throw new Error("Google Drive is not configured for this app.");
  signal = AbortSignal.any([signal, AbortSignal.timeout(5 * 60_000)]);
  signal.throwIfAborted();

  const verifier = randomBytes(32).toString("base64url");
  const state = randomBytes(32).toString("base64url");
  const server = createServer();
  server.requestTimeout = 10_000;
  try {
    server.listen(0, "127.0.0.1");
    await once(server, "listening", { signal });
    const callback = new URL(`http://127.0.0.1:${server.address().port}/oauth2callback`);
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callback.href,
      response_type: "code",
      scope,
      state,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
      access_type: "online",
      prompt: "consent",
      trigger_onepick: "true",
      allow_multiple: "true",
      mimetypes: types.join(","),
    });

    const selected = await new Promise((resolve, reject) => {
      let answered = false;
      const abort = () => reject(signal.reason);
      signal.addEventListener("abort", abort, { once: true });
      server.on("request", (request, response) => {
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Referrer-Policy", "no-referrer");
        response.setHeader("Content-Type", "text/plain; charset=utf-8");
        response.setHeader("Connection", "close");

        if (
          answered ||
          request.method !== "GET" ||
          request.headers.host !== callback.host ||
          !request.url?.startsWith(`${callback.pathname}?`)
        ) {
          response.writeHead(404).end();
          return;
        }

        const { searchParams } = new URL(request.url, callback);
        if (searchParams.get("state") !== state) {
          response.writeHead(404).end();
          return;
        }
        answered = true;
        const code = searchParams.get("code");
        const ids = [...new Set((searchParams.get("picked_file_ids") ?? "").split(","))].filter(
          (id) => /^[\w-]{1,256}$/.test(id),
        );
        const accepted = code && ids.length && !searchParams.has("error");
        const message = accepted
          ? "File selection received. Return to Napp to continue."
          : "No files selected. Return to Napp to try again.";
        response.setHeader("Content-Type", "text/html; charset=utf-8");
        response.end(
          `<!doctype html><meta charset="utf-8"><title>Napp</title><p>${message}</p><script>history.replaceState(null,"","/")</script>`,
          () => resolve(accepted ? { code, ids } : null),
        );
      });
      openBrowser(url.href).catch(reject);
    });

    if (!selected) return null;
    const token = await exchange("https://oauth2.googleapis.com/token", {
      method: "POST",
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: callback.href,
        grant_type: "authorization_code",
        code: selected.code,
        code_verifier: verifier,
      }),
      signal,
    });
    if (!token.ok) throw new Error("Google Drive authorization could not be completed.");
    const { access_token: accessToken, scope: grantedScope } = await token.json();
    if (typeof accessToken !== "string" || !accessToken || grantedScope?.trim() !== scope)
      throw new Error("Google Drive access was not granted.");
    return { ids: selected.ids, accessToken };
  } finally {
    server.close();
    server.closeAllConnections();
  }
}

module.exports = { pickDriveFiles, readLocalDriveCredentials };
