#!/usr/bin/env node

/* Destructive verification is allowed only against `supabase start`. The
 * endpoint and keys come from that local stack, never from .env files. */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const { stdout } = await exec("supabase", ["status", "-o", "env"], { cwd: process.cwd() });
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
const host = new URL(url).hostname;
if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
  throw new Error("verify:supabase:local only accepts a localhost Supabase stack");
}

const { createClient } = await import("@supabase/supabase-js");
const admin = createClient(url, service, { auth: { persistSession: false } });
const run = Date.now().toString(36);

async function member(label) {
  const email = `verify-${label}-${run}@example.test`;
  const password = `verify-${run}-${label}-correct-horse`;
  const made = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (made.error) throw new Error(`${label}: ${made.error.message}`);
  return { email, password };
}

async function asMember(account) {
  const client = createClient(url, key, { auth: { persistSession: false } });
  const signedIn = await client.auth.signInWithPassword(account);
  if (signedIn.error) throw new Error(`${account.email}: ${signedIn.error.message}`);
  await client.from("profiles").insert({
    user_id: signedIn.data.user.id,
    nickname: account.email.split("@")[0],
  });
  return client;
}

const one = await member("one");
const two = await member("two");
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
process.env.VERIFY_SUPABASE_LOCAL = "1";
await import("./verify-supabase.mjs");
