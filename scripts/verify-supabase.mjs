#!/usr/bin/env node

/**
 * End-to-end check of the account-only archive.
 *
 * Nothing here decrypts anything: notes, folders and tags are ordinary columns
 * now, and the only thing standing between them and the internet is Supabase
 * Auth plus the `archive_members` row-level policies. The script therefore
 * verifies exactly that boundary — every member reads and writes the same
 * archive, and nobody else reads anything at all.
 *
 * USER_ONE and USER_TWO are required. USER_THREE (an additional member, which
 * may carry no `owner` label) and USER_OUTSIDER (an authenticated account with
 * no membership) are verified when their credentials are present.
 */

import { anonClient, assert, fail, loadEnv, requireEnv } from "./lib/env.mjs";

const REALTIME_SETTLE_MS = 1_000;
const REALTIME_TIMEOUT_MS = 25_000;

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

async function signIn(env, email, password) {
  const supabase = anonClient(env);
  const signedIn = await supabase.auth.signInWithPassword({ email, password });
  fail(signedIn.error);
  assert(signedIn.data.user, `Login failed for ${email}`);
  return {
    supabase,
    userId: signedIn.data.user.id,
    email,
    token: signedIn.data.session.access_token,
  };
}

async function openMember(env, email, password) {
  const account = await signIn(env, email, password);
  const memberships = await account.supabase
    .from("archive_members")
    .select("archive_id, owner")
    .eq("user_id", account.userId);
  fail(memberships.error);
  assert(memberships.data.length === 1, `${email} does not have exactly one membership`);
  return {
    ...account,
    archiveId: memberships.data[0].archive_id,
    owner: memberships.data[0].owner,
  };
}

/** Realtime reports SUBSCRIBED slightly before the server has the filter in
    place, which is what made this check flake. Settle, then insert. */
function waitForSubscription(channel) {
  return new Promise((resolveSubscription, reject) => {
    const timeout = setTimeout(() => reject(new Error("Realtime subscription timed out")), 20_000);
    channel.subscribe((status, error) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(timeout);
        resolveSubscription();
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        clearTimeout(timeout);
        reject(
          new Error(`Realtime subscription failed: ${status}${error ? ` (${error.message})` : ""}`),
        );
      }
    });
  });
}

const env = await loadEnv();
requireEnv(env, [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "USER_ONE_EMAIL",
  "USER_ONE_PASSWORD",
  "USER_TWO_EMAIL",
  "USER_TWO_PASSWORD",
]);

const first = await openMember(env, env.USER_ONE_EMAIL, env.USER_ONE_PASSWORD);
const second = await openMember(env, env.USER_TWO_EMAIL, env.USER_TWO_PASSWORD);
const third = env.USER_THREE_EMAIL
  ? await openMember(env, env.USER_THREE_EMAIL, env.USER_THREE_PASSWORD)
  : null;
const members = [first, second, ...(third ? [third] : [])];
const anonymous = anonClient(env);
const outsider = env.USER_OUTSIDER_EMAIL
  ? await signIn(env, env.USER_OUTSIDER_EMAIL, env.USER_OUTSIDER_PASSWORD)
  : null;

const archiveId = first.archiveId;
const report = {};
const channel = second.supabase.channel(`verify:${crypto.randomUUID()}`);
const testId = crypto.randomUUID();

