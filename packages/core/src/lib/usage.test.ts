import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { createActivityReporter, usageAgo, webUsageDevice } from "./usageShape.ts";

test("recognises app/web and coarse device types including iPad desktop mode", () => {
  assert.deepEqual(webUsageDevice("web", "Mozilla Macintosh Safari/605", 5), {
    client: "web",
    device: "iPad",
    os: "iOS",
    browser: "Safari",
  });
  assert.equal(webUsageDevice("web", "Windows Chrome/123 Edg/123").browser, "Edge");
  assert.equal(webUsageDevice("web", "iPhone CriOS/123 Safari/605").browser, "Chrome");
  assert.equal(webUsageDevice("web", "Android Mobile Chrome/123").device, "Android phone");
  assert.deepEqual(webUsageDevice("desktop", "Macintosh Chrome/123 Electron/44"), {
    client: "desktop",
    device: "Computer",
    os: "macOS",
    browser: "",
  });
});

test("reports actual interactions at most once a minute, tolerating offline errors", async () => {
  let time = 0;
  let calls = 0;
  const report = createActivityReporter(
    async () => {
      calls++;
      throw new Error("Offline");
    },
    () => time,
  );
  await report();
  await report();
  assert.equal(calls, 1);
  time = 59_999;
  await report();
  assert.equal(calls, 1);
  time = 60_000;
  await report();
  assert.equal(calls, 2);
  time = 500_000;
  assert.equal(calls, 2, "time alone does not report activity");
});

test("usage data is server-owned and readable only by the pinned administrator", async () => {
  const db = new PGlite();
  const owner = "11111111-1111-4111-8111-111111111111";
  const other = "22222222-2222-4222-8222-222222222222";
  const device = "33333333-3333-4333-8333-333333333333";
  const scalar = async (sql: string) =>
    Object.values((await db.query(sql)).rows[0] as Record<string, unknown>)[0];
  const asUser = async (id: string) => {
    await db.exec(`reset role; set request.jwt.claim.sub = '${id}'; set role authenticated;`);
  };
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth; create schema private;
      grant usage on schema public, auth, private to anon, authenticated;
      alter default privileges in schema public grant all on tables to anon, authenticated;
      create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, created_at timestamptz default now());
      create function auth.uid() returns uuid language sql stable as
        $$select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid$$;
      create table public.profiles(user_id uuid primary key, nickname text);
      create table private.account_erasure_jobs(user_id uuid);
      insert into auth.users values
        ('${owner}', 'ansalonenahida@gmail.com', now()), ('${other}', 'reader@example.test', now());
      insert into auth.users(id) values ('44444444-4444-4444-8444-444444444444');
      insert into public.profiles values ('${other}', 'Reader');
    `);
    for (const migration of ["20261116010000_usage_dashboard", "20261116020000_usage_all_accounts"])
      await db.exec(
        await readFile(
          new URL(`../../../../supabase/migrations/${migration}.sql`, import.meta.url),
          "utf8",
        ),
      );
    await asUser(other);
    assert.equal(await scalar("select public.is_usage_administrator()"), false);
    await assert.rejects(db.query("select * from public.list_usage_activity()"), /Access denied/);
    await assert.rejects(db.query("select * from private.usage_devices"), /permission denied/);
    await assert.rejects(
      db.query(`insert into private.usage_administrator values ('${other}')`),
      /permission denied/,
    );
    const activity = `select public.record_usage_activity('${device}', 'web', 'Computer', 'Linux', 'Firefox')`;
    await db.exec(activity);
    await db.exec(activity);
    await asUser(owner);
    assert.equal(await scalar("select public.is_usage_administrator()"), true);
    const rows = (
      await db.query<{ user_id: string; email: string; total_count: number }>(
        "select * from public.list_usage_activity()",
      )
    ).rows;
    // Active device first, then the account that never reported; the anonymous
    // account with no activity is left out.
    assert.equal(rows.length, 2);
    assert.equal(rows[0].user_id, other);
    assert.equal(rows[1].user_id, owner);
    assert.equal((rows[1] as unknown as { device: string | null }).device, null);
    assert.equal(rows[0].email, "reader@example.test");
    assert.equal(await scalar("select count(*)::int from public.list_usage_activity('Reader')"), 1);
    assert.equal(await scalar("select count(*)::int from public.list_usage_activity('absent')"), 0);
    assert.equal(await scalar("select count(*)::int from public.list_usage_activity('',100)"), 0);
    await db.exec(
      `reset role; update private.usage_devices set last_active_at = now() - interval '2 minutes';`,
    );
    await asUser(other);
    await db.exec(activity);
    await asUser(owner);
    assert.equal(
      await scalar(
        "select last_active_at > now() - interval '10 seconds' from public.list_usage_activity()",
      ),
      true,
    );
    await asUser(other);
    await assert.rejects(
      db.query(
        `select public.record_usage_activity('${device}', 'spoof', 'Computer', 'Linux', '')`,
      ),
      /check constraint/,
    );
    await db.exec(`reset role; delete from auth.users where id = '${other}';`);
    assert.equal(await scalar("select count(*)::int from private.usage_devices"), 0);
    // Owning the old email later must not grant access to a different account.
    await db.exec(
      `delete from auth.users where id = '${owner}'; insert into auth.users values ('${other}', 'ansalonenahida@gmail.com', now());`,
    );
    await asUser(other);
    assert.equal(await scalar("select public.is_usage_administrator()"), false);
    await db.exec("reset role; set role anon;");
    await assert.rejects(
      db.query("select * from public.list_usage_activity()"),
      /permission denied/,
    );
    await assert.rejects(db.query(activity), /permission denied/);
  } finally {
    await db.close();
  }
});

test("last activity reads as a short relative time", () => {
  const now = Date.parse("2026-11-16T12:00:00Z");
  const at = (minutes: number) => new Date(now - minutes * 60_000).toISOString();
  assert.equal(usageAgo(at(0), now), "Now");
  assert.equal(usageAgo(at(1), now), "1 minute ago");
  assert.equal(usageAgo(at(42), now), "42 minutes ago");
  assert.equal(usageAgo(at(180), now), "3 hours ago");
  assert.equal(usageAgo(at(2 * 1440), now), "2 days ago");
  assert.match(usageAgo(at(30 * 1440), now), /\d/);
  assert.equal(usageAgo(null, now), "No activity yet");
});
