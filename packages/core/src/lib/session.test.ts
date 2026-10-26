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
  options: {
    invited?: boolean;
    confirmation?: boolean;
    claimError?: string;
    contentCleanupFails?: boolean;
    signInStatus?: number;
    switchStatus?: number;
  } = {},
) {
  const calls: { name: string; token?: string }[] = [];
  const storage = new Map<string, string>();
  const archiveIds = ["personal"];
  const authData = { data: { user, session: options.confirmation ? null : {} }, error: null };
  const supabase = {
    auth: {
      signUp: async () => authData,
      signInWithPassword: async () =>
        options.signInStatus !== undefined
          ? {
              data: { user: null },
              error: { status: options.signInStatus, message: "Auth refused" },
            }
          : authData,
      getSession: async () => ({
        data: { session: { access_token: "test-access", refresh_token: "test-refresh" } },
      }),
      setSession: async () => ({
        error: options.switchStatus
          ? { status: options.switchStatus, message: "Auth unavailable" }
          : null,
      }),
      signOut: async () => {
        calls.push({ name: "sign-out" });
        return { error: null };
      },
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
      getItem: (key: string) => storage.get(key) ?? null,
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
      if (name === "./noteStore")
        return { resetArchiveCache: () => {}, clearNoteStore: async () => {} };
      if (name === "./storePolicies") return { POLICY_VERSION: "2026-10-24" };
      if (name === "./accountContent")
        return {
          restoreAccountContent: () => {},
          removeAccountContent: async () => {
            calls.push({ name: "remove-local-content" });
            if (options.contentCleanupFails) throw new Error("Local removal blocked");
          },
        };
      if (name === "./sessionRestore") return { SESSION_KEY: "session" };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return { api: exports, calls, storage };
}

test("invited registration claims the invitation and returns both archives for selection", async () => {
  const flow = accountFlow({ invited: true });
  const result = await flow.api.registerAccount(user.email, "test-password", true);
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
  const result = await flow.api.registerAccount(user.email, "test-password", true);
  assert.equal(result.session?.archiveId, "personal");
  assert.equal(flow.calls.length, 1);
  assert.equal(flow.storage.size, 1);
});

test("registration awaiting email confirmation does not claim or open an archive", async () => {
  const flow = accountFlow({ invited: true, confirmation: true });
  const result = await flow.api.registerAccount(user.email, "test-password", true);
  assert.equal(result.confirmationRequired, true);
  assert.equal(result.session, null);
  assert.equal(flow.calls.length, 0);
  assert.equal(flow.storage.size, 0);
});

test("a rejected invitation cannot silently open the personal archive after registration", async () => {
  const flow = accountFlow({ invited: true, claimError: "Invitation belongs to another account" });
  await assert.rejects(
    flow.api.registerAccount(user.email, "test-password", true),
    /another account/,
  );
  assert.equal(flow.storage.size, 0);
});

test("registration requires policy acceptance before contacting Auth", async () => {
  const flow = accountFlow();
  await assert.rejects(flow.api.registerAccount(user.email, "test-password"), /Accept the Terms/);
  assert.equal(flow.calls.length, 0);
});

test("sign-in distinguishes service and rate failures from bad credentials", async () => {
  for (const status of [0, 503, 504]) {
    const flow = accountFlow({ signInStatus: status });
    await assert.rejects(
      flow.api.authenticate(user.email, "test-password"),
      /Could not reach the sign-in service/,
    );
  }
  const limited = accountFlow({ signInStatus: 429 });
  await assert.rejects(
    limited.api.authenticate(user.email, "test-password"),
    /Too many sign-in attempts/,
  );
  const refused = accountFlow({ signInStatus: 400 });
  await assert.rejects(
    refused.api.authenticate(user.email, "test-password"),
    /Email or password is incorrect/,
  );
});

test("automatic locking retains documents but explicit removal finishes before sign-out", async () => {
  const locked = accountFlow();
  await locked.api.authenticate(user.email, "test-password");
  await locked.api.clearSession();
  assert.ok(!locked.calls.some((call) => call.name === "remove-local-content"));
  const explicit = accountFlow();
  await explicit.api.authenticate(user.email, "test-password");
  await explicit.api.clearSession({ removeLocalContent: true });
  assert.ok(
    explicit.calls.findIndex((call) => call.name === "remove-local-content") <
      explicit.calls.findIndex((call) => call.name === "sign-out"),
  );
});

test("failed device cleanup leaves the account available for a retry", async () => {
  const flow = accountFlow({ contentCleanupFails: true });
  await flow.api.authenticate(user.email, "test-password");
  await assert.rejects(
    flow.api.clearSession({ removeLocalContent: true }),
    /Local removal blocked/,
  );
  assert.ok(flow.storage.has("session"));
  assert.ok(!flow.calls.some((call) => call.name === "sign-out"));
});

test("a transient saved-account switch failure does not discard its credentials", async () => {
  const flow = accountFlow({ switchStatus: 503 });
  await flow.api.authenticate(user.email, "test-password");
  flow.storage.set(
    "napp:accounts",
    JSON.stringify([
      {
        userId: "second",
        email: "second@example.invalid",
        archiveId: "shared",
        accessToken: "second-access",
        refreshToken: "second-refresh",
      },
    ]),
  );
  await assert.rejects(flow.api.switchAccount("second"), /Couldn't reach/);
  assert.ok(
    JSON.parse(flow.storage.get("napp:accounts")!).some(
      (account: { userId: string }) => account.userId === "second",
    ),
  );
});
