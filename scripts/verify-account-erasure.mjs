#!/usr/bin/env node
// End-to-end erasure of disposable fixtures only. Existing users/accounts are
// never selected as targets. The remote run is an explicit opt-in.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createClient } from "@supabase/supabase-js";
import * as Y from "yjs";
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
const noteIds = [];
const receiptToken = crypto.randomUUID();
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
async function call(token, body) {
  const response = await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/delete-account`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

try {
  const one = await fixture("one");
  const two = await fixture("two");
  const shared = await archive(one.id, [one.id, two.id]);
  const solo = await archive(one.id, [one.id]);
  const blockedPeer = await fixture("blocked-peer");
  const mentionArchive = await archive(two.id, [one.id, two.id, blockedPeer.id]);
  const mentionNote = crypto.randomUUID();
  const mentionComment = crypto.randomUUID();
  checked(
    await admin.from("notes").insert({
      ...note(mentionNote, mentionArchive, two.id, null),
      content: { type: "doc", content: [] },
    }),
    "legacy mention note",
  );
  checked(
    await admin.from("note_comments").insert({
      id: mentionComment,
      thread_id: mentionComment,
      note_id: mentionNote,
      archive_id: mentionArchive,
      author_id: two.id,
      body: "Retained comment",
      mentions: [one.id, blockedPeer.id],
    }),
    "legacy mention comment",
  );
  checked(
    await two.client.rpc("block_user", { target_user_id: blockedPeer.id }),
    "block legacy mentioned peer",
  );
  assert(
    (
      await two.client
        .from("note_comments")
        .update({ body: "Still blocked" })
        .eq("id", mentionComment)
    ).error,
    "Authenticated clients still cannot mention blocked peers",
  );

  const ownFile = await upload(one, "note-images", shared);
  const keptFile = await upload(one, "note-images", shared);
  const orphanFile = await upload(one, "note-images", shared);
  const soloFile = await upload(one, "note-images", solo);
  const avatar = await upload(one, "avatars", one.id);
  checked(
    await admin.from("profiles").update({ avatar_object: avatar }).eq("user_id", one.id),
    "avatar profile",
  );
  checked(
    await admin
      .from("profile_preferences")
      .insert({ user_id: one.id, preferences: { theme: "dark" } }),
    "preferences",
  );
  const ownedId = crypto.randomUUID();
  const keptId = crypto.randomUUID();
  noteIds.push(ownedId, keptId);
  const owned = note(ownedId, shared, one.id, ownFile);
  const kept = note(keptId, shared, two.id, keptFile);
  checked(
    await admin.from("notes").insert([owned, { ...kept, locked_by: one.id }]),
    "fixture notes",
  );
  for (const id of noteIds) {
    const doc = new Y.Doc();
    doc.getText("title").insert(0, "Fixture words");
    checked(
      await admin.rpc("seed_note_document", {
        target_note_id: id,
        document_state_base64: Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64"),
        document_format_version: 1,
      }),
      "fixture document",
    );
  }
  const originalDocument = checked(
    await admin.rpc("load_note_document", { target_note_id: keptId }),
    "read retained document",
  );
  checked(
    await admin.from("note_versions").insert([
      { archive_id: shared, note_id: ownedId, content: owned.content, author_ids: [one.id] },
      { archive_id: shared, note_id: keptId, content: kept.content, author_ids: [one.id, two.id] },
    ]),
    "fixture versions",
  );
  checked(
    await admin.from("note_comments").insert([
      {
        archive_id: shared,
        note_id: keptId,
        thread_id: crypto.randomUUID(),
        author_id: one.id,
        body: "Remove this comment",
        mentions: [],
        assignee_id: null,
      },
      {
        archive_id: shared,
        note_id: keptId,
        thread_id: crypto.randomUUID(),
        author_id: two.id,
        body: "Keep this comment",
        mentions: [one.id],
        assignee_id: one.id,
      },
    ]),
    "fixture comments",
  );
  checked(
    await admin.from("media_text").insert([
      { archive_id: shared, object_id: ownFile, text: "Remove extracted text" },
      { archive_id: shared, object_id: keptFile, text: "Keep extracted text" },
    ]),
    "fixture media text",
  );
  const deletionBody = {
    action: "delete",
    confirm: true,
    expected_user_id: one.id,
    password: one.password,
    request_token: receiptToken,
  };
  assert.equal(
    (await call(one.token, { ...deletionBody, password: "incorrect-password" })).status,
    403,
  );
  assert.equal((await call(two.token, deletionBody)).status, 401, "Cannot delete another account");
  assert.equal(
    (await call(env.VITE_SUPABASE_PUBLISHABLE_KEY, deletionBody)).status,
    401,
    "Anonymous deletion rejected",
  );
  assert(
    (
      await one.client.rpc("begin_account_erasure", {
        target_user_id: two.id,
        request_token: crypto.randomUUID(),
      })
    ).error,
    "Users cannot bypass password verification through RPC",
  );

  const deleted = await call(one.token, deletionBody);
  assert(
    [200, 202].includes(deleted.status),
    `Erasure endpoint failed: ${JSON.stringify(deleted.body)}`,
  );
  const anonymous = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, options);
  let status;
  for (let attempt = 0; attempt < 36; attempt++) {
    status = checked(
      await anonymous.rpc("account_erasure_status", { request_token: receiptToken }),
      "receipt status",
    );
    if (status === "completed") break;
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }
  assert.equal(status, "completed", "Scheduled erasure did not finish");
  const goneUser = await admin.auth.admin.getUserById(one.id);
  assert(goneUser.error || !goneUser.data.user, "Auth identity must be removed");
  assert.equal(
    checked(await admin.from("notes").select("id").eq("id", ownedId), "owned note").length,
    0,
  );
  const retained = checked(
    await two.client.from("notes").select("content, locked_by").eq("id", keptId).single(),
    "retained note",
  );
  assert.deepEqual(retained.content, kept.content);
  assert.equal(retained.locked_by, null);
  assert.deepEqual(
    checked(await admin.rpc("load_note_document", { target_note_id: keptId }), "retained binary"),
    originalDocument,
  );
  assert.equal(
    checked(
      await admin.from("note_documents").select("note_id").eq("note_id", ownedId),
      "erased binary",
    ).length,
    0,
  );
  assert.equal(
    checked(
      await admin.from("note_versions").select("id").eq("note_id", ownedId),
      "erased versions",
    ).length,
    0,
  );
  const versions = checked(
    await admin.from("note_versions").select("author_ids").eq("note_id", keptId),
    "retained versions",
  );
  assert.deepEqual(versions[0].author_ids, [two.id]);
  const comments = checked(
    await two.client
      .from("note_comments")
      .select("body,mentions,assignee_id")
      .eq("note_id", keptId),
    "retained comments",
  );
  assert.equal(comments.length, 1);
  assert.deepEqual(comments[0].mentions, []);
  assert.equal(comments[0].assignee_id, null);

  const scrubbedComment = checked(
    await two.client
      .from("note_comments")
      .select("body,mentions")
      .eq("id", mentionComment)
      .single(),
    "retained legacy blocked mentions",
  );
  assert.equal(scrubbedComment.body, "Retained comment");
  assert.deepEqual(
    scrubbedComment.mentions,
    [blockedPeer.id],
    "Erasure scrubs the deleted identity despite an unrelated blocked mention",
  );
  const sharedRow = checked(
    await admin.from("archives").select("created_by").eq("id", shared).single(),
    "shared archive",
  );
  assert.equal(sharedRow.created_by, null);
  assert.equal(
    checked(await admin.from("archives").select("id").eq("id", solo), "solo archive").length,
    0,
  );
  for (const [bucket, prefix, id] of [
    ["note-images", shared, ownFile],
    ["note-images", shared, orphanFile],
    ["note-images", solo, soloFile],
    ["avatars", one.id, avatar],
  ])
    assert(
      (await admin.storage.from(bucket).download(`${prefix}/${id}`)).error,
      "Erased object must be absent",
    );
  assert(
    !(await two.client.storage.from("note-images").download(`${shared}/${keptFile}`)).error,
    "Shared attachment must remain readable",
  );
  assert.equal(
    checked(
      await admin.from("media_text").select("object_id").eq("archive_id", shared),
      "extracted text",
    ).length,
    1,
  );
  assert(
    (await one.client.rpc("ensure_personal_archive")).error,
    "Old JWT must not bootstrap a replacement archive",
  );
  assert(
    (await admin.from("notes").insert(owned)).error,
    "Offline clients cannot resurrect erased notes",
  );
  // Simulate a worker interruption after the transactional manifest exists.
  // Only the deployed minute scheduler may finish this disposable account.
  const retry = await fixture("automatic-retry");
  const retryArchive = await archive(retry.id, [retry.id]);
  await upload(retry, "note-images", retryArchive);
  const retryReceipt = crypto.randomUUID();
  checked(
    await admin.rpc("begin_account_erasure", {
      target_user_id: retry.id,
      request_token: retryReceipt,
    }),
    "stage interrupted fixture",
  );
  const deadline = Date.now() + 100_000;
  let retryStatus;
  do {
    retryStatus = checked(
      await admin.rpc("account_erasure_status", { request_token: retryReceipt }),
      "retry status",
    );
    if (retryStatus === "completed") break;
    await new Promise((resolve) => setTimeout(resolve, 5000));
  } while (Date.now() < deadline);
  assert.equal(
    retryStatus,
    "completed",
    "Deployed cron resumes interrupted erasure without a client",
  );
  console.log(
    "Account erasure E2E passed: identity, files, avatar, history, binary documents, metadata, shared-work retention, stale JWT protection and deployed automatic retry",
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
