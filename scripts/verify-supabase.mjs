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
 * USER_ONE and USER_TWO are required. USER_THREE (a further member) and
 * USER_OUTSIDER (an authenticated account that is not a member of this archive
 * — it may well be a member of another one) are verified when their credentials
 * are present.
 *
 * Nothing here reads the retired `owner` label or the `ciphertext` columns. The
 * checks are written against the shape the archive has now, so that they pass
 * both before and after those columns are dropped.
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
    .select("archive_id")
    .eq("user_id", account.userId);
  fail(memberships.error);
  assert(memberships.data.length === 1, `${email} does not have exactly one membership`);
  return { ...account, archiveId: memberships.data[0].archive_id };
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
const viewerFolderId = crypto.randomUUID();
const viewerTagId = crypto.randomUUID();
const viewerObjectId = crypto.randomUUID();
const avatarObjectId = crypto.randomUUID();
const avatarPath = `${first.userId}/${avatarObjectId}`;
let peerRoleChanged = false;

try {
  // ── One archive, several members ─────────────────────────────────────────
  for (const member of members) {
    assert(member.archiveId === archiveId, `${member.email} points at a different archive`);
  }
  const roster = await first.supabase
    .from("archive_members")
    .select("user_id")
    .eq("archive_id", archiveId);
  fail(roster.error);
  assert(roster.data.length >= members.length, "The roster is smaller than the verified accounts");
  assert(
    new Set(roster.data.map((row) => row.user_id)).size === roster.data.length,
    "One account holds two rows in the roster",
  );
  for (const member of members) {
    assert(
      roster.data.some((row) => row.user_id === member.userId),
      `${member.email} is missing from the roster every member can read`,
    );
  }
  report.members = roster.data.length;
  report.verifiedAccounts = members.map((member) => member.email);

  // ── Stored data is plaintext ─────────────────────────────────────────────
  const [notes, folders, tags, archive] = await Promise.all([
    first.supabase.from("notes").select("id, owner_id, title, body").eq("archive_id", archiveId),
    first.supabase.from("folders").select("id, owner_id, name").eq("archive_id", archiveId),
    first.supabase.from("tags").select("id, owner_id, name").eq("archive_id", archiveId),
    first.supabase.from("archives").select("settings").eq("id", archiveId).single(),
  ]);
  for (const result of [notes, folders, tags, archive]) fail(result.error);
  for (const row of notes.data) {
    assert(typeof row.title === "string", `Note ${row.id} has no plaintext title`);
    assert(typeof row.body === "string", `Note ${row.id} has no plaintext body`);
  }
  for (const row of folders.data) {
    assert(typeof row.name === "string" && row.name.length > 0, `Folder ${row.id} has no name`);
  }
  for (const row of tags.data) {
    assert(typeof row.name === "string" && row.name.length > 0, `Tag ${row.id} has no name`);
  }
  assert(
    archive.data.settings !== null && typeof archive.data.settings === "object",
    "Archive settings are not a plain JSON object",
  );
  // Every row belongs to somebody on the roster. A note whose member is not a
  // member is a note that would drop out of every scope on screen.
  const roll = new Set(roster.data.map((row) => row.user_id));
  for (const [table, rows] of [
    ["notes", notes.data],
    ["folders", folders.data],
    ["tags", tags.data],
  ]) {
    for (const row of rows) {
      assert(row.owner_id, `${table} row ${row.id} has no member`);
      assert(roll.has(row.owner_id), `${table} row ${row.id} belongs to a non-member`);
    }
  }
  report.scopes = Object.fromEntries(
    [...roll].map((userId) => [userId, notes.data.filter((row) => row.owner_id === userId).length]),
  );

  report.plaintext = {
    notes: notes.data.length,
    folders: folders.data.length,
    tags: tags.data.length,
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
    owner_id: first.userId,
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

  // ── An archived note can be kept from the other members ──────────────────
  // The one place membership stops meaning "reads everything", so it is the one
  // place worth proving on the server rather than in the interface. A list
  // filtered in the browser would pass every check above and still have handed
  // the rows over.
  const priorHide = await first.supabase
    .from("profiles")
    .select("hide_archived")
    .eq("user_id", first.userId)
    .maybeSingle();
  fail(priorHide.error);

  const peerSeesTestNote = async () => {
    const seen = await second.supabase.from("notes").select("id").eq("id", testId).maybeSingle();
    fail(seen.error);
    return seen.data !== null;
  };

  const archivedNow = new Date().toISOString();
  fail(
    (
      await first.supabase
        .from("profiles")
        .upsert({ user_id: first.userId, hide_archived: true }, { onConflict: "user_id" })
    ).error,
  );
  fail(
    (await first.supabase.from("notes").update({ archived_at: archivedNow }).eq("id", testId))
      .error,
  );

  assert(
    !(await peerSeesTestNote()),
    `${second.email} could still read ${first.email}'s archived note`,
  );
  const ownerStillSees = await first.supabase
    .from("notes")
    .select("id")
    .eq("id", testId)
    .maybeSingle();
  fail(ownerStillSees.error);
  assert(ownerStillSees.data !== null, `${first.email} lost sight of their own archived note`);

  // And it comes back when the setting is off, so the policy is switching on
  // the column rather than hiding every archived note outright.
  fail(
    (
      await first.supabase
        .from("profiles")
        .upsert({ user_id: first.userId, hide_archived: false }, { onConflict: "user_id" })
    ).error,
  );
  assert(
    await peerSeesTestNote(),
    `${second.email} could not read an archived note that is not private`,
  );

  fail((await first.supabase.from("notes").update({ archived_at: null }).eq("id", testId)).error);
  fail(
    (
      await first.supabase
        .from("profiles")
        .upsert(
          { user_id: first.userId, hide_archived: priorHide.data?.hide_archived ?? false },
          { onConflict: "user_id" },
        )
    ).error,
  );
  report.archivedPrivacy = { hiddenFromPeer: true, visibleWhenOff: true };

  // ── A member is a person ─────────────────────────────────────────────────
  const nickname = `Verification ${Date.now()}`;
  const previous = await first.supabase
    .from("profiles")
    .select("nickname, avatar_object")
    .eq("user_id", first.userId)
    .maybeSingle();
  fail(previous.error);
  const wrote = await first.supabase
    .from("profiles")
    .upsert({ user_id: first.userId, nickname }, { onConflict: "user_id" });
  fail(wrote.error);

  const readByPeer = await second.supabase
    .from("profiles")
    .select("user_id, nickname")
    .eq("user_id", first.userId)
    .maybeSingle();
  fail(readByPeer.error);
  assert(
    readByPeer.data?.nickname === nickname,
    `${second.email} could not read ${first.email}'s profile`,
  );

  // Sharing an archive lets you read a profile. It does not let you write one:
  // the row-level USING clause filters the row out, so the update matches
  // nothing rather than failing loudly.
  const forged = await second.supabase
    .from("profiles")
    .update({ nickname: "forged" })
    .eq("user_id", first.userId)
    .select();
  assert(forged.error || forged.data.length === 0, "A member rewrote another member's profile");

  // Put the real profile back before anything else runs.
  const restored = await first.supabase
    .from("profiles")
    .upsert(
      { user_id: first.userId, nickname: previous.data?.nickname ?? "" },
      { onConflict: "user_id" },
    );
  fail(restored.error);
  report.profiles = { readableByPeer: true, writableByPeer: false };

  // Avatar bytes follow the profile boundary: a shared member may read the
  // picture, but only the account named by the first path segment may mutate it.
  const avatarSeed = await first.supabase.storage
    .from("avatars")
    .upload(
      avatarPath,
      new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: "image/png" }),
    );
  fail(avatarSeed.error);
  const avatarByPeer = await second.supabase.storage.from("avatars").download(avatarPath);
  fail(avatarByPeer.error);
  assert((await avatarByPeer.data.arrayBuffer()).byteLength > 0, "A peer read an empty avatar");
  const forgedAvatar = await second.supabase.storage
    .from("avatars")
    .upload(`${first.userId}/${crypto.randomUUID()}`, new Blob(["forged"], { type: "image/png" }));
  assert(forgedAvatar.error, "A member uploaded an avatar under another member's id");
  const changedAvatar = await second.supabase.storage
    .from("avatars")
    .update(avatarPath, new Blob(["forged"], { type: "image/png" }));
  assert(changedAvatar.error, "A member replaced another member's avatar");
  const deletedAvatar = await second.supabase.storage.from("avatars").remove([avatarPath]);
  const avatarStillThere = await first.supabase.storage.from("avatars").download(avatarPath);
  fail(avatarStillThere.error);
  assert(
    deletedAvatar.error || (await avatarStillThere.data.arrayBuffer()).byteLength > 0,
    "A member deleted another member's avatar",
  );
  report.avatars = { readableByPeer: true, writableByPeer: false };

  // ── A viewer reads everything and writes nothing in the archive ─────────
  const archiveName = await first.supabase
    .from("archives")
    .select("name")
    .eq("id", archiveId)
    .single();
  fail(archiveName.error);
  const folderSeed = await first.supabase.from("folders").insert({
    id: viewerFolderId,
    archive_id: archiveId,
    owner_id: first.userId,
    name: "Role verification",
    position: 999999,
  });
  fail(folderSeed.error);
  const tagSeed = await first.supabase.from("tags").insert({
    id: viewerTagId,
    archive_id: archiveId,
    owner_id: first.userId,
    name: "Role verification",
    color: "slate",
  });
  fail(tagSeed.error);
  const objectPath = `${archiveId}/${viewerObjectId}`;
  const objectSeed = await first.supabase.storage
    .from("note-images")
    .upload(objectPath, new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }));
  fail(objectSeed.error);

  const demoted = await first.supabase.rpc("set_archive_member_role", {
    archive_id: archiveId,
    user_id: second.userId,
    role: "viewer",
  });
  fail(demoted.error);
  peerRoleChanged = true;

  async function rejected(resultPromise, label) {
    const result = await resultPromise;
    const noRows = Array.isArray(result.data) && result.data.length === 0;
    assert(result.error || noRows, `A viewer ${label}`);
  }

  await rejected(
    second.supabase
      .from("archives")
      .update({ name: archiveName.data.name })
      .eq("id", archiveId)
      .select(),
    "updated the archive",
  );
  await rejected(
    second.supabase.from("notes").update({ body: "viewer write" }).eq("id", testId).select(),
    "updated a note",
  );
  await rejected(
    second.supabase.from("notes").delete().eq("id", testId).select(),
    "deleted a note",
  );
  await rejected(
    second.supabase
      .from("notes")
      .insert({
        id: crypto.randomUUID(),
        archive_id: archiveId,
        owner_id: second.userId,
        title: "viewer write",
        body: "",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select(),
    "inserted a note",
  );
  await rejected(
    second.supabase
      .from("folders")
      .update({ name: "viewer write" })
      .eq("id", viewerFolderId)
      .select(),
    "updated a folder",
  );
  await rejected(
    second.supabase.from("folders").delete().eq("id", viewerFolderId).select(),
    "deleted a folder",
  );
  await rejected(
    second.supabase
      .from("folders")
      .insert({
        id: crypto.randomUUID(),
        archive_id: archiveId,
        owner_id: second.userId,
        name: "viewer write",
      })
      .select(),
    "inserted a folder",
  );
  await rejected(
    second.supabase.from("tags").update({ name: "viewer write" }).eq("id", viewerTagId).select(),
    "updated a tag",
  );
  await rejected(
    second.supabase.from("tags").delete().eq("id", viewerTagId).select(),
    "deleted a tag",
  );
  await rejected(
    second.supabase
      .from("tags")
      .insert({
        id: crypto.randomUUID(),
        archive_id: archiveId,
        owner_id: second.userId,
        name: "viewer write",
        color: "slate",
      })
      .select(),
    "inserted a tag",
  );
  await rejected(
    second.supabase
      .from("note_tags")
      .insert({
        note_id: testId,
        tag_id: viewerTagId,
        archive_id: archiveId,
        owner_id: first.userId,
      })
      .select(),
    "inserted a note-tag link",
  );
  await rejected(
    second.supabase
      .from("archive_members")
      .update({ role: "editor" })
      .eq("archive_id", archiveId)
      .eq("user_id", second.userId)
      .select(),
    "changed a role directly",
  );
  await rejected(
    second.supabase.from("archive_invites").insert({
      archive_id: archiveId,
      email: "viewer@example.invalid",
      token_hash: new Uint8Array(32),
      invited_by: second.userId,
      role: "editor",
    }),
    "inserted an invitation directly",
  );
  await rejected(
    second.supabase.rpc("create_archive_invite", {
      archive_id: archiveId,
      email: "viewer@example.invalid",
      role: "editor",
    }),
    "created an invitation",
  );
  await rejected(
    second.supabase.rpc("set_archive_member_role", {
      archive_id: archiveId,
      user_id: second.userId,
      role: "editor",
    }),
    "changed a role through the editor RPC",
  );

  const viewerUpload = await second.supabase.storage
    .from("note-images")
    .upload(`${archiveId}/${crypto.randomUUID()}`, new Blob(["x"], { type: "image/png" }));
  assert(viewerUpload.error, "A viewer uploaded an archive object");
  const viewerUpdate = await second.supabase.storage
    .from("note-images")
    .update(objectPath, new Blob(["changed"], { type: "image/png" }));
  assert(viewerUpdate.error, "A viewer updated an archive object");
  const viewerDelete = await second.supabase.storage.from("note-images").remove([objectPath]);
  const objectStillThere = await first.supabase.storage.from("note-images").download(objectPath);
  fail(objectStillThere.error);
  assert(
    viewerDelete.error || (await objectStillThere.data.arrayBuffer()).byteLength > 0,
    "A viewer deleted an archive object",
  );

  const viewerRead = await second.supabase.from("notes").select("id").eq("id", testId).single();
  fail(viewerRead.error);
  report.roles = { viewerReads: true, viewerWritesRejected: true };

  const restoredEditor = await first.supabase.rpc("set_archive_member_role", {
    archive_id: archiveId,
    user_id: second.userId,
    role: "editor",
  });
  fail(restoredEditor.error);
  peerRoleChanged = false;

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
    title: "should not exist",
    body: "",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  assert(anonymousWrite.error, "An anonymous client inserted a note");
  // Profiles are stricter than the archive tables: `anon` holds no grant at
  // all, so the request is refused before RLS is ever consulted.
  const anonymousProfiles = await anonymous.from("profiles").select("*").limit(5);
  assert(
    anonymousProfiles.error || anonymousProfiles.data.length === 0,
    "An anonymous client read profiles",
  );
  const anonymousObjects = await anonymous.storage.from("note-images").list(archiveId);
  assert(
    anonymousObjects.error || anonymousObjects.data.length === 0,
    "An anonymous client listed archive files",
  );
  const anonymousAvatar = await anonymous.storage.from("avatars").download(avatarPath);
  assert(anonymousAvatar.error, "An anonymous client downloaded a member avatar");
  report.anonymous = { rows: 0, insertRejected: true, storageRejected: true };

  if (outsider) {
    // Scoped to this archive on purpose: an outsider may legitimately own rows
    // in an archive of their own, and must still see nothing of this one.
    for (const table of closedTables) {
      const read = await outsider.supabase
        .from(table)
        .select("*")
        .eq(table === "archives" ? "id" : "archive_id", archiveId)
        .limit(5);
      fail(read.error);
      assert(read.data.length === 0, `An account outside the archive read ${table}`);
    }
    const write = await outsider.supabase.from("notes").insert({
      id: crypto.randomUUID(),
      archive_id: archiveId,
      owner_id: first.userId,
      title: "should not exist",
      body: "",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    assert(write.error, "An account outside the archive inserted a note");
    const strangerProfiles = await outsider.supabase
      .from("profiles")
      .select("*")
      .eq("user_id", first.userId);
    fail(strangerProfiles.error);
    assert(
      strangerProfiles.data.length === 0,
      "An account outside the archive read a member's profile",
    );
    const files = await outsider.supabase.storage.from("note-images").list(archiveId);
    assert(
      files.error || files.data.length === 0,
      "An account outside the archive listed its files",
    );
    const strangerAvatar = await outsider.supabase.storage.from("avatars").download(avatarPath);
    assert(strangerAvatar.error, "An account outside the archive downloaded a member avatar");
    report.authenticatedNonMember = { rows: 0, insertRejected: true, storageRejected: true };
  } else {
    report.authenticatedNonMember = "skipped: set USER_OUTSIDER_EMAIL and USER_OUTSIDER_PASSWORD";
  }
} finally {
  if (peerRoleChanged) {
    await first.supabase.rpc("set_archive_member_role", {
      archive_id: archiveId,
      user_id: second.userId,
      role: "editor",
    });
  }
  await first.supabase.storage.from("note-images").remove([`${archiveId}/${viewerObjectId}`]);
  await first.supabase.storage.from("avatars").remove([avatarPath]);
  await first.supabase.from("note_tags").delete().eq("tag_id", viewerTagId);
  await first.supabase.from("folders").delete().eq("id", viewerFolderId);
  await first.supabase.from("tags").delete().eq("id", viewerTagId);
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
