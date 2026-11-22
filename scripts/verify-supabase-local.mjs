#!/usr/bin/env node

/* Destructive verification is allowed only against `supabase start`. The
 * endpoint and keys come from that local stack, never from .env files. */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const { stdout } = await exec("supabase", ["status", "-o", "env"], { timeout: 20_000 });
const values = Object.fromEntries(
  stdout
    .split(/\r?\n/)
    .map((line) => line.match(/^([^=]+)=(.*)$/))
    .filter(Boolean)
    .map((match) => [match[1], match[2].replace(/^"(.*)"$/, "$1")]),
);

const url = values.API_URL;
const key = values.PUBLISHABLE_KEY ?? values.ANON_KEY;
const service = values.SERVICE_ROLE_KEY;
if (!url || !key || !service) throw new Error("Local Supabase is not running");
const endpoint = new URL(url);
if (
  endpoint.protocol !== "http:" ||
  !["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname)
) {
  throw new Error("verify:supabase:local only accepts a localhost Supabase stack");
}

const { createClient } = await import("@supabase/supabase-js");
const admin = createClient(url, service, { auth: { persistSession: false } });
const run = Date.now().toString(36);

async function member(label) {
  const email = `verify-${label}-${run}@example.test`;
  const password = `verify-${run}-${label}-correct-horse`;
  const made = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { napp_terms_version: "2026-11-16", napp_privacy_version: "2026-11-16" },
  });
  if (made.error) throw new Error(`${label}: ${made.error.message}`);
  return { email, password };
}

async function asMember(account) {
  const client = createClient(url, key, { auth: { persistSession: false } });
  const signedIn = await client.auth.signInWithPassword(account);
  if (signedIn.error) throw new Error(`${account.email}: ${signedIn.error.message}`);
  const profile = await client.from("profiles").insert({
    user_id: signedIn.data.user.id,
    nickname: account.email.split("@")[0],
  });
  if (profile.error) throw new Error(`fixture profile: ${profile.error.message}`);
  return client;
}

const one = await member("one");
const two = await member("two");
const outsider = await member("outsider");
const firstClient = await asMember(one);
const secondClient = await asMember(two);
const bootstrapped = await firstClient.rpc("ensure_personal_archive");
if (bootstrapped.error) throw new Error(`bootstrap: ${bootstrapped.error.message}`);
const invited = await firstClient.rpc("create_archive_invite", {
  archive_id: bootstrapped.data,
  email: two.email,
  role: "editor",
});
if (invited.error) throw new Error(`invite: ${invited.error.message}`);
const claimed = await secondClient.rpc("claim_archive_invite", { token: invited.data });
if (claimed.error) throw new Error(`claim: ${claimed.error.message}`);

// Exercise the protections through Auth, PostgREST and Storage as a member,
// rather than through a sessionless service role.
const guest = createClient(url, key, { auth: { persistSession: false } });
const joinedGuest = await guest.auth.signInAnonymously();
assert.ifError(joinedGuest.error);
const guestId = joinedGuest.data.user.id;
try {
  assert.equal((await guest.rpc("has_accepted_policies")).data, false);
  assert.ifError(
    (
      await guest.rpc("accept_policies", {
        terms_version: "2026-11-16",
        privacy_version: "2026-11-16",
      })
    ).error,
  );
  assert.ifError((await guest.rpc("ensure_personal_archive")).error);
  assert.ok((await guest.rpc("claim_archive_invite", { token: invited.data })).error);
  assert.ok(
    (
      await guest.storage
        .from("avatars")
        .upload(`${guestId}/${crypto.randomUUID()}`, new Blob(["test"], { type: "image/png" }))
    ).error,
  );
} finally {
  // The account contains only its disposable empty personal archive.
  assert.ifError((await admin.from("archives").delete().eq("created_by", guestId)).error);
  assert.ifError((await admin.auth.admin.deleteUser(guestId)).error);
}

for (let count = 1; count < 20; count++) {
  const renewed = await firstClient.rpc("create_archive_invite", {
    archive_id: bootstrapped.data,
    email: outsider.email,
    role: "editor",
  });
  assert.ifError(renewed.error);
}
const capped = await firstClient.rpc("create_archive_invite", {
  archive_id: bootstrapped.data,
  email: outsider.email,
  role: "editor",
});
assert.equal(capped.error?.code, "PT429");