try {
  // ── One archive, several members, `owner` as a label only ────────────────
  for (const member of members) {
    assert(member.archiveId === archiveId, `${member.email} points at a different archive`);
    assert(
      member.owner === null || member.owner === "u1" || member.owner === "u2",
      `${member.email} carries an unknown owner label`,
    );
  }
  const roster = await first.supabase
    .from("archive_members")
    .select("user_id, owner")
    .eq("archive_id", archiveId);
  fail(roster.error);
  assert(roster.data.length >= members.length, "The roster is smaller than the verified accounts");
  const labels = roster.data.map((row) => row.owner).filter((owner) => owner !== null);
  assert(new Set(labels).size === labels.length, "Two members share one owner label");
  for (const member of members) {
    assert(
      roster.data.some((row) => row.user_id === member.userId),
      `${member.email} is missing from the roster every member can read`,
    );
  }
  report.members = roster.data.length;
  report.verifiedAccounts = members.map((member) => ({ email: member.email, owner: member.owner }));

  // ── Stored data is plaintext, not ciphertext ─────────────────────────────
  const [notes, folders, tags, archive] = await Promise.all([
    first.supabase
      .from("notes")
      .select("id, owner, title, body, ciphertext")
      .eq("archive_id", archiveId),
    first.supabase.from("folders").select("id, name, ciphertext").eq("archive_id", archiveId),
    first.supabase.from("tags").select("id, name, ciphertext").eq("archive_id", archiveId),
    first.supabase
      .from("archives")
      .select("settings, settings_ciphertext")
      .eq("id", archiveId)
      .single(),
  ]);
  for (const result of [notes, folders, tags, archive]) fail(result.error);
  for (const row of notes.data) {
    assert(row.ciphertext === null, `Note ${row.id} still stores ciphertext`);
    assert(typeof row.title === "string", `Note ${row.id} has no plaintext title`);
    assert(typeof row.body === "string", `Note ${row.id} has no plaintext body`);
  }
  for (const row of folders.data) {
    assert(row.ciphertext === null, `Folder ${row.id} still stores ciphertext`);
    assert(typeof row.name === "string" && row.name.length > 0, `Folder ${row.id} has no name`);
  }
  for (const row of tags.data) {
    assert(row.ciphertext === null, `Tag ${row.id} still stores ciphertext`);
    assert(typeof row.name === "string" && row.name.length > 0, `Tag ${row.id} has no name`);
  }
  assert(archive.data.settings_ciphertext === null, "Archive settings still store ciphertext");
  assert(
    archive.data.settings !== null && typeof archive.data.settings === "object",
    "Archive settings are not a plain JSON object",
  );
  report.plaintext = {
    notes: notes.data.length,
    folders: folders.data.length,
    tags: tags.data.length,
    ciphertextRows: 0,
  };

  // ── Files keep their real type behind the same membership rule ───────────
  const objects = await first.supabase.storage.from("note-images").list(archiveId, { limit: 1000 });
  fail(objects.error);
  for (const object of objects.data) {
    assert(
      object.metadata?.mimetype && object.metadata.mimetype !== "application/octet-stream",
      `Object ${object.name} is still stored as opaque bytes`,
    );
  }
  if (objects.data.length > 0) {
    const download = await first.supabase.storage
      .from("note-images")
      .download(`${archiveId}/${objects.data[0].name}`);
    fail(download.error);
    assert((await download.data.arrayBuffer()).byteLength > 0, "A stored file downloaded empty");
  }
  report.objects = {
    count: objects.data.length,
    types: [...new Set(objects.data.map((object) => object.metadata?.mimetype))],
  };

  // ── Realtime reaches the other members ───────────────────────────────────
  let realtimeReceived = false;
  const realtimeEvent = new Promise((resolveEvent) => {
    const timeout = setTimeout(() => resolveEvent(false), REALTIME_TIMEOUT_MS);
    channel.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "notes", filter: `archive_id=eq.${archiveId}` },
      (payload) => {
        if (payload.new?.id !== testId) return;
        clearTimeout(timeout);
        realtimeReceived = true;
        resolveEvent(true);
      },
    );
  });
  await second.supabase.realtime.setAuth(second.token);
  await waitForSubscription(channel);
  await delay(REALTIME_SETTLE_MS);

  const now = new Date().toISOString();
  const inserted = await first.supabase.from("notes").insert({
    id: testId,
    archive_id: archiveId,
    owner: "u1",
    title: "Supabase verification",
    body: "Created by the automated cross-account verification.",
    created_at: now,
    updated_at: now,
  });
  fail(inserted.error);

  await realtimeEvent;
  assert(realtimeReceived, `${second.email} did not receive the Realtime insert event`);
  report.realtime = true;

  // ── Every member reads and writes the same row ───────────────────────────
  const writers = members.slice(1);
  const trail = [];
  for (const writer of writers) {
    const read = await writer.supabase
      .from("notes")
      .select("title, body, version")
      .eq("id", testId)
      .single();
    fail(read.error);
    assert(read.data.title === "Supabase verification", `${writer.email} read the wrong note`);
    const body = `Updated through ${writer.email}.`;
    const updated = await writer.supabase
      .from("notes")
      .update({ body, updated_at: new Date().toISOString(), version: read.data.version + 1 })
      .eq("id", testId)
      .eq("version", read.data.version);
    fail(updated.error);
    trail.push({ email: writer.email, read: true, wrote: true });

    const readBack = await first.supabase.from("notes").select("body").eq("id", testId).single();
    fail(readBack.error);
    assert(readBack.data.body === body, `${first.email} could not read ${writer.email}'s update`);
  }
  report.crossAccount = trail;

  // ── Nobody outside the roster sees anything ──────────────────────────────
  const closedTables = ["archives", "archive_members", "notes", "folders", "tags", "note_tags"];
  for (const table of closedTables) {
    const anonymousRead = await anonymous.from(table).select("*").limit(5);
    fail(anonymousRead.error);
    assert(anonymousRead.data.length === 0, `An anonymous client read ${table}`);
  }
  const anonymousWrite = await anonymous.from("notes").insert({
    id: crypto.randomUUID(),
    archive_id: archiveId,
    owner: "u1",
    title: "should not exist",
    body: "",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  assert(anonymousWrite.error, "An anonymous client inserted a note");
  const anonymousObjects = await anonymous.storage.from("note-images").list(archiveId);
  assert(
    anonymousObjects.error || anonymousObjects.data.length === 0,
    "An anonymous client listed archive files",
  );
  report.anonymous = { rows: 0, insertRejected: true, storageRejected: true };

  if (outsider) {
    for (const table of closedTables) {
      const read = await outsider.supabase.from(table).select("*").limit(5);
      fail(read.error);
      assert(read.data.length === 0, `A member-less account read ${table}`);
    }
    const write = await outsider.supabase.from("notes").insert({
      id: crypto.randomUUID(),
      archive_id: archiveId,
      owner: "u1",
      title: "should not exist",
      body: "",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    assert(write.error, "A member-less account inserted a note");
    const files = await outsider.supabase.storage.from("note-images").list(archiveId);
    assert(files.error || files.data.length === 0, "A member-less account listed archive files");
    report.authenticatedNonMember = { rows: 0, insertRejected: true, storageRejected: true };
  } else {
    report.authenticatedNonMember = "skipped: set USER_OUTSIDER_EMAIL and USER_OUTSIDER_PASSWORD";
  }
} finally {
  const removed = await first.supabase.from("notes").delete().eq("id", testId);
  const leftover = await first.supabase.from("notes").select("id").eq("id", testId);
  report.testNoteRemoved = !removed.error && leftover.data?.length === 0;
  await second.supabase.removeChannel(channel);
  for (const member of members) {
    await member.supabase.auth.signOut({ scope: "local" });
    member.supabase.realtime.disconnect();
  }
  if (outsider) {
    await outsider.supabase.auth.signOut({ scope: "local" });
    outsider.supabase.realtime.disconnect();
  }
  anonymous.realtime.disconnect();
}

assert(report.testNoteRemoved, "The verification note could not be removed");
console.log(JSON.stringify(report, null, 2));
