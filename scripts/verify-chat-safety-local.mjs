#!/usr/bin/env node
// Local-only audit check: chat blocking, chat reports and chat erasure.
// Disposable fixtures on a local Supabase; refuses any hosted URL.
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const url = process.env.VITE_SUPABASE_URL;
assert(/^http:\/\/127\.0\.0\.1:/.test(url ?? ""), "Local Supabase only");
const anon = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, options);
const stamp = crypto.randomUUID();
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
  "base64",
);
const ok = (r, label) => {
  if (r.error) throw new Error(`${label}: ${r.error.message}`);
  return r.data;
};
async function person(label) {
  const email = `chat-${label}-${stamp}@example.test`;
  const password = `chat-${crypto.randomUUID()}`;
  const { user } = ok(
    await admin.auth.admin.createUser({ email, password, email_confirm: true }),
    "user",
  );
  const client = createClient(url, anon, options);
  const s = ok(await client.auth.signInWithPassword({ email, password }), "sign in");
  return { id: user.id, password, client, token: s.session.access_token };
}

const a = await person("a");
const b = await person("b");
const archive = crypto.randomUUID();
ok(
  await admin.from("archives").insert({ id: archive, name: `chat ${stamp}`, created_by: a.id }),
  "archive",
);
ok(
  await admin
    .from("archive_members")
    .insert([a, b].map((p) => ({ archive_id: archive, user_id: p.id }))),
  "members",
);

const msg = ok(
  await a.client
    .from("archive_messages")
    .insert({ archive_id: archive, author_id: a.id, body: "hello" })
    .select("id")
    .single(),
  "message",
);
const media = `${archive}/${msg.id}.0.png`;
ok(
  await a.client.storage.from("chat-media").upload(media, png, { contentType: "image/png" }),
  "chat media",
);
assert.equal(
  ok(await b.client.from("archive_messages").select("id").eq("archive_id", archive), "b reads")
    .length,
  1,
);

// Report a chat message: lands in the private queue, not readable by clients.
const reportId = ok(
  await b.client.rpc("report_safety_issue", { reason_code: "spam", target_message_id: msg.id }),
  "report message",
);
assert(reportId, "report id returned");
assert(
  (await b.client.schema("private").from("safety_reports").select("id")).error,
  "queue is private",
);

// Block: B no longer sees A's message or file, and A no longer sees B's.
ok(await b.client.rpc("block_user", { target_user_id: a.id }), "block");
assert.equal(
  ok(await b.client.from("archive_messages").select("id").eq("archive_id", archive), "after block")
    .length,
  0,
);
assert((await b.client.storage.from("chat-media").download(media)).error, "blocked file hidden");
// What a block does NOT do: both are still members of the shared archive.
assert.equal(
  ok(await b.client.from("archive_members").select("user_id").eq("archive_id", archive), "members")
    .length,
  2,
);
ok(await b.client.rpc("unblock_user", { target_user_id: a.id }), "unblock");

// Option B: presence list both ways, and the creator may remove only a blocked person.
const c = await person("c");
ok(await admin.from("archive_members").insert({ archive_id: archive, user_id: c.id }), "c joins");
assert(
  (
    await a.client.rpc("remove_blocked_member", {
      target_archive_id: archive,
      target_user_id: c.id,
    })
  ).error,
  "no removal without a block",
);
ok(await a.client.rpc("block_user", { target_user_id: c.id }), "a blocks c");
assert.deepEqual(ok(await a.client.rpc("hidden_people"), "a hidden"), [c.id]);
assert.deepEqual(ok(await c.client.rpc("hidden_people"), "c hidden"), [a.id]);
assert.deepEqual(ok(await b.client.rpc("hidden_people"), "b hidden"), []);
ok(await c.client.rpc("block_user", { target_user_id: b.id }), "c blocks b");
assert(
  (
    await c.client.rpc("remove_blocked_member", {
      target_archive_id: archive,
      target_user_id: b.id,
    })
  ).error,
  "non-creator cannot remove",
);
ok(
  await a.client.rpc("remove_blocked_member", { target_archive_id: archive, target_user_id: c.id }),
  "creator removes blocked",
);
assert.equal(
  ok(
    await admin.from("archive_members").select("user_id").eq("archive_id", archive),
    "after removal",
  ).length,
  2,
);
await admin.auth.admin.deleteUser(c.id);

// Erase A through the real function: message, reactions and file go.
const token = crypto.randomUUID();
const res = await fetch(`${url}/functions/v1/delete-account`, {
  method: "POST",
  headers: { Authorization: `Bearer ${a.token}`, apikey: anon, "Content-Type": "application/json" },
  body: JSON.stringify({
    action: "delete",
    confirm: true,
    password: a.password,
    request_token: token,
    expected_user_id: a.id,
  }),
});
const body = await res.json();
assert(
  ["completed", "processing"].includes(body.status),
  `erase: ${res.status} ${JSON.stringify(body)}`,
);
for (let i = 0; i < 30 && (await admin.auth.admin.getUserById(a.id)).data.user; i++)
  await new Promise((r) => setTimeout(r, 2000));
assert(!(await admin.auth.admin.getUserById(a.id)).data.user, "auth user gone");
assert.equal(
  ok(await admin.from("archive_messages").select("id").eq("id", msg.id), "msg gone").length,
  0,
);
const left = ok(await admin.storage.from("chat-media").list(archive), "list");
assert.equal(left.filter((f) => f.name.startsWith(msg.id)).length, 0, "chat media removed");

ok(await admin.from("archives").delete().eq("id", archive), "cleanup archive");
await admin.auth.admin.deleteUser(b.id);
console.log(
  "Chat E2E passed: chat report queued, block hides messages+files both ways, membership kept, erasure removes message and chat media",
);
