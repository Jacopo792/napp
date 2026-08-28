#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { decryptNote, encryptNote, importArchiveKey, unwrapArchiveKey } from "../src/lib/crypto.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function loadEnv() {
  const values = {};
  for (const filename of [".env", ".env.local"]) {
    try {
      const content = await readFile(resolve(root, filename), "utf8");
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
        const separator = trimmed.indexOf("=");
        values[trimmed.slice(0, separator).trim()] = trimmed
          .slice(separator + 1)
          .trim()
          .replace(/^['"]|['"]$/g, "");
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return { ...values, ...process.env };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function client(url, key) {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

async function loginAndUnlock(supabase, email, password, passphrase) {
  const signedIn = await supabase.auth.signInWithPassword({ email, password });
  if (signedIn.error || !signedIn.data.user) throw signedIn.error ?? new Error("Login failed");
  const vault = await supabase
    .from("vault_keys")
    .select("archive_id, wrapped_dek, kdf_salt, kdf_iterations")
    .eq("user_id", signedIn.data.user.id)
    .single();
  if (vault.error) throw vault.error;
  const rawDek = await unwrapArchiveKey(
    {
      wrappedDek: vault.data.wrapped_dek,
      kdfSalt: vault.data.kdf_salt,
      kdfIterations: vault.data.kdf_iterations,
    },
    passphrase,
  );
  return {
    archiveId: vault.data.archive_id,
    key: await importArchiveKey(rawDek),
    rawDek,
  };
}

function waitForSubscription(channel) {
  return new Promise((resolveSubscription, reject) => {
    const timeout = setTimeout(() => reject(new Error("Realtime subscription timed out")), 12_000);
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(timeout);
        resolveSubscription();
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        clearTimeout(timeout);
        reject(new Error(`Realtime subscription failed: ${status}`));
      }
    });
  });
}

const env = await loadEnv();
for (const name of [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "USER_ONE_EMAIL",
  "USER_ONE_PASSWORD",
  "USER_ONE_PASSPHRASE",
  "USER_TWO_EMAIL",
  "USER_TWO_PASSWORD",
  "USER_TWO_PASSPHRASE",
]) {
  assert(env[name], `Missing ${name}`);
}

const firstClient = client(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY);
const secondClient = client(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY);
const anonymousClient = client(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY);

const first = await loginAndUnlock(
  firstClient,
  env.USER_ONE_EMAIL,
  env.USER_ONE_PASSWORD,
  env.USER_ONE_PASSPHRASE,
);
const second = await loginAndUnlock(
  secondClient,
  env.USER_TWO_EMAIL,
  env.USER_TWO_PASSWORD,
  env.USER_TWO_PASSPHRASE,
);
assert(first.archiveId === second.archiveId, "Accounts point to different archives");
assert(
  Buffer.from(first.rawDek).equals(Buffer.from(second.rawDek)),
  "Accounts did not unwrap the same DEK",
);

const membership = await firstClient
  .from("archive_members")
  .select("user_id")
  .eq("archive_id", first.archiveId);
if (membership.error) throw membership.error;
assert(membership.data.length === 2, "The archive does not have exactly two members");

const testId = crypto.randomUUID();
const now = new Date().toISOString();
const original = {
  id: testId,
  title: "Supabase verification",
  body: "Created by the automated cross-account verification.",
  owner: "u1",
  createdAt: now,
  updatedAt: now,
};

let realtimeReceived = false;
const channel = secondClient.channel(`verify:${testId}`);
const realtimePromise = new Promise((resolveEvent) => {
  const timeout = setTimeout(() => resolveEvent(false), 10_000);
  channel.on(
    "postgres_changes",
    {
      event: "INSERT",
      schema: "public",
      table: "notes",
      filter: `archive_id=eq.${first.archiveId}`,
    },
    () => {
      clearTimeout(timeout);
      realtimeReceived = true;
      resolveEvent(true);
    },
  );
});
await waitForSubscription(channel);

try {
  const inserted = await firstClient.from("notes").insert({
    id: testId,
    archive_id: first.archiveId,
    owner: "u1",
    ciphertext: await encryptNote(original, first.key),
    created_at: original.createdAt,
    updated_at: original.updatedAt,
  });
  if (inserted.error) throw inserted.error;

  await realtimePromise;
  assert(realtimeReceived, "Lisa did not receive the Realtime insert event");

  const readBySecond = await secondClient
    .from("notes")
    .select("ciphertext, version")
    .eq("id", testId)
    .single();
  if (readBySecond.error) throw readBySecond.error;
  const decryptedBySecond = await decryptNote(readBySecond.data.ciphertext, second.key);
  assert(decryptedBySecond.title === original.title, "Lisa could not decrypt Jacopo's note");

  const updatedNote = {
    ...decryptedBySecond,
    body: "Updated through Lisa's account.",
    updatedAt: new Date().toISOString(),
  };
  const updated = await secondClient
    .from("notes")
    .update({
      ciphertext: await encryptNote(updatedNote, second.key),
      updated_at: updatedNote.updatedAt,
      version: readBySecond.data.version + 1,
    })
    .eq("id", testId)
    .eq("version", readBySecond.data.version);
  if (updated.error) throw updated.error;

  const readBack = await firstClient.from("notes").select("ciphertext").eq("id", testId).single();
  if (readBack.error) throw readBack.error;
  const decryptedByFirst = await decryptNote(readBack.data.ciphertext, first.key);
  assert(decryptedByFirst.body === updatedNote.body, "Jacopo could not read Lisa's update");

  const anonymous = await anonymousClient.from("notes").select("id");
  if (anonymous.error) throw anonymous.error;
  assert(anonymous.data.length === 0, "Anonymous client could read notes");
} finally {
  await firstClient.from("notes").delete().eq("id", testId);
  await secondClient.removeChannel(channel);
  await firstClient.auth.signOut({ scope: "local" });
  await secondClient.auth.signOut({ scope: "local" });
  firstClient.realtime.disconnect();
  secondClient.realtime.disconnect();
  anonymousClient.realtime.disconnect();
}

console.log(
  JSON.stringify(
    {
      jacopoLogin: true,
      lisaLogin: true,
      sameArchive: true,
      sameDek: true,
      members: 2,
      realtime: realtimeReceived,
      lisaReadJacopoNote: true,
      jacopoReadLisaUpdate: true,
      anonymousRows: 0,
      testNoteRemoved: true,
    },
    null,
    2,
  ),
);