const suspension = await member("suspension");
const suspended = await asMember(suspension);
const oldSession = (await suspended.auth.getSession()).data.session;
assert.ok(oldSession);
assert.ifError(
  (
    await admin.rpc("set_account_suspension", {
      target_user_id: oldSession.user.id,
      suspended: true,
    })
  ).error,
);
const rejectedWrite = await suspended
  .from("profiles")
  .update({ nickname: "Stale" })
  .eq("user_id", oldSession.user.id)
  .select("user_id");
assert.equal(rejectedWrite.data?.length ?? 0, 0);
assert.ok((await suspended.auth.refreshSession()).error);
assert.ifError((await admin.auth.admin.deleteUser(oldSession.user.id)).error);
console.log(
  "Local Auth/Storage checks passed: acceptance, anonymous restrictions, invite cap and revoked sessions.",
);

// A benign attachment tests the same Storage copy used for a reported file.
const author = (await secondClient.auth.getUser()).data.user;
assert.ok(author);
const avatarId = crypto.randomUUID();
const avatarPath = `${author.id}/${avatarId}`;
const benign = "local safety evidence fixture";
const avatarBucket = secondClient.storage.from("avatars");
assert.ifError(
  (await avatarBucket.upload(avatarPath, new Blob([benign], { type: "image/png" }))).error,
);
assert.ifError(
  (await secondClient.from("profiles").update({ avatar_object: avatarId }).eq("user_id", author.id))
    .error,
);
const reported = await firstClient.rpc("report_safety_issue", {
  reason_code: "harassment",
  target_user_id: author.id,
});
assert.ifError(reported.error);
assert.equal((await admin.rpc("account_erasure_held", { target_user_id: author.id })).data, true);
assert.ok((await avatarBucket.remove([avatarPath])).error);
assert.ifError((await admin.functions.invoke("safety-worker", { body: {} })).error);
const preserved = await admin.rpc("safety_report_detail", { target_report_id: reported.data });
assert.ifError(preserved.error);
const [evidence] = preserved.data.evidence;
assert.ok(evidence.copied_at);
const copy = await admin.storage.from("safety-evidence").download(evidence.path);
assert.ifError(copy.error);
assert.equal(await copy.data.text(), benign);
assert.ok((await firstClient.storage.from("safety-evidence").download(evidence.path)).error);
assert.ifError(
  (
    await admin.rpc("review_safety_report", {
      target_report_id: reported.data,
      hide_content: false,
    })
  ).error,
);
assert.ifError(
  (await secondClient.from("profiles").update({ avatar_object: null }).eq("user_id", author.id))
    .error,
);
assert.ifError((await avatarBucket.remove([avatarPath])).error);
console.log("Local safety evidence check passed: hold, private copy and source removal.");

/* A freshly reset local stack reports Realtime as healthy before its tenant
 * has finished starting. Prime that one-time path here so the archive
 * verification measures delivery rather than the container's cold start. */
const session = (await secondClient.auth.getSession()).data.session;
if (!session) throw new Error("Realtime warm-up has no authenticated session");
await secondClient.realtime.setAuth(session.access_token);
const warmup = secondClient.channel(`verify-warmup:${crypto.randomUUID()}`);
await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error("Realtime warm-up timed out")), 20_000);
  warmup.subscribe((status, error) => {
    if (status === "SUBSCRIBED") {
      clearTimeout(timeout);
      resolve();
    } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
      clearTimeout(timeout);
      reject(new Error(`Realtime warm-up failed: ${error?.message ?? status}`));
    }
  });
});
await new Promise((resolve) => setTimeout(resolve, 3_000));
await secondClient.removeChannel(warmup);
secondClient.realtime.disconnect();

process.env.VITE_SUPABASE_URL = url;
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = key;
process.env.USER_ONE_EMAIL = one.email;
process.env.USER_ONE_PASSWORD = one.password;
process.env.USER_TWO_EMAIL = two.email;
process.env.USER_TWO_PASSWORD = two.password;
process.env.USER_OUTSIDER_EMAIL = outsider.email;
process.env.USER_OUTSIDER_PASSWORD = outsider.password;
process.env.VERIFY_SUPABASE_LOCAL = "1";
process.env.SUPABASE_SERVICE_ROLE_KEY = service;
await import("./verify-supabase.mjs");
