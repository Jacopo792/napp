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
    archives?: { id: string; kind: string }[];
    expired?: boolean;
    offline?: boolean;
    readError?: boolean;
    /** The first membership read carries no token: RLS answers with no rows. */
    emptyOnce?: boolean;
    /** The server no longer knows this session. */
    lost?: boolean;
    authStatus?: number;
    contentCleanupFails?: boolean;
    signInError?: { status?: number; message: string };
  } = {},
) {
  const calls: { name: string; token?: string }[] = [];
  const storage = new Map<string, string>();
  const signUpCalls: unknown[] = [];
  const archiveIds = options.archives?.map((archive) => archive.id) ?? ["personal"];
  let activeUser = user;
  let tokens = { access_token: "current-access", refresh_token: "current-refresh" };
  let listener: (event: string, session: unknown) => void = () => {};
  let emptyReads = options.emptyOnce ? 1 : 0;
  const authData = { data: { user, session: options.confirmation ? null : {} }, error: null };
  const supabase = {
    auth: {
      signUp: async (input: unknown) => {
        signUpCalls.push(input);
        return authData;
      },
      signInWithPassword: async () =>
        options.signInError
          ? { data: { user: null, session: null }, error: options.signInError }
          : authData,
      getSession: async () => ({ data: { session: { ...tokens, user: activeUser } } }),
      getUser: async () =>
        options.lost || options.authStatus
          ? {
              data: { user: null },
              error: { message: "Auth unavailable", status: options.authStatus ?? 400 },
            }
          : { data: { user: activeUser }, error: null },
      onAuthStateChange: (callback: typeof listener) => {
        listener = callback;
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
      stopAutoRefresh: async () => {
        calls.push({ name: "pause-refresh" });
      },
      signOut: async () => {
        calls.push({ name: "sign-out" });
      },
      setSession: async () => {
        if (options.expired)
          return { data: { user: null }, error: { message: "Expired", status: 400 } };
        if (options.offline)
          return { data: { user: null }, error: { message: "Failed to fetch", status: 0 } };
        activeUser = { id: "second", email: "second@example.invalid" };
        tokens = { access_token: "rotated-access", refresh_token: "rotated-refresh" };
        return { data: { user: activeUser }, error: null };
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
          data: (emptyReads-- > 0 ? [] : archiveIds).map((archive_id) => ({
            archive_id,
            created_at: "2026-10-04",
          })),
          error: null,
        }),
        in: async () => ({
          data: archiveIds.map((id) => ({
            id,
            name: `${id} notes`,
            kind: options.archives?.find((archive) => archive.id === id)?.kind ?? "notes",
          })),
          error: options.readError ? { message: "Unavailable" } : null,
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
        return {
          resetArchiveCache: () => {},
          clearNoteStore: async () => {
            calls.push({ name: "clear-cache" });
          },
        };
      if (name === "./storePolicies") return { POLICY_VERSION: "2026-10-24" };
      if (name === "./accountContent")
        return {
          restoreAccountContent: () => {},
          removeAccountContent: async () => {
            calls.push({ name: "remove-local-content" });
            if (options.contentCleanupFails) throw new Error("Local removal blocked");
          },
        };
      if (name === "./sessionRestore")
        return { SESSION_KEY: "session", SIGNED_IN_BEFORE_KEY: "signed-in-before" };
      if (name === "./policyAcceptance") return { acceptPolicies: async () => {} };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return {
    api: exports,
    signUpCalls,
    calls,
    storage,
    announce: (event: string, session: unknown) => listener(event, session),
  };
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

test("registration cannot reach Auth without accepting policies", async () => {
  const flow = accountFlow();
  await assert.rejects(flow.api.registerAccount(user.email, "test-password"), /Accept the Terms/);
  assert.equal(flow.signUpCalls.length, 0);
  assert.equal(flow.storage.size, 0);
});

test("ordinary registration opens the personal archive without claiming an invitation", async () => {
  const flow = accountFlow();
  const result = await flow.api.registerAccount(user.email, "test-password", true);
  assert.equal(result.session?.archiveId, "personal");
  const input = flow.signUpCalls[0] as { options: { data: Record<string, string> } };
  assert.equal(input.options.data.napp_terms_version, "2026-10-24");
  assert.equal(input.options.data.napp_privacy_version, "2026-10-24");
  assert.ok(Number.isFinite(Date.parse(input.options.data.napp_policies_accepted_at)));
  assert.equal(flow.calls.length, 1);
  // The archive session, and the mark that this phone has held a real account.
  assert.deepEqual([...flow.storage.keys()].sort(), ["session", "signed-in-before"]);
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

const mixedArchives = [
  { id: "book", kind: "document" },
  { id: "personal", kind: "notes" },
  { id: "shared", kind: "notes" },
];
test("mobile login excludes Books and preserves every ordinary and shared archive", async () => {
  const flow = accountFlow({ archives: mixedArchives });
  const result = await flow.api.authenticate(user.email, "test-password", undefined, {
    notesOnly: true,
  });
  assert.equal(result.session, null);
  assert.deepEqual(
    Array.from(result.archives, (item) => item.archiveId),
    ["personal", "shared"],
  );
  await assert.rejects(
    flow.api.chooseArchive(result.account, "book", { notesOnly: true }),
    /no longer available/,
  );
  assert.equal(
    (await flow.api.chooseArchive(result.account, "shared", { notesOnly: true })).archiveId,
    "shared",
  );
});
test("desktop login still includes document archives", async () => {
  const flow = accountFlow({ archives: mixedArchives });
  const result = await flow.api.authenticate(user.email, "test-password");
  assert.deepEqual(
    Array.from(result.archives, (item) => item.archiveId),
    ["book", "personal", "shared"],
  );
});
for (const archives of [[{ id: "book", kind: "document" }], []]) {
  test(`mobile login handles ${archives.length ? "only Books" : "no archives"} without storing a wrong archive`, async () => {
    const flow = accountFlow({ archives });
    const result = await flow.api.authenticate(user.email, "test-password", undefined, {
      notesOnly: true,
    });
    assert.equal(result.session, null);
    assert.equal(result.archives.length, 0);
    assert.equal(flow.storage.has("session"), false);
  });
}
function saveSecond(storage: Map<string, string>, archiveId = "book") {
  storage.set(
    "napp:accounts",
    JSON.stringify([
      {
        userId: "second",
        email: "second@example.invalid",
        archiveId,
        accessToken: "saved-access",
        refreshToken: "saved-refresh",
      },
    ]),
  );
}
test("native add preserves a usable token without server sign-out or a password", async () => {
  const flow = accountFlow();
  await flow.api.authenticate(user.email, "test-password");
  await flow.api.pauseAccount();
  assert.equal(flow.storage.has("session"), false);
  const accounts = JSON.parse(flow.storage.get("napp:accounts")!);
  assert.equal(accounts[0].refreshToken, "current-refresh");
  assert.equal(flow.storage.get("napp:accounts")!.includes("test-password"), false);
  assert.ok(flow.calls.some((call) => call.name === "clear-cache"));
  assert.ok(!flow.calls.some((call) => call.name === "sign-out"));
});
test("native switch validates membership, falls back from a Book, and keeps the first account for return", async () => {
  const flow = accountFlow({ archives: mixedArchives });
  await flow.api.chooseArchive({ userId: user.id, email: user.email }, "personal");
  saveSecond(flow.storage);
  const result = await flow.api.resumeAccount("second", { notesOnly: true });
  assert.equal(result.session?.userId, "second");
  assert.equal(result.session?.archiveId, "personal");
  assert.deepEqual(
    Array.from(flow.api.otherAccounts("second"), (item) => item.userId),
    [user.id],
  );
  await flow.api.clearSession();
  assert.deepEqual(
    Array.from(flow.api.otherAccounts(""), (item) => item.userId),
    [user.id],
  );
  assert.equal(flow.storage.has("session"), false);
});
test("automatic locking keeps offline documents while explicit removal completes before sign-out", async () => {
  const locked = accountFlow();
  await locked.api.authenticate(user.email, "test-password");
  await locked.api.clearSession();
  assert.ok(!locked.calls.some((call) => call.name === "remove-local-content"));
  const removed = accountFlow();
  await removed.api.authenticate(user.email, "test-password");
  await removed.api.clearSession({ removeLocalContent: true });
  assert.ok(
    removed.calls.findIndex((call) => call.name === "remove-local-content") <
      removed.calls.findIndex((call) => call.name === "sign-out"),
  );
});
test("sign-in distinguishes an unavailable service and rate limiting from a refused password", async () => {
  for (const status of [undefined, 0, 503, 504]) {
    const flow = accountFlow({ signInError: { status, message: "Unavailable" } });
    await assert.rejects(
      flow.api.authenticate(user.email, "test-password"),
      /Could not reach the sign-in service/,
    );
  }
  const limited = accountFlow({ signInError: { status: 429, message: "Too many requests" } });
  await assert.rejects(
    limited.api.authenticate(user.email, "test-password"),
    /Too many sign-in attempts/,
  );
  const refused = accountFlow({ signInError: { status: 400, message: "Invalid credentials" } });
  await assert.rejects(
    refused.api.authenticate(user.email, "test-password"),
    /Email or password is incorrect/,
  );
});
test("a failed local removal preserves the account so the person can retry", async () => {
  const flow = accountFlow({ contentCleanupFails: true });
  await flow.api.authenticate(user.email, "test-password");
  await assert.rejects(
    flow.api.clearSession({ removeLocalContent: true }),
    /Local removal blocked/,
  );
  assert.ok(flow.storage.has("session"));
  assert.ok(!flow.calls.some((call) => call.name === "sign-out"));
});
test("an expired saved token is removed while the current account remains recoverable", async () => {
  const flow = accountFlow({ expired: true });
  await flow.api.authenticate(user.email, "test-password");
  saveSecond(flow.storage);
  await assert.rejects(flow.api.resumeAccount("second", { notesOnly: true }), /Sign in to second/);
  assert.equal(flow.api.otherAccounts(user.id).length, 0);
  assert.equal(JSON.parse(flow.storage.get("session")!).userId, user.id);
});
test("a dropped connection keeps the saved account instead of asking for a password", async () => {
  const flow = accountFlow({ offline: true });
  await flow.api.authenticate(user.email, "test-password");
  saveSecond(flow.storage);
  await assert.rejects(flow.api.resumeAccount("second", { notesOnly: true }), /Try again/);
  assert.equal(flow.api.otherAccounts(user.id).length, 1);
});
test("switching to a Books-only account produces an empty chooser, not a stale session", async () => {
  const flow = accountFlow({ archives: [{ id: "book", kind: "document" }] });
  saveSecond(flow.storage);
  const result = await flow.api.resumeAccount("second", { notesOnly: true });
  assert.equal(result.session, null);
  assert.equal(result.archives.length, 0);
  assert.equal(flow.storage.has("session"), false);
});

test("returning after add uses the SDK's current token instead of a saved stale token", async () => {
  const flow = accountFlow({ expired: true });
  await flow.api.authenticate(user.email, "test-password");
  await flow.api.pauseAccount();
  const result = await flow.api.resumeAccount(user.id, { notesOnly: true });
  assert.equal(result.session?.userId, user.id);
});
test("a membership read failure after auth changes cannot leave the old archive session", async () => {
  const flow = accountFlow({ readError: true });
  flow.storage.set(
    "session",
    JSON.stringify({ userId: user.id, email: user.email, archiveId: "personal" }),
  );
  saveSecond(flow.storage);
  await assert.rejects(flow.api.resumeAccount("second", { notesOnly: true }), /Unavailable/);
  assert.equal(flow.storage.has("session"), false);
});

test("a refresh after the account was left is followed onto the shelf", async () => {
  const flow = accountFlow();
  saveSecond(flow.storage);
  flow.announce("TOKEN_REFRESHED", {
    user: { id: "second" },
    access_token: "next-access",
    refresh_token: "next-refresh",
  });
  const [saved] = JSON.parse(flow.storage.get("napp:accounts")!);
  assert.equal(saved.refreshToken, "next-refresh");
  flow.announce("TOKEN_REFRESHED", {
    user: { id: "stranger" },
    access_token: "x",
    refresh_token: "y",
  });
  assert.equal(JSON.parse(flow.storage.get("napp:accounts")!).length, 1);
});
test("no rows read without a token is read again, never shown as no archives", async () => {
  const flow = accountFlow({ emptyOnce: true });
  const archives = await flow.api.notesArchives({ userId: user.id, email: user.email });
  assert.deepEqual(
    Array.from(archives, (item) => item.archiveId),
    ["personal"],
  );
});
test("a session the server no longer knows asks for that account's password", async () => {
  const flow = accountFlow({ emptyOnce: true, lost: true });
  flow.storage.set(
    "session",
    JSON.stringify({ userId: user.id, email: user.email, archiveId: "personal" }),
  );
  await assert.rejects(
    flow.api.notesArchives({ userId: user.id, email: user.email }),
    (reason: Error & { email?: string }) =>
      reason.name === "SignInAgain" && reason.email === user.email,
  );
  assert.equal(flow.storage.has("session"), false);
});
test("a rate-limited identity check preserves the saved account and archive", async () => {
  const flow = accountFlow({ emptyOnce: true, authStatus: 429 });
  const saved = JSON.stringify({ userId: user.id, email: user.email, archiveId: "personal" });
  flow.storage.set("session", saved);
  await assert.rejects(flow.api.notesArchives({ userId: user.id, email: user.email }), /Try again/);
  assert.equal(flow.storage.get("session"), saved);
});
test("a late refused identity check cannot remove another account's active archive", async () => {
  const flow = accountFlow({ emptyOnce: true, lost: true });
  const saved = JSON.stringify({
    userId: "second",
    email: "second@example.invalid",
    archiveId: "other",
  });
  flow.storage.set("session", saved);
  await assert.rejects(flow.api.notesArchives({ userId: user.id, email: user.email }), /Sign in/);
  assert.equal(flow.storage.get("session"), saved);
});
test("adding an account from a dead session still reaches the sign-in page", async () => {
  const flow = accountFlow();
  flow.storage.set(
    "session",
    JSON.stringify({ userId: "gone", email: "gone@example.invalid", archiveId: "personal" }),
  );
  await flow.api.pauseAccount();
  assert.equal(flow.storage.has("session"), false);
  assert.equal(flow.storage.has("napp:accounts"), false);
});
