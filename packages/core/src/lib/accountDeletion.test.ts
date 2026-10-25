import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const compiled = ts.transpileModule(
  readFileSync(new URL("./accountDeletion.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;
const token = "8cd00974-b131-45c7-a8d4-975544e7c729";

function fixture(options: { reply?: unknown; error?: unknown; status?: string } = {}) {
  const calls: { name: string; body: unknown }[] = [];
  const exports: typeof import("./accountDeletion") = {} as never;
  runInNewContext(compiled, {
    exports,
    Response,
    require: () => ({
      supabase: {
        functions: {
          invoke: async (name: string, { body }: { body: unknown }) => {
            calls.push({ name, body });
            return { data: options.reply ?? null, error: options.error ?? null };
          },
        },
      },
      createEphemeralClient: () => ({
        rpc: async () => ({ data: options.status ?? "unknown", error: null }),
      }),
    }),
  });
  return { api: exports, calls };
}

test("erasure sends explicit confirmation and the displayed account to the authenticated endpoint", async () => {
  const flow = fixture({ reply: { status: "completed", requestToken: token } });
  const receipt = await flow.api.eraseAccount("account-one", "password", token);
  assert.equal(receipt.status, "completed");
  assert.equal(
    JSON.stringify(flow.calls),
    JSON.stringify([
      {
        name: "delete-account",
        body: {
          action: "delete",
          confirm: true,
          expected_user_id: "account-one",
          password: "password",
          request_token: token,
        },
      },
    ]),
  );
});

test("missing account/password never invokes erasure", async () => {
  const flow = fixture();
  await assert.rejects(flow.api.eraseAccount("", "password", token));
  await assert.rejects(flow.api.eraseAccount("account", "", token));
  assert.equal(flow.calls.length, 0);
});

test("a lost response recovers the durable receipt without requiring a deleted account to sign in", async () => {
  const flow = fixture({ error: new Error("Network lost"), status: "completed" });
  assert.equal((await flow.api.eraseAccount("account", "password", token)).status, "completed");
});

test("a pending durable receipt never claims completed erasure", async () => {
  const flow = fixture({ reply: { status: "processing", requestToken: token } });
  assert.equal((await flow.api.eraseAccount("account", "password", token)).status, "processing");
});

test("an unknown receipt and network failure cannot be reported as success", async () => {
  const flow = fixture({ error: new Error("Network lost") });
  await assert.rejects(
    flow.api.eraseAccount("account", "password", token),
    /Could not confirm deletion/,
  );
});

test("invalid server replies cannot claim completed erasure", async () => {
  for (const reply of [
    null,
    {},
    { status: "completed" },
    { status: "deleted", requestToken: token },
  ]) {
    const flow = fixture({ reply });
    await assert.rejects(
      flow.api.eraseAccount("account", "password", token),
      /did not confirm deletion/,
    );
  }
});

test("incorrect passwords have a useful error without exposing server details", async () => {
  const flow = fixture({ error: { context: new Response(null, { status: 403 }) } });
  await assert.rejects(flow.api.eraseAccount("account", "wrong", token), /password is incorrect/);
});
