#!/usr/bin/env node

/**
 * Connect an existing Supabase Auth account to the shared archive.
 *
 * Creating the account is not enough: without a `public.archive_members` row
 * every policy in the database says no, which is what the app reports as
 * "This account is not connected to the archive". This script writes that one
 * row, using an existing member's own session — no service-role key involved,
 * because `archive_members_member_all` already lets a member manage the roster.
 *
 * Membership is full read and write over every note, folder, tag and file in
 * the archive; there is no read-only member. Someone who should use the app
 * without seeing these notes needs an archive of their own instead — see
 * `supabase/admin/new-archive-for-person.sql`.
 *
 * The new row carries `owner = null` by default. `owner` is an interface label
 * for the Jacopo / Lisa switch and a unique index allows one row per label per
 * archive, so additional members join unlabelled and open on the u1 view.
 *
 *   NEW_MEMBER_EMAIL=… NEW_MEMBER_PASSWORD=… pnpm add:member
 *   pnpm add:member -- --user-id=<uuid>
 *   pnpm add:member -- --user-id=<uuid> --owner=u2 --dry-run
 */

import { anonClient, assert, fail, loadEnv, requireEnv } from "./lib/env.mjs";

function flag(name) {
  const match = process.argv.find((argument) => argument.startsWith(`--${name}=`));
  return match ? match.slice(name.length + 3) : undefined;
}

const dryRun = process.argv.includes("--dry-run");
const requestedUserId = flag("user-id");
const requestedOwner = flag("owner") ?? null;
assert(
  requestedOwner === null || requestedOwner === "u1" || requestedOwner === "u2",
  "--owner accepts u1 or u2 only",
);

const env = await loadEnv();
requireEnv(env, [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "USER_ONE_EMAIL",
  "USER_ONE_PASSWORD",
]);
assert(
  requestedUserId || (env.NEW_MEMBER_EMAIL && env.NEW_MEMBER_PASSWORD),
  "Pass --user-id=<uuid>, or set NEW_MEMBER_EMAIL and NEW_MEMBER_PASSWORD",
);

const inviterClient = anonClient(env);
const inviteeClient = requestedUserId && !env.NEW_MEMBER_EMAIL ? null : anonClient(env);
const report = { dryRun, owner: requestedOwner };

try {
  const inviter = await inviterClient.auth.signInWithPassword({
    email: env.USER_ONE_EMAIL,
    password: env.USER_ONE_PASSWORD,
  });
  fail(inviter.error);
  const inviterMembership = await inviterClient
    .from("archive_members")
    .select("archive_id, owner")
    .eq("user_id", inviter.data.user.id)
    .single();
  fail(inviterMembership.error);
  const archiveId = inviterMembership.data.archive_id;
  report.archiveId = archiveId;
  report.invitedBy = env.USER_ONE_EMAIL;

  let userId = requestedUserId;
  if (inviteeClient) {
    const invitee = await inviteeClient.auth.signInWithPassword({
      email: env.NEW_MEMBER_EMAIL,
      password: env.NEW_MEMBER_PASSWORD,
    });
    fail(invitee.error);
    assert(invitee.data.user, "The new member could not sign in");
    assert(
      !requestedUserId || requestedUserId === invitee.data.user.id,
      "--user-id does not match the account that signed in",
    );
    userId = invitee.data.user.id;
    report.newMember = env.NEW_MEMBER_EMAIL;

    // Authentication alone must not open the archive. Prove it before writing.
    const beforeNotes = await inviteeClient.from("notes").select("id").limit(5);
    fail(beforeNotes.error);
    report.readableBeforeMembership = beforeNotes.data.length;
  }
  report.userId = userId;

  const existing = await inviterClient
    .from("archive_members")
    .select("user_id, owner")
    .eq("archive_id", archiveId)
    .eq("user_id", userId)
    .maybeSingle();
  fail(existing.error);
  report.alreadyMember = Boolean(existing.data);

  if (!existing.data && !dryRun) {
    const inserted = await inviterClient
      .from("archive_members")
      .insert({ archive_id: archiveId, user_id: userId, owner: requestedOwner });
    fail(inserted.error);
    report.inserted = true;
  }

  const roster = await inviterClient
    .from("archive_members")
    .select("user_id, owner")
    .eq("archive_id", archiveId);
  fail(roster.error);
  report.members = roster.data.length;

  if (inviteeClient && !dryRun) {
    const notes = await inviteeClient.from("notes").select("id").limit(1000);
    fail(notes.error);
    const ownNotes = await inviterClient.from("notes").select("id").limit(1000);
    fail(ownNotes.error);
    assert(
      notes.data.length === ownNotes.data.length,
      "The new member does not see the same notes as the inviter",
    );
    report.readableAfterMembership = notes.data.length;

    // A member must be able to write, not only read. Round-trip one note.
    const probeId = crypto.randomUUID();
    const now = new Date().toISOString();
    const wrote = await inviteeClient.from("notes").insert({
      id: probeId,
      archive_id: archiveId,
      owner: requestedOwner ?? "u1",
      title: "Membership check",
      body: "Written by the new member, removed immediately.",
      created_at: now,
      updated_at: now,
    });
    fail(wrote.error);
    const seenByInviter = await inviterClient.from("notes").select("id").eq("id", probeId);
    fail(seenByInviter.error);
    const removed = await inviteeClient.from("notes").delete().eq("id", probeId);
    fail(removed.error);
    assert(seenByInviter.data.length === 1, "The inviter could not see the new member's write");
    report.writeRoundTrip = true;
  }
} finally {
  await inviterClient.auth.signOut({ scope: "local" });
  inviterClient.realtime.disconnect();
  if (inviteeClient) {
    await inviteeClient.auth.signOut({ scope: "local" });
    inviteeClient.realtime.disconnect();
  }
}

console.log(JSON.stringify(report, null, 2));
