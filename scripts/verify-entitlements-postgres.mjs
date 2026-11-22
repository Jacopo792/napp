// Entitlement rules in real PostgreSQL (PGlite). Trials: only after the address
// is confirmed, once per address. App Store: renewals extend, refunds end
// access, one Apple subscription cannot serve two Napp accounts, and a paid web
// subscription is not overwritten. Stripe: a refund or dispute ends access.
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

const { PGlite } = await import(process.env.NAPP_PGLITE_MODULE ?? "@electric-sql/pglite");
const db = new PGlite();
let stage = "bootstrap local Supabase schemas";
try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth; create schema storage; create schema extensions; create schema realtime;
    -- Hosted Supabase grants new public tables to API roles by default.
    -- Individual migrations revoke these where stronger restrictions apply.
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    create table realtime.messages(extension text);
    create function realtime.topic() returns text language sql stable as $$select ''::text$$;
    create table auth.users(id uuid primary key, email text, email_change text, email_confirmed_at timestamptz, banned_until timestamptz, raw_user_meta_data jsonb default '{"napp_terms_version":"2026-11-16","napp_privacy_version":"2026-11-16"}', is_anonymous boolean not null default false);
    create table auth.sessions(id uuid primary key, user_id uuid references auth.users(id) on delete cascade);
    create function auth.uid() returns uuid language sql stable as
      $$select (nullif(current_setting('request.jwt.claims', true),'')::jsonb->>'sub')::uuid$$;
    create function auth.role() returns text language sql stable as
      $$select coalesce(nullif(current_setting('request.jwt.claims', true),'')::jsonb->>'role','service_role')$$;
    create function auth.jwt() returns jsonb language sql stable as
      $$select coalesce(nullif(current_setting('request.jwt.claims', true),'')::jsonb,'{}')$$;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid() primary key,bucket_id text references storage.buckets(id),name text,owner uuid,owner_id text,metadata jsonb,version text,created_at timestamptz default now(),unique(bucket_id,name));
    alter table storage.objects enable row level security;
    create publication supabase_realtime;
    grant usage on schema public, auth, storage to anon, authenticated, service_role;
  `);
  const directory = new URL("../supabase/migrations/", import.meta.url);
  for (const file of (await readdir(directory))
    .filter(
      (name) =>
        name.endsWith(".sql") &&
        // Only pg_cron/pg_net scheduling needs the real Supabase stack.
        // A date cutoff silently excluded every later security migration.
        name !== "20261024030000_account_erasure_retry.sql",
    )
    .sort()) {
    stage = `migration ${file}`;
    await db.exec(await readFile(new URL(file, directory), "utf8"));
  }
  stage = "start trials";
  const plan = async (user) =>
    (
      await db.query("select plan, status from public.account_entitlements where owner_id = $1", [
        user,
      ])
    ).rows[0];
  const [t1, t2, t3] = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
  await db.exec(`insert into auth.users(id,email) values ('${t1}','Trial+one@example.test')`);
  assert.equal(await plan(t1), undefined, "no trial before the address is confirmed");
  await db.exec(`update auth.users set email_confirmed_at = now() where id = '${t1}'`);
  assert.deepEqual(await plan(t1), { plan: "plus", status: "trialing" });
  await db.exec(`delete from auth.users where id = '${t1}'`);
  await db.exec(`insert into auth.users(id,email,email_confirmed_at)
    values ('${t2}','trial@example.test',now())`);
  assert.deepEqual(await plan(t2), { plan: "free", status: "expired" }, "one trial per address");
  await db.exec(`insert into auth.users(id,email,is_anonymous) values ('${t3}',null,true)`);
  await db.exec(`update auth.users set email = 'fresh@example.test', email_confirmed_at = now(),
    is_anonymous = false where id = '${t3}'`);
  assert.deepEqual(await plan(t3), { plan: "plus", status: "trialing" }, "a linked phone account");

  stage = "record App Store periods";
  const [a, b, c] = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
  await db.exec(`insert into auth.users(id,email,email_confirmed_at) values
    ('${a}','a@example.test',now()),('${b}','b@example.test',now()),('${c}','c@example.test',now())`);
  const record = async (user, original, days, revoked = false) =>
    (
      await db.query(
        "select public.record_apple_period($1, $2, now() + make_interval(days => $3), $4) as r",
        [user, original, days, revoked],
      )
    ).rows[0].r;
  const entitlement = async (user) =>
    (
      await db.query(
        "select source, status, external_subscription_id as sub, current_period_end > now() as live from public.account_entitlements where owner_id = $1",
        [user],
      )
    ).rows[0];

  assert.equal(await record(a, "apple-1", 30), "recorded");
  assert.deepEqual(await entitlement(a), {
    source: "apple",
    status: "active",
    sub: "apple-1",
    live: true,
  });
  assert.equal(await record(a, "apple-1", 60), "recorded", "a renewal extends the period");
  assert.equal(
    await record(b, "apple-1", 30),
    "other_account",
    "one Apple subscription, one account",
  );
  assert.equal(await record(a, "apple-1", 60, true), "revoked");
  assert.equal((await entitlement(a)).live, false, "a refund ends access now");
  assert.equal(await record(c, "apple-2", -1), "expired", "an expired transaction grants nothing");

  await db.exec(`update public.account_entitlements set source = 'web', status = 'active',
    current_period_end = now() + interval '10 days' where owner_id = '${c}'`);
  assert.equal(await record(c, "apple-2", 30), "web_active", "a paid web plan keeps its place");
  await db.exec(`update public.account_entitlements set external_customer_id = 'cus_1'
    where owner_id = '${c}'`);
  await db.query("select public.end_stripe_period('cus_1')");
  assert.equal((await entitlement(c)).live, false, "a Stripe refund ends access now");
  console.log("Entitlement checks passed");
} catch (error) {
  console.error(`Failed at ${stage}:`, error);
  process.exitCode = 1;
}
