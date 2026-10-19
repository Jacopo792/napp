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
  } = {},
) {
  const calls: { name: string; token?: string }[] = [];
  const storage = new Map<string, string>();
  const archiveIds = options.archives?.map((archive) => archive.id) ?? ["personal"];
  let activeUser = user;
  let tokens = { access_token: "current-access", refresh_token: "current-refresh" };
  const authData = { data: { user, session: options.confirmation ? null : {} }, error: null };
  const supabase = {
    auth: {
      signUp: async () => authData,
      signInWithPassword: async () => authData,
      getSession: async () => ({ data: { session: { ...tokens, user: activeUser } } }),
      getUser: async () => ({ data: { user: activeUser }, error: null }),
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
          data: archiveIds.map((archive_id) => ({ archive_id, created_at: "2026-10-04" })),
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
