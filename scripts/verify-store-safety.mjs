#!/usr/bin/env node
// End-to-end erasure of disposable fixtures only. Existing users/accounts are
// never selected as targets. The remote run is an explicit opt-in.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { loadEnv, requireEnv } from "./lib/env.mjs";

assert(
  process.argv.includes("--remote-fixtures"),
  "Pass --remote-fixtures to test only newly created disposable accounts",
);
const env = await loadEnv();
requireEnv(env, ["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY"]);
let serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceKey || !/^[A-Za-z0-9_.-]+$/.test(serviceKey)) {
  const projectRef = new URL(env.VITE_SUPABASE_URL).hostname.split(".")[0];
  assert(/^[a-z]{20}$/.test(projectRef), "A linked hosted Supabase project is required");
  // Keep privileged credentials in process memory. Never print this command's
  // stdout, put it in an argv value or write it into a project file.
  const { stdout } = await promisify(execFile)("supabase", [
    "projects",
    "api-keys",
    "--project-ref",
    projectRef,
    "--reveal",
    "-o",
    "json",
  ]).catch(() => {
    throw new Error("Could not load administrative test credentials");
  });
  const listed = JSON.parse(stdout);
  const keys = Array.isArray(listed) ? listed : (listed.keys ?? listed.api_keys);
  assert(Array.isArray(keys), "Could not load administrative test credentials");
  serviceKey = keys.find((key) => key.name === "service_role")?.api_key;
}
assert(
  typeof serviceKey === "string" && /^[A-Za-z0-9_.-]+$/.test(serviceKey),
  "No valid administrative test credential available",
);
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(env.VITE_SUPABASE_URL, serviceKey, options);
const stamp = crypto.randomUUID();
const users = [];
const archives = [];
const uploads = [];
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
  "base64",
);

