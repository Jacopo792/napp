#!/usr/bin/env node
// Disposable manual-QA accounts only. Credentials are written to a private
// temporary file for the local UI driver, never printed or committed.
import assert from "node:assert/strict";
import { readFile, writeFile, unlink } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./lib/env.mjs";
import { adminClient } from "./lib/admin-client.mjs";
const path = "/private/tmp/napp-store-ui-fixtures.json";
const action = process.argv[2];
assert(["--create", "--cleanup"].includes(action), "Use --create or --cleanup");
const admin = await adminClient();
const checked = (result) => {
  if (result.error) throw new Error(result.error.message);
  return result.data;
};
const liveUser = async (id) => {
  const result = await admin.auth.admin.getUserById(id);
  if (result.error) {
    if (result.error.status === 404 || result.error.code === "user_not_found") return null;
    throw new Error("Could not verify fixture identity; keep the manifest and retry cleanup");
  }
  assert(result.data.user, "Unexpected account lookup; retain fixture manifest");
  return result.data.user;
};
if (action === "--create") {
  let found = false;
  try {
    await readFile(path);
    found = true;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  assert(!found, "Existing UI fixtures must be reused or cleaned up first");
  const fixture = { users: [], archives: [], stamp: crypto.randomUUID() };
  const save = () => writeFile(path, JSON.stringify(fixture), { mode: 0o600 });
  await save();
  try {
    for (const name of ["Writer", "Partner"]) {
      const email = `store-ui-${name.toLowerCase()}-${fixture.stamp}@example.test`;
      const password = `Napp-${crypto.randomUUID()}`;
      const { user } = checked(
        await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { napp_terms_version: "2026-10-24", napp_privacy_version: "2026-10-24" },
        }),
      );
      fixture.users.push({ id: user.id, email, password, name });
      await save();
      checked(await admin.from("profiles").upsert({ user_id: user.id, nickname: name }));
    }
    const archive = crypto.randomUUID();
    checked(
      await admin
        .from("archives")
        .insert({ id: archive, name: "Store QA", created_by: fixture.users[0].id }),
    );
    fixture.archives.push(archive);
    await save();
    checked(
      await admin
        .from("archive_members")
        .insert(fixture.users.map((user) => ({ archive_id: archive, user_id: user.id }))),
    );
    for (const [i, user] of fixture.users.entries()) {
      checked(
        await admin.from("notes").insert({
          id: crypto.randomUUID(),
          archive_id: archive,
          owner_id: user.id,
          title: i ? "Partner's retained note" : "Writer's disposable note",
          body: "Fictional store QA content",
          content: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Fictional store QA content" }],
              },
            ],
          },
          content_version: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
      );
    }
    console.log(
      "Created two disposable UI accounts; credentials saved privately in the temporary fixture file",
    );
  } catch (error) {
    console.error("Fixture setup incomplete: run --cleanup before retrying");
    throw error;
  }
} else {
  const fixture = JSON.parse(await readFile(path, "utf8"));
  assert(/^[0-9a-f-]{36}$/.test(fixture.stamp), "Invalid fixture manifest");
  for (const user of fixture.users) {
    assert(
      user.email.startsWith("store-ui-") && user.email.endsWith(`${fixture.stamp}@example.test`),
      "Non-fixture account refused",
    );
    const live = await liveUser(user.id);
    if (live) assert.equal(live.email, user.email, "Fixture identity mismatch");
  }
  const env = await loadEnv();
  for (const user of fixture.users) {
    const live = await liveUser(user.id);
    if (!live) continue;
    const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    checked(await client.auth.signInWithPassword({ email: user.email, password: user.password }));
    const receipt = checked(
      await client.functions.invoke("delete-account", {
        body: {
          action: "delete",
          confirm: true,
          expected_user_id: user.id,
          password: user.password,
          request_token: crypto.randomUUID(),
        },
      }),
    );
    assert(["processing", "completed"].includes(receipt?.status), "Deletion not confirmed");
    const deadline = Date.now() + 100_000;
    let status = receipt.status;
    while (status !== "completed" && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      status = checked(
        await admin.rpc("account_erasure_status", { request_token: receipt.requestToken }),
      );
    }
    assert.equal(
      status,
      "completed",
      "Fixture erasure still processing; retain manifest and retry later",
    );
  }
  // Only our explicitly created archive may remain after a partial setup.
  for (const id of fixture.archives) checked(await admin.from("archives").delete().eq("id", id));
  await unlink(path);
  console.log("Removed disposable UI fixtures and their temporary credentials");
}
