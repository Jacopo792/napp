import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const compiled = ts.transpileModule(
  readFileSync(new URL("./passwordRecovery.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;
function fixture(refused = false) {
  const calls: string[] = [];
  const exports = {} as typeof import("./passwordRecovery");
  runInNewContext(compiled, {
    exports,
    URL,
    URLSearchParams,
    require: (name: string) =>
      name === "@/platform"
        ? {
            platform: () => ({ webOrigin: () => "https://example.invalid/napp/" }),
          }
        : {
            createEphemeralClient: () => ({
              auth: {
                resetPasswordForEmail: async (
                  _email: string,
                  { redirectTo }: { redirectTo: string },
                ) => {
                  calls.push(redirectTo);
                  return { error: null };
                },
                setSession: async () => ({
                  data: { user: refused ? null : { id: "recovery" } },
                  error: null,
                }),
                updateUser: async () => {
                  calls.push("password-updated");
                  return { error: null };
                },
                signOut: async () => {
                  calls.push("recovery-session-cleared");
                  return { error: null };
                },
              },
            }),
          },
  });
  return { api: exports.passwordRecovery(), parse: exports.recoveryTokens, calls };
}
const fragment = "#type=recovery&access_token=temporary-access&refresh_token=temporary-refresh";
test("password recovery requires a validated recovery identity before updating credentials", async () => {
  const flow = fixture();
  await assert.rejects(flow.api.save("long-enough-password"), /recovery link/);
  for (const invalid of [
    "",
    "#type=signup&access_token=x&refresh_token=y",
    "#type=recovery&access_token=x",
  ])
    await assert.rejects(flow.api.verify(invalid), /invalid/);
  assert.deepEqual(flow.calls, []);
  await flow.api.verify(fragment);
  await assert.rejects(flow.api.save("short"), /8 characters/);
  await flow.api.save("long-enough-password");
  assert.deepEqual(flow.calls, ["password-updated", "recovery-session-cleared"]);
  await assert.rejects(flow.api.save("another-password"), /recovery link/);
});
test("an expired recovery link cannot authorize a password update", async () => {
  const flow = fixture(true);
  await assert.rejects(flow.api.verify(fragment), /expired/);
  await assert.rejects(flow.api.save("long-enough-password"), /recovery link/);
  assert.deepEqual(flow.calls, []);
});
test("recovery email uses the public recovery page without changing the signed-in account", async () => {
  const flow = fixture();
  await assert.rejects(flow.api.request("   "), /email/);
  await flow.api.request("person@example.invalid");
  assert.deepEqual(flow.calls, ["https://example.invalid/napp/?action=reset-password"]);
});