function checked(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}
async function fixture(label) {
  const email = `erasure-${label}-${stamp}@example.test`;
  const password = `erasure-${crypto.randomUUID()}`;
  const { user } = checked(
    await admin.auth.admin.createUser({ email, password, email_confirm: true }),
    "create fixture",
  );
  assert(user);
  users.push(user.id);
  const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, options);
  const signed = checked(
    await client.auth.signInWithPassword({ email, password }),
    "sign in fixture",
  );
  checked(
    await admin.from("profiles").upsert({ user_id: user.id, nickname: label }),
    "fixture profile",
  );
  return { id: user.id, email, password, client, token: signed.session.access_token };
}
async function archive(owner, members) {
  const id = crypto.randomUUID();
  checked(
    await admin
      .from("archives")
      .insert({ id, name: `Erasure fixture ${stamp}`, created_by: owner }),
    "fixture archive",
  );
  archives.push(id);
  checked(
    await admin
      .from("archive_members")
      .insert(members.map((user_id) => ({ archive_id: id, user_id }))),
    "fixture members",
  );
  return id;
}
async function upload(account, bucket, prefix) {
  const id = crypto.randomUUID();
  const path = `${prefix}/${id}`;
  checked(
    await account.client.storage.from(bucket).upload(path, png, { contentType: "image/png" }),
    "fixture upload",
  );
  uploads.push({ bucket, path });
  return id;
}
function note(id, archiveId, owner, image) {
  return {
    id,
    archive_id: archiveId,
    owner_id: owner,
    title: "Erasure fixture",
    body: "Fixture words",
    content_version: 1,
    content: {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Fixture words" }] },
        { type: "image", attrs: { imageId: image } },
      ],
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}
async function fileStatus(who, archiveId, image) {
  const { data } = await who.client.auth.getSession();
  const url = new URL(
    `${env.VITE_SUPABASE_URL}/storage/v1/object/authenticated/note-images/${archiveId}/${image}`,
  );
  url.searchParams.set("verification", crypto.randomUUID());
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
      apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    cache: "no-store",
  });
  return response.status;
}
try {
  const one = await fixture("reporter");
  const two = await fixture("author");
  const outside = await fixture("outsider");
  const shared = await archive(one.id, [one.id, two.id]);
  const image = await upload(two, "note-images", shared);
  const id = crypto.randomUUID();
  checked(await two.client.from("notes").insert(note(id, shared, one.id, image)), "create note");
  const read = async (who) =>
    checked(await who.client.from("notes").select("id,owner_id").eq("id", id), "read note");
  assert.equal((await read(one))[0].owner_id, two.id, "Cannot spoof attribution");
  assert.equal((await read(outside)).length, 0);
  assert(
    (await outside.client.rpc("report_safety_issue", { reason_code: "spam", target_note_id: id }))
      .error,
  );
  assert((await one.client.rpc("pending_safety_reports")).error, "Moderation is operator-only");
  checked(
    await one.client.storage.from("note-images").download(`${shared}/${image}`),
    "shared image",
  );
  const args = { reason_code: "spam", target_note_id: id };
  const report = checked(await one.client.rpc("report_safety_issue", args), "report");
  assert.equal(checked(await one.client.rpc("report_safety_issue", args), "retry"), report);
  assert.equal((await read(one)).length, 0);
  assert.equal((await read(two)).length, 1);
  assert.notEqual(
    await fileStatus(one, shared, image),
    200,
    "Report filters fresh direct file reads",
  );
  checked(
    await admin.rpc("review_safety_report", { target_report_id: report, hide_content: false }),
    "dismiss",
  );
  assert.equal((await read(one)).length, 1);
  checked(await one.client.rpc("block_user", { target_user_id: two.id }), "block");
  assert.equal((await read(one)).length, 0);
  assert.notEqual(await fileStatus(one, shared, image), 200, "Block filters fresh file reads");
  assert.equal(
    checked(await two.client.from("user_blocks").select("blocked_id"), "private blocks").length,
    0,
  );
  checked(await one.client.rpc("unblock_user", { target_user_id: two.id }), "unblock");
  assert.equal((await read(one)).length, 1);
  const commentId = crypto.randomUUID();
  checked(
    await admin.from("note_comments").insert({
      id: commentId,
      thread_id: commentId,
      note_id: id,
      archive_id: shared,
      author_id: two.id,
      body: "Safety fixture comment",
      mentions: [],
    }),
    "comment fixture",
  );
  const commentReport = checked(
    await one.client.rpc("report_safety_issue", {
      reason_code: "harassment",
      target_note_id: id,
      target_comment_id: commentId,
    }),
    "report comment",
  );
  checked(
    await admin.rpc("review_safety_report", {
      target_report_id: commentReport,
      hide_content: true,
    }),
    "filter confirmed content",
  );
  assert.equal((await read(two)).length, 0);
  assert.equal(
    checked(await admin.from("notes").select("id").eq("id", id), "operator read").length,
    1,
  );
  console.log(
    "Safety E2E passed: report validation, idempotency, private queue, immutable attribution, server filtering, direct Storage reads, blocking, unblocking and comment moderation",
  );
} finally {
  // Only IDs and paths created by this run are eligible for cleanup.
  const cleanupErrors = [];
  for (const { bucket, path } of uploads) {
    const result = await admin.storage.from(bucket).remove([path]);
    if (result.error) cleanupErrors.push("fixture file");
  }
  for (const id of archives) {
    const result = await admin.from("archives").delete().eq("id", id);
    if (result.error) cleanupErrors.push("fixture archive");
  }
  for (const id of users) {
    const found = await admin.auth.admin.getUserById(id);
    if (found.data.user) {
      const result = await admin.auth.admin.deleteUser(id);
      if (result.error) cleanupErrors.push("fixture user");
    }
  }
  assert.equal(cleanupErrors.length, 0, `Fixture cleanup failed: ${cleanupErrors.join(", ")}`);
}
