#!/usr/bin/env node
// Run after typing "napp" in a new note on the disposable native QA account.
// Only fixture identities and their shared archive are read or edited.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import * as Y from "yjs";
import WebSocket from "../packages/collab-server/node_modules/ws/wrapper.mjs";
import { HocuspocusProvider } from "../packages/core/node_modules/@hocuspocus/provider/dist/hocuspocus-provider.esm.js";
import mobileCollabUrl from "../apps/mobile/collab-url.cjs";
import { loadEnv } from "./lib/env.mjs";
import { adminClient } from "./lib/admin-client.mjs";

// Match the native editor's base URL; an absent Origin is correctly rejected.
class EditorWebSocket extends WebSocket {
  constructor(url, protocols) {
    super(url, protocols, { origin: "https://notes" });
  }
}

const path = "/private/tmp/napp-store-ui-fixtures.json";
const fixture = JSON.parse(await readFile(path, "utf8"));
assert(fixture.users.length === 2 && fixture.archives.length === 1);
for (const user of fixture.users)
  assert(
    user.email.startsWith("store-ui-") && user.email.endsWith(`${fixture.stamp}@example.test`),
  );
const env = await loadEnv();
const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const login = await client.auth.signInWithPassword({
  email: fixture.users[1].email,
  password: fixture.users[1].password,
});
assert.ifError(login.error);
const rows = await client
  .from("notes")
  .select("id")
  .eq("archive_id", fixture.archives[0])
  .eq("owner_id", fixture.users[0].id)
  .order("created_at", { ascending: false });
assert.ifError(rows.error);
assert(rows.data.length >= 2, "Create a new native note before running this check");
const id = rows.data[0].id;
const doc = new Y.Doc();
let peer;
let timeout;
try {
  await new Promise((resolve, reject) => {
    timeout = setTimeout(() => reject(new Error("Peer sync timed out")), 25_000);
    peer = new HocuspocusProvider({
      url: mobileCollabUrl(),
      name: id,
      document: doc,
      token: login.data.session.access_token,
      WebSocketPolyfill: EditorWebSocket,
      onSynced: () => resolve(),
      onAuthenticationFailed: () => reject(new Error("Fixture peer authentication refused")),
    });
  });
  clearTimeout(timeout);
  const body = doc.getXmlFragment("default");
  assert(body.toString().toLowerCase().includes("napp"), "Native text did not reach the peer");
  if (!body.toString().includes("Peer sync verified")) {
    const paragraph = new Y.XmlElement("paragraph");
    const text = new Y.XmlText();
    text.insert(0, "Peer sync verified");
    paragraph.insert(0, [text]);
    body.insert(body.length, [paragraph]);
  }
  const deadline = Date.now() + 15_000;
  const admin = await adminClient();
  let persisted = false;
  while (Date.now() < deadline) {
    const result = await admin.rpc("load_note_document", { target_note_id: id });
    assert.ifError(result.error);
    if (result.data?.[0]?.state_base64) {
      const stored = new Y.Doc();
      Y.applyUpdate(stored, Buffer.from(result.data[0].state_base64, "base64"));
      persisted = stored.getXmlFragment("default").toString().includes("Peer sync verified");
      stored.destroy();
    }
    if (persisted) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert(persisted, "Peer edit was not durably saved");
  fixture.nativeNote = id;
  await writeFile(path, JSON.stringify(fixture), { mode: 0o600 });
  console.log("Native writing reached the second member through WSS; peer edit persisted.");
} finally {
  clearTimeout(timeout);
  peer?.destroy();
  doc.destroy();
}
