import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Execute the real account flow with an isolated auth/database/storage boundary.
// Transpilation resolves the browser-only imports without loading the editor.
const source = readFileSync(new URL("./session.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const inviteToken = "a".repeat(64);
const user = { id: "invitee", email: "invited@example.invalid" };

function accountFlow(
  options: { invited?: boolean; confirmation?: boolean; claimError?: string } = {},
) {
  const calls: { name: string; token?: string }[] = [];
  const storage = new Map<string, string>();
  const archiveIds = ["personal"];
  const authData = { data: { user, session: options.confirmation ? null : {} }, error: null };
  const supabase = {
    auth: {
      signUp: async () => authData,
      signInWithPassword: async () => authData,
    },
    rpc: async (name: string, args?: { token: string }) => {
      calls.push({ name, token: args?.token });
      if (name === "claim_archive_invite") {
        if (options.claimError) return { data: null, error: { message: options.claimError } };
        archiveIds.push("shared");
        return { data: "shared", error: null };
      }
      return { data: "personal", error: null };
    },
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        order: async () => ({
          data: archiveIds.map((archive_id) => ({ archive_id, created_at: "2026-10-04" })),
          error: null,
        }),
        in: async () => ({
          data: archiveIds.map((id) => ({ id, name: `${id} notes` })),
          error: null,
        }),
        maybeSingle: async () => ({ data: { user_id: user.id }, error: null }),
      };
      assert.ok(["profiles", "archive_members", "archives"].includes(table));
      return query;
    },
  };
  const exports = {} as typeof import("./session");
  runInNewContext(compiled, {
    exports,
    URL,
    localStorage: {
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
    require: (name: string) => {
      if (name === "./supabaseClient") return { supabase };
      if (name === "@/platform")
        return {
          platform: () => ({
            webOrigin: () => "https://example.invalid/napp/",
            inviteToken: () => (options.invited ? inviteToken : undefined),
          }),
        };
      if (name === "./noteStore") return { resetArchiveCache: () => {} };
      if (name === "./sessionRestore") return { SESSION_KEY: "session" };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return { api: exports, calls, storage };
}

test("invited registration claims the invitation and returns both archives for selection", async () => {
  const flow = accountFlow({ invited: true });
  const result = await flow.api.registerAccount(user.email, "test-password");
  assert.equal(result.confirmationRequired, false);
  if (result.confirmationRequired) throw new Error("Unexpected confirmation");
  assert.equal(result.session, null);
  assert.equal(result.account.userId, user.id);
  assert.deepEqual(
    Array.from(result.archives, (archive) => archive.archiveId),
    ["personal", "shared"],
  );
  assert.deepEqual(flow.calls, [
    { name: "ensure_personal_archive", token: undefined },
    { name: "claim_archive_invite", token: inviteToken },
  ]);
  assert.equal(flow.storage.size, 0);
});

test("ordinary registration opens the personal archive without claiming an invitation", async () => {
  const flow = accountFlow();
  const result = await flow.api.registerAccount(user.email, "test-password");
  assert.equal(result.session?.archiveId, "personal");
  assert.equal(flow.calls.length, 1);
  assert.equal(flow.storage.size, 1);
});

test("registration awaiting email confirmation does not claim or open an archive", async () => {
  const flow = accountFlow({ invited: true, confirmation: true });
  const result = await flow.api.registerAccount(user.email, "test-password");
  assert.equal(result.confirmationRequired, true);
  assert.equal(result.session, null);
  assert.equal(flow.calls.length, 0);
  assert.equal(flow.storage.size, 0);
});

test("a rejected invitation cannot silently open the personal archive after registration", async () => {
  const flow = accountFlow({ invited: true, claimError: "Invitation belongs to another account" });
  await assert.rejects(flow.api.registerAccount(user.email, "test-password"), /another account/);
  assert.equal(flow.storage.size, 0);
});
