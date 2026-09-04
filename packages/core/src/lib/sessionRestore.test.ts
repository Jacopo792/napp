import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { restoreArchiveSession, SESSION_KEY } from "./sessionRestore.ts";

const saved = { userId: "member-1", email: "member@example.invalid", archiveId: "archive-1" };
const user = {
  id: saved.userId,
  email: saved.email,
  aud: "authenticated",
  created_at: "2026-01-01",
};
const tokenKey = "test-auth-session";
function storage() {
  const values = new Map([[SESSION_KEY, JSON.stringify(saved)]]);
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}
function authResult(
  error: { message: string; status?: number; name?: string; code?: string } | null,
  id = saved.userId,
) {
  return { getUser: async () => ({ data: { user: error ? null : { id } }, error }) };
}

test("a connection failure preserves the archive and a retry opens it", async () => {
  const disk = storage();
  for (const status of [0, 429, 500, 503]) {
    await assert.rejects(
      restoreArchiveSession(disk, authResult({ message: "unavailable", status })),
      /reconnect/,
    );
    assert.equal(disk.getItem(SESSION_KEY), JSON.stringify(saved));
  }
  await assert.rejects(
    restoreArchiveSession(disk, {
      getUser: async () => {
        throw new TypeError("Failed to fetch");
      },
    }),
  );
  assert.deepEqual(await restoreArchiveSession(disk, authResult(null)), saved);
});

test("expired, missing or mismatched identity cannot restore the archive", async () => {
  for (const error of [
    { message: "expired", status: 401 },
    { message: "missing", name: "AuthSessionMissingError" },
    { message: "revoked", status: 400, code: "refresh_token_not_found" },
  ]) {
    const disk = storage();
    assert.equal(await restoreArchiveSession(disk, authResult(error)), null);
    assert.equal(disk.getItem(SESSION_KEY), null);
  }
  assert.equal(await restoreArchiveSession(storage(), authResult(null, "someone-else")), null);
});

test("invalid saved data is discarded before contacting auth", async () => {
  for (const value of ["{", "null", "{}", '{"userId":"member-1","archiveId":false}']) {
    const disk = storage();
    disk.setItem(SESSION_KEY, value);
    assert.equal(
      await restoreArchiveSession(disk, {
        getUser: () => {
          throw new Error("must not call");
        },
      }),
      null,
    );
  }
});

test("Supabase restores across client restarts, rotates an expired JWT, and respects sign-out", async () => {
  const disk = storage();
  const refreshes: string[] = [];
  const requests: string[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    requests.push(url);
    if (url.includes("/token")) {
      const body = JSON.parse(String(init?.body));
      refreshes.push(body.refresh_token);
      return Response.json({
        access_token: "renewed-access-token",
        refresh_token: "rotated-refresh-token",
        expires_in: 3600,
        token_type: "bearer",
        user,
      });
    }
    if (url.includes("/logout")) return new Response(null, { status: 204 });
    if (url.includes("/user")) return Response.json(user);
    throw new Error(`Unexpected auth request: ${url}`);
  };
  const client = () =>
    createClient("https://auth.example.invalid", "test-key", {
      auth: {
        storage: disk,
        storageKey: tokenKey,
        persistSession: true,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: { fetch: fetcher },
    });
  disk.setItem(
    tokenKey,
    JSON.stringify({
      access_token: "initial-access-token",
      refresh_token: "initial-refresh-token",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      expires_in: 3600,
      token_type: "bearer",
      user,
    }),
  );
  assert.deepEqual(await restoreArchiveSession(disk, client().auth), saved);
  assert.deepEqual(await restoreArchiveSession(disk, client().auth), saved);
  assert.equal(refreshes.length, 0);
  const expired = JSON.parse(disk.getItem(tokenKey)!);
  disk.setItem(tokenKey, JSON.stringify({ ...expired, expires_at: 1 }));
  const reopened = client();
  assert.deepEqual(await restoreArchiveSession(disk, reopened.auth), saved);
  assert.deepEqual(refreshes, ["initial-refresh-token"]);
  assert.equal(JSON.parse(disk.getItem(tokenKey)!).refresh_token, "rotated-refresh-token");
  await reopened.auth.signOut({ scope: "local" });
  assert.equal(await restoreArchiveSession(disk, client().auth), null);
  assert.equal(disk.getItem(SESSION_KEY), null);
  assert.ok(requests.every((url) => !url.includes("grant_type=password")));
});
