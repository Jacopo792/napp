#!/usr/bin/env node
// Real PostgreSQL/PLpgSQL in a disposable in-memory PGlite instance. Supabase
// Auth and Storage infrastructure tables are minimal local fixtures. This does
// not replace the separately guarded HTTP/Storage end-to-end test.
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
    create table storage.objects(id uuid default gen_random_uuid() primary key,bucket_id text references storage.buckets(id),name text,owner uuid,owner_id text,metadata jsonb,user_metadata jsonb,version text,created_at timestamptz default now(),unique(bucket_id,name));
    alter table storage.objects enable row level security;
    create publication supabase_realtime;
    grant usage on schema public, auth, storage to anon, authenticated, service_role;
  `);
  const legacyAccount = crypto.randomUUID();
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
    if (file === "20261122090000_verified_account_writes.sql") {
      await db.query(
        "insert into auth.users(id,email,raw_user_meta_data) values ($1,'legacy-policy@example.test',$2)",
        [
          legacyAccount,
          JSON.stringify({
            napp_terms_version: "2026-11-16",
            napp_privacy_version: "2026-11-16",
            napp_policies_accepted_at: "2000-01-01T00:00:00Z",
          }),
        ],
      );
    }
    await db.exec(await readFile(new URL(file, directory), "utf8"));
  }
  stage = "create disposable fixture rows";
  const one = crypto.randomUUID();
  const two = crypto.randomUUID();
  const shared = crypto.randomUUID();
  const solo = crypto.randomUUID();
  const owned = crypto.randomUUID();
  const kept = crypto.randomUUID();
  const file = crypto.randomUUID();
  const keptFile = crypto.randomUUID();
  const token = crypto.randomUUID();
  await db.exec(`
    insert into auth.users(id,email,email_confirmed_at) values ('${one}','one@example.test',now()),('${two}','two@example.test',now());
    insert into public.archives(id,name,created_by) values ('${shared}','Shared','${one}'),('${solo}','Solo','${one}');
    insert into public.archive_members(archive_id,user_id) values ('${shared}','${one}'),('${shared}','${two}'),('${solo}','${one}');
    insert into public.profiles(user_id,nickname) values ('${one}','One'),('${two}','Two');
    insert into public.profile_preferences(user_id,preferences) values ('${one}','{"theme":"dark"}');
    insert into public.notes(id,archive_id,owner_id,title,content,content_version,created_at,updated_at)
      values ('${owned}','${shared}','${one}','Owned','{"type":"doc","imageId":"${file}"}',1,now(),now()),
      ('${kept}','${shared}','${two}','Kept','{"type":"doc","imageId":"${keptFile}"}',1,now(),now());
    insert into public.note_documents(note_id,archive_id,state) values ('${owned}','${shared}','\\x1234'),('${kept}','${shared}','\\x5678');
    insert into public.note_versions(note_id,archive_id,content,author_ids) values
      ('${owned}','${shared}','{}',array['${one}']::uuid[]),
      ('${kept}','${shared}','{"imageId":"${keptFile}"}',array['${one}','${two}']::uuid[]);
    insert into public.note_comments(archive_id,note_id,thread_id,author_id,body,mentions,assignee_id) values
      ('${shared}','${kept}',gen_random_uuid(),'${one}','Erase comment','{}',null),
      ('${shared}','${kept}',gen_random_uuid(),'${two}','Keep comment',array['${one}']::uuid[],'${one}');
    insert into storage.objects(bucket_id,name,owner,owner_id) values
      ('note-images','${shared}/${file}','${one}','${one}'),
      ('note-images','${shared}/${keptFile}','${one}','${one}'),
      ('note-images','${solo}/${crypto.randomUUID()}','${one}','${one}'),
      ('chat-media','${solo}/${crypto.randomUUID()}.0.jpg','${two}','${two}'),
      ('avatars','${one}/${crypto.randomUUID()}','${one}','${one}');
    insert into public.media_text(archive_id,object_id,text) values ('${shared}','${file}','Erase OCR'),('${shared}','${keptFile}','Keep OCR');
  `);
  const scalar = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0])[0];
  stage = "check account plan limits";
  assert.equal(await scalar("select private.effective_plan($1)", [one]), "plus");
  assert.equal(await scalar("select private.archive_seat_limit($1)", [shared]), 8);
  await db.query("update public.account_entitlements set trial_ends_at=now() where owner_id=$1", [
    one,
  ]);
  assert.equal(await scalar("select private.effective_plan($1)", [one]), "free");
  assert.equal(await scalar("select private.archive_seat_limit($1)", [shared]), 2);
  assert.equal(await scalar("select private.archive_plan_writable($1)", [shared]), true);
  await db.query("update public.archives set kind='document' where id=$1", [solo]);
  assert.equal(await scalar("select private.archive_plan_writable($1)", [solo]), false);

  const storedPath = `${shared}/${file}`;
  await db.query(
    "update storage.objects set metadata=jsonb_build_object('size',999999999) where name=$1",
    [storedPath],
  );
  await assert.rejects(
    db.query(
      "insert into storage.objects(bucket_id,name,metadata) values('note-images',$1,jsonb_build_object('size',2))",
      [`${shared}/${crypto.randomUUID()}`],
    ),
    { code: "PT413" },
  );
  await db.query("update storage.objects set metadata=null where name=$1", [storedPath]);

  await db.query(
    "update public.account_entitlements set status='canceled', current_period_end=now()+interval '1 hour' where owner_id=$1",
    [one],
  );
  assert.equal(await scalar("select private.effective_plan($1)", [one]), "plus");
  assert.equal(await scalar("select private.archive_plan_writable($1)", [solo]), true);
  await db.query(
    "update public.account_entitlements set current_period_end=now() where owner_id=$1",
    [one],
  );
  assert.equal(await scalar("select private.effective_plan($1)", [one]), "free");
  await db.query("update public.archives set kind='notes' where id=$1", [solo]);

  stage = "reconcile Stripe paid periods";
  assert.equal(await scalar("select (public.prepare_stripe_billing($1)).owner_id", [one]), one);
  await db.query("select public.bind_stripe_customer($1, 'cus_stripe_test')", [one]);
  await db.exec(`
    select public.record_stripe_paid_period('cus_unknown', 'sub_unknown', now() + interval '60 days');
    select public.record_stripe_paid_period('cus_stripe_test', 'sub_paid', now() + interval '30 days');
    select public.record_stripe_paid_period('cus_stripe_test', 'sub_paid', now() + interval '60 days');
    select public.record_stripe_paid_period('cus_stripe_test', 'sub_old', now() + interval '30 days');
  `);
  assert.equal(await scalar("select private.effective_plan($1)", [one]), "plus");
  assert.equal(
    await scalar(
      "select external_subscription_id from public.account_entitlements where owner_id=$1",
      [one],
    ),
    "sub_paid",
  );
  assert.equal(
    await scalar(
      "select current_period_end > now() + interval '59 days' from public.account_entitlements where owner_id=$1",
      [one],
    ),
    true,
  );
  assert.equal(
    await scalar("select source from public.account_entitlements where owner_id=$1", [two]),
    "trial",
  );
  assert.equal(
    await scalar(
      "select has_function_privilege('authenticated', 'public.record_stripe_paid_period(text,text,timestamptz)', 'EXECUTE')",
    ),
    false,
  );

  stage = "begin erasure and retain other people's work";
  assert.equal(await scalar("select public.begin_account_erasure($1,$2)", [one, token]), token);
  assert.equal(await scalar("select (public.prepare_stripe_billing($1)).owner_id", [one]), null);
  assert.equal(await scalar("select public.bind_stripe_customer($1, 'cus_other')", [one]), null);
  assert.equal(
    await scalar("select public.begin_account_erasure($1,$2)", [one, crypto.randomUUID()]),
    token,
  );
  assert.equal(await scalar("select count(*)::int from public.notes where id=$1", [owned]), 0);
  assert.equal(await scalar("select count(*)::int from public.notes where id=$1", [kept]), 1);
  assert.equal(
    await scalar("select count(*)::int from public.note_documents where note_id=$1", [owned]),
    0,
  );
  assert.equal(
    await scalar("select encode(state,'hex') from public.note_documents where note_id=$1", [kept]),
    "5678",
  );
  assert.equal(
    await scalar("select count(*)::int from public.note_versions where note_id=$1", [owned]),
    0,
  );
  assert.deepEqual(
    await scalar("select author_ids from public.note_versions where note_id=$1", [kept]),
    [two],
  );
  assert.equal(
    await scalar("select count(*)::int from public.note_comments where author_id=$1", [one]),
    0,
  );
  assert.deepEqual(
    await scalar("select mentions from public.note_comments where author_id=$1", [two]),
    [],
  );
  assert.equal(
    await scalar("select assignee_id from public.note_comments where author_id=$1", [two]),
    null,
  );
  assert.equal(await scalar("select count(*)::int from public.archives where id=$1", [solo]), 0);
  assert.equal(
    await scalar("select owner_id from storage.objects where name=$1", [`${shared}/${keptFile}`]),
    null,
  );
  assert.equal(
    await scalar("select public.finish_account_erasure($1)", [one]),
    false,
    "Cannot finish while files remain",
  );
  assert.equal(await scalar("select public.account_erasure_status($1)", [token]), "processing");

  stage = "block writes during erasure";
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ sub: one, role: "authenticated" }),
  ]);
  await assert.rejects(db.query("select public.ensure_personal_archive()"), /being deleted/);
  await db.query("select set_config('request.jwt.claims','{}',false)");
  stage = "acknowledge simulated Storage API confirmations";
  const paths = (await db.query("select * from public.account_erasure_objects($1)", [one])).rows;
  assert.equal(
    paths.length,
    4,
    "Retained attachment must not be queued; an emptied archive's chat files are",
  );
  for (const object of paths) {
    // Only the local Storage stub is deleted here, simulating an API success.
    // Production code always uses Storage.remove(), never a SQL object delete.
    await db.query("delete from storage.objects where bucket_id=$1 and name=$2", [
      object.bucket_id,
      object.object_name,
    ]);
    await db.query("select public.ack_account_erasure_objects($1,$2,$3)", [
      one,
      object.bucket_id,
      [object.object_name],
    ]);
  }
  stage = "finish and verify cascades, tombstones and old JWTs";
  assert.equal(await scalar("select public.finish_account_erasure($1)", [one]), true);
  assert.equal(await scalar("select count(*)::int from auth.users where id=$1", [one]), 0);
  assert.equal(await scalar("select created_by from public.archives where id=$1", [shared]), null);
  assert.equal(
    await scalar("select count(*)::int from public.media_text where archive_id=$1", [shared]),
    1,
  );
  assert.equal(await scalar("select public.account_erasure_status($1)", [token]), "completed");
  await assert.rejects(
    db.query(
      "insert into public.notes(id,archive_id,owner_id,created_at,updated_at) values ($1,$2,$3,now(),now())",
      [owned, shared, two],
    ),
    /permanently deleted/,
  );
  await assert.rejects(
    db.query("insert into storage.objects(bucket_id,name) values ('note-images',$1)", [
      `${shared}/${file}`,
    ]),
    /permanently deleted/,
  );
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ sub: one, role: "authenticated" }),
  ]);
  await assert.rejects(db.query("select public.ensure_personal_archive()"), /being deleted/);
  await db.query("select set_config('request.jwt.claims','{}',false)");
  stage = "verify RPC privileges";
  for (const role of ["anon", "authenticated"]) {
    assert.equal(
      await scalar(
        `select has_function_privilege('${role}','public.begin_account_erasure(uuid,uuid)','EXECUTE')`,
      ),
      false,
    );
    assert.equal(
      await scalar(
        `select has_function_privilege('${role}','public.finish_account_erasure(uuid)','EXECUTE')`,
      ),
      false,
    );
  }
  stage = "safety reporting and blocking with actual RLS roles";
  const three = crypto.randomUUID();
  const outsider = crypto.randomUUID();
  const safetyArchive = crypto.randomUUID();
  const safetyNote = crypto.randomUUID();
  await db.exec(`
    insert into auth.users(id,email,email_confirmed_at) values ('${three}','three@example.test',now()),('${outsider}','outside@example.test',now());
    insert into public.profiles(user_id,nickname) values ('${three}','Three');
    insert into public.archives(id,name,created_by) values ('${safetyArchive}','Safety fixture','${two}');
    insert into public.archive_members(archive_id,user_id) values ('${safetyArchive}','${two}'),('${safetyArchive}','${three}');
    insert into public.notes(id,archive_id,owner_id,title,created_at,updated_at) values ('${safetyNote}','${safetyArchive}','${three}','Safety fixture',now(),now());
  `);
  const asUser = async (id) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claims',$1,false)", [
      id ? JSON.stringify({ sub: id, role: "authenticated" }) : "{}",
    ]);
    if (id) await db.exec("set role authenticated");
  };
  stage = "security hardening privileges and archive boundaries";
  for (const fn of [
    "public.set_archive_member_role(uuid,uuid,text)",
    "private.change_archive_member_role(uuid,uuid,text)",
  ])
    assert.equal(
      await scalar("select has_function_privilege('authenticated',$1,'EXECUTE')", [fn]),
      false,
      fn,
    );
  for (const table of [
    "note_comments",
    "note_versions",
    "note_comment_reactions",
    "archive_sources",
    "media_text",
  ])
    assert.equal(
      await scalar("select has_table_privilege('anon',$1,'SELECT')", [`public.${table}`]),
      false,
      table,
    );
  await asUser(two);
  await db.query("update public.notes set archive_id=$1 where id=$2", [shared, safetyNote]);
  assert.equal(
    await scalar("select archive_id from public.notes where id=$1", [safetyNote]),
    safetyArchive,
    "A note cannot move away from its document, comments and versions",
  );
  await assert.rejects(
    db.query(
      "insert into public.note_comments(archive_id,note_id,thread_id,author_id,body) values ($1,$2,gen_random_uuid(),$3,'Wrong archive')",
      [shared, safetyNote, two],
    ),
    /not in this archive/,
  );
  await db.query("select public.block_user($1)", [three]);
  await assert.rejects(
    db.query(
      "insert into public.note_comments(archive_id,note_id,thread_id,author_id,body,assignee_id) values ($1,$2,gen_random_uuid(),$3,'Blocked assignee',$4)",
      [shared, kept, two, three],
    ),
    /cannot mention a blocked account/,
  );
  await db.query("select public.unblock_user($1)", [three]);

  stage = "note attachment access follows its original note";
  await asUser(null);
  await db.exec("grant select, insert on storage.objects to authenticated");
  const boundAsset = crypto.randomUUID();
  const boundPath = `${safetyArchive}/${boundAsset}`;
  await asUser(three);
  await db.query(
    "insert into storage.objects(bucket_id,name,owner,owner_id,user_metadata) values ('note-images',$1,$2,$3,$4)",
    [boundPath, three, three, JSON.stringify({ noteId: safetyNote })],
  );
  await db.query("update public.notes set content=$1, content_version=1 where id=$2", [
    JSON.stringify({
      type: "doc",
      content: [{ type: "privateFile", attrs: { objectId: boundAsset } }],
    }),
    safetyNote,
  ]);
  await asUser(two);
  const visibleAsset = () =>
    scalar("select count(*)::int from storage.objects where name=$1", [boundPath]);
  assert.equal(await visibleAsset(), 1, "The shared note grants access to its bound attachment");
  await db.query(
    "insert into public.media_text(archive_id,object_id,text) values ($1,$2,'Extracted text')",
    [safetyArchive, boundAsset],
  );
  const visibleText = () =>
    scalar("select count(*)::int from public.media_text where object_id=$1", [boundAsset]);
  assert.equal(await visibleText(), 1);
  await asUser(three);
  await db.query("update public.profiles set hide_archived=true where user_id=$1", [three]);
  await db.query("update public.notes set archived_at=now() where id=$1", [safetyNote]);
  await asUser(two);
  assert.equal(await visibleAsset(), 0, "A private archived note withholds its attachment");
  await db.query(
    "insert into public.profile_preferences(user_id,preferences) values ($1,$2) on conflict(user_id) do update set preferences=excluded.preferences",
    [two, JSON.stringify({ appearance: { wallpaperObject: boundAsset } })],
  );
  assert.equal(await visibleAsset(), 0, "Preferences cannot authorize a download");
  assert.equal(await visibleText(), 0, "Extracted text follows the hidden attachment");
  assert.equal(
    await scalar(
      "select count(*)::int from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='preferences'",
    ),
    0,
  );
  await asUser(three);
  await db.query("update public.notes set archived_at=null where id=$1", [safetyNote]);
  await db.query("update public.profiles set hide_archived=false where user_id=$1", [three]);
  await asUser(two);
  assert.equal(await visibleAsset(), 1, "Unarchiving restores the normal shared read");
  await asUser(null);
  await db.query("delete from storage.objects where name=$1", [boundPath]);

  stage = "safety reporting and blocking with actual RLS roles";
  await asUser(outsider);
  await assert.rejects(
    db.query("select public.report_safety_issue('harassment',$1)", [safetyNote]),
    /not available/,
  );
  await assert.rejects(db.query("select public.block_user($1)", [three]), /shared archives/);
  await asUser(two);
  assert.equal(await scalar("select count(*)::int from public.notes where id=$1", [safetyNote]), 1);
  const report = await scalar("select public.report_safety_issue('harassment',$1)", [safetyNote]);
  assert.equal(
    await scalar("select public.report_safety_issue('harassment',$1)", [safetyNote]),
    report,
    "Report retries are idempotent",
  );
  assert.equal(
    await scalar("select count(*)::int from public.notes where id=$1", [safetyNote]),
    0,
    "Pending report hides content from its reporter",
  );
  assert.equal(
    await scalar(
      "select has_function_privilege('authenticated','public.review_safety_report(uuid,boolean)','EXECUTE')",
    ),
    false,
  );
  await asUser(three);
  assert.equal(
    await scalar("select count(*)::int from public.notes where id=$1", [safetyNote]),
    1,
    "A report alone does not remove content for everyone",
  );
  await asUser(null);
  await db.query("select public.review_safety_report($1,false)", [report]);
  await asUser(two);
  await db.query("select public.block_user($1)", [three]);
  assert.equal(await scalar("select count(*)::int from public.user_blocks"), 1);
  assert.equal(
    await scalar("select count(*)::int from public.notes where id=$1", [safetyNote]),
    0,
    "Blocked author cannot bypass the note filter",
  );
  assert.equal(
    await scalar(
      "select has_table_privilege('authenticated','public.user_blocks','INSERT,DELETE')",
    ),
    false,
  );
  const newArchive = await scalar("select public.create_archive('After blocking')");
  assert.equal(
    await scalar("select count(*)::int from public.archive_members where archive_id=$1", [
      newArchive,
    ]),
    1,
    "New archives do not automatically seat a blocked person",
  );
  await asUser(three);
  assert.equal(
    await scalar("select count(*)::int from public.user_blocks"),
    0,
    "Users cannot discover who blocked them",
  );
  await db.query("select public.unblock_user($1)", [two]);
  await asUser(null);
  assert.equal(
    await scalar("select count(*)::int from public.user_blocks where blocker_id=$1", [two]),
    1,
    "Only the blocker can remove their block",
  );
  await assert.rejects(
    db.query("insert into public.archive_members(archive_id,user_id) values ($1,$2)", [
      newArchive,
      three,
    ]),
    /blocked account/,
  );
  await assert.rejects(
    db.query(
      "insert into public.archive_invites(archive_id,email,invited_by,token_hash) values ($1,'three@example.test',$2,decode('abcd','hex'))",
      [safetyArchive, two],
    ),
    /blocked accounts/,
  );
  await asUser(two);
  await db.query("select public.unblock_user($1)", [three]);
  assert.equal(await scalar("select count(*)::int from public.notes where id=$1", [safetyNote]), 1);
  await asUser(three);
  const spoofed = crypto.randomUUID();
  await db.query(
    "insert into public.notes(id,archive_id,owner_id,created_at,updated_at) values ($1,$2,$3,now(),now())",
    [spoofed, safetyArchive, two],
  );
  assert.equal(
    await scalar("select owner_id from public.notes where id=$1", [spoofed]),
    three,
    "Server stamps the real author",
  );
  await db.query("update public.notes set owner_id=$1 where id=$2", [two, spoofed]);
  assert.equal(
    await scalar("select owner_id from public.notes where id=$1", [spoofed]),
    three,
    "Attribution cannot be rewritten to evade a block",
  );
  await asUser(two);
  const secondReport = await scalar("select public.report_safety_issue('harassment',$1)", [
    safetyNote,
  ]);
  await asUser(null);
  await db.query("select public.review_safety_report($1,true)", [secondReport]);
  await asUser(three);
  assert.equal(
    await scalar("select count(*)::int from public.notes where id=$1", [safetyNote]),
    0,
    "Operator filtering applies to the author too",
  );
  await asUser(null);
  await db.query(
    "update private.safety_reports set reviewed_at = now() - interval '91 days' where id=$1",
    [secondReport],
  );
  await db.query("select private.purge_reviewed_safety_reports()");
  assert.equal(
    await scalar("select count(*)::int from private.safety_reports where id=$1", [secondReport]),
    0,
    "Reviewed evidence expires after ninety days",
  );
  assert.equal(
    await scalar("select count(*)::int from private.hidden_safety_notes where note_id=$1", [
      safetyNote,
    ]),
    1,
    "Content restriction outlives report retention",
  );
  // An old mention may predate a later block. Erasing a third account must
  // still scrub that account from this retained comment.
  await asUser(null);
  const retainedSafetyNote = crypto.randomUUID();
  const retainedSafetyComment = crypto.randomUUID();
  await db.query("insert into public.archive_members(archive_id,user_id) values ($1,$2)", [
    safetyArchive,
    outsider,
  ]);
  await db.query(
    "insert into public.notes(id,archive_id,owner_id,created_at,updated_at) values ($1,$2,$3,now(),now())",
    [retainedSafetyNote, safetyArchive, two],
  );
  await db.query(
    "insert into public.note_comments(id,thread_id,note_id,archive_id,author_id,body,mentions) values ($1,$1,$2,$3,$4,'Retained fixture',$5)",
    [retainedSafetyComment, retainedSafetyNote, safetyArchive, two, [three, outsider]],
  );
  stage = "general chat follows reports, blocks and departures";
  const generalMessage = crypto.randomUUID();
  await db.query(
    "insert into public.archive_messages(id,archive_id,author_id,body,mentions) values ($1,$2,$3,'General fixture',$4)",
    [generalMessage, safetyArchive, two, [three, outsider]],
  );
  await asUser(outsider);
  assert.match(
    await scalar("select public.report_safety_issue('harassment',target_message_id=>$1)::text", [
      generalMessage,
    ]),
    /^[0-9a-f-]{36}$/,
    "A general-chat message can be reported",
  );
  await asUser(two);
  await db.query("select public.block_user($1)", [outsider]);
  await db.query("select public.block_user($1)", [three]);
  await db.query(
    "update public.archive_messages set body='Old mentions do not freeze it' where id=$1",
    [generalMessage],
  );
  await asUser(three);
  assert.equal(
    await scalar("select count(*)::int from public.archive_messages where id=$1", [generalMessage]),
    0,
    "A block hides general-chat messages too",
  );
  await assert.rejects(
    db.query(
      "insert into public.archive_messages(archive_id,author_id,body,mentions) values ($1,$2,'Naming the blocker',$3)",
      [safetyArchive, three, [two]],
    ),
    /cannot mention a blocked account/,
  );
  await asUser(two);
  await asUser(two);
  await assert.rejects(
    db.query("update public.note_comments set body='Still blocked' where id=$1", [
      retainedSafetyComment,
    ]),
    /cannot mention a blocked account/,
  );
  stage = "an operator's hide removes a reported general-chat message";
  await asUser(null);
  const hiddenMessage = crypto.randomUUID();
  await db.query(
    "insert into public.archive_messages(id,archive_id,author_id,body) values ($1,$2,$3,'Reported fixture')",
    [hiddenMessage, safetyArchive, two],
  );
  const messageReport = await scalar(
    "insert into private.safety_reports(reporter_id,target_user_id,message_id,reason,snapshot) values ($1,$2,$3,'illegal','{}') returning id",
    [outsider, two, hiddenMessage],
  );
  await db.query("select public.review_safety_report($1,true)", [messageReport]);
  await asUser(two);
  assert.equal(
    await scalar("select count(*)::int from public.archive_messages where id=$1", [hiddenMessage]),
    0,
    "A hidden message is filtered for its author too",
  );
  stage = "general-chat photos follow their message";
  await asUser(null);
  // Hosted Storage grants its table to signed-in users; RLS decides the rest.
  await db.exec("grant select, insert, delete on storage.objects to authenticated");
  const four = crypto.randomUUID();
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at) values ($1,'four@example.test',now())",
    [four],
  );
  await db.query("insert into public.archive_members(archive_id,user_id) values ($1,$2)", [
    safetyArchive,
    four,
  ]);
  const photoMessage = crypto.randomUUID();
  const photo = `${safetyArchive}/${photoMessage}.0.jpg`;
  await asUser(three);
  await db.query(
    "insert into storage.objects(bucket_id,name,owner,owner_id) values ('chat-media',$1,$2,$3)",
    [photo, three, three],
  );
  await db.query(
    "insert into public.archive_messages(id,archive_id,author_id,body,attachments) values ($1,$2,$3,'',$4)",
    [
      photoMessage,
      safetyArchive,
      three,
      JSON.stringify([{ kind: "image", path: photo, width: 4, height: 3 }]),
    ],
  );
  await assert.rejects(
    db.query("insert into public.archive_messages(archive_id,author_id,body) values ($1,$2,'')", [
      safetyArchive,
      three,
    ]),
    /said_something/,
    "A message says something or shows something",
  );
  await assert.rejects(
    db.query(
      "insert into public.archive_messages(id,archive_id,author_id,body,attachments) values ($1,$2,$3,'x',$4)",
      [
        crypto.randomUUID(),
        safetyArchive,
        three,
        JSON.stringify([{ kind: "image", path: `${shared}/${photoMessage}.0.jpg` }]),
      ],
    ),
    /own photos/,
    "A message cannot point at another archive's file",
  );
  await db.query("update public.archive_messages set attachments='[]' where id=$1", [photoMessage]);
  assert.equal(
    await scalar(
      "select jsonb_array_length(attachments) from public.archive_messages where id=$1",
      [photoMessage],
    ),
    1,
    "The pictures stay as sent",
  );
  await asUser(four);
  assert.equal(
    await scalar("select count(*)::int from storage.objects where name=$1", [photo]),
    1,
    "A member sees a photo in the chat",
  );
  await assert.rejects(
    db.query(
      "insert into storage.objects(bucket_id,name,owner,owner_id) values ('chat-media',$1,$2,$3)",
      [`${safetyArchive}/${photoMessage}.1.jpg`, four, four],
    ),
    /row-level security/,
    "Nobody adds files to somebody else's message",
  );
  await db.query("delete from storage.objects where name=$1", [photo]);
  assert.equal(
    await scalar("select count(*)::int from storage.objects where name=$1", [photo]),
    1,
    "Only the uploader removes a chat file",
  );
  await asUser(two);
  assert.equal(
    await scalar("select count(*)::int from storage.objects where name=$1", [photo]),
    0,
    "A block hides the blocked person's photos",
  );
  const alias = crypto.randomUUID();
  await db.query(
    "insert into public.notes(id,archive_id,owner_id,title,created_at,updated_at) values ($1,$2,$3,'Photo alias fixture',now(),now())",
    [alias, safetyArchive, two],
  );
  await db.query(
    "insert into public.note_comments(id,archive_id,note_id,thread_id,author_id,body,attachments) values ($1,$2,$3,$1,$4,'Alias',$5)",
    [photoMessage, safetyArchive, alias, two, JSON.stringify([{ kind: "image", path: photo }])],
  );
  assert.equal(
    await scalar("select count(*)::int from storage.objects where name=$1", [photo]),
    0,
    "A matching comment by another author cannot expose a blocked message's photo",
  );
  await db.query("delete from public.notes where id=$1", [alias]);
  await asUser(null);
  stage = "erasure scrubs legacy blocked mentions in retained comments";
  await db.query("select public.begin_account_erasure($1,$2)", [three, crypto.randomUUID()]);
  {
    const queued = (await db.query("select * from public.account_erasure_objects($1)", [three]))
      .rows;
    assert.deepEqual(
      queued.map((object) => object.object_name),
      [photo],
      "An erased account's chat photos are queued for removal",
    );
    await db.query("delete from storage.objects where name=$1", [photo]);
    await db.query("select public.ack_account_erasure_objects($1,'chat-media',$2)", [
      three,
      [photo],
    ]);
  }
  assert.deepEqual(
    (
      await db.query("select mentions from public.note_comments where id=$1", [
        retainedSafetyComment,
      ])
    ).rows[0].mentions,
    [outsider],
  );
  assert.deepEqual(
    (await db.query("select mentions from public.archive_messages where id=$1", [generalMessage]))
      .rows[0].mentions,
    [outsider],
    "Erasure takes the account out of general-chat mentions",
  );
  assert.equal(await scalar("select public.finish_account_erasure($1)", [three]), true);
  assert.equal(
    await scalar("select count(*)::int from public.user_blocks where blocked_id=$1", [three]),
    0,
    "Erasure removes block-list personal data",
  );
  assert.equal(
    await scalar("select count(*)::int from private.safety_reports where target_user_id=$1", [
      three,
    ]),
    1,
    "Erasure keeps the report and its target UUID",
  );

  stage = "terms are recorded on the server and restricted accounts cannot share";
  assert.equal(
    await scalar(
      "select source from private.policy_acceptances where user_id=$1 and accepted_at > '2000-01-02'",
      [legacyAccount],
    ),
    "legacy_metadata",
  );
  const unconfirmed = crypto.randomUUID();
  const guest = crypto.randomUUID();
  await db.query(
    "insert into auth.users(id,email,raw_user_meta_data) values ($1,'unconfirmed@example.test',null)",
    [unconfirmed],
  );
  await db.query(
    "insert into auth.users(id,is_anonymous,raw_user_meta_data) values ($1,true,null)",
    [guest],
  );
  await asUser(unconfirmed);
  assert.equal(await scalar("select public.has_accepted_policies()"), false);
  await assert.rejects(db.query("select public.ensure_personal_archive()"), { code: "42501" });
  await assert.rejects(db.query("select public.accept_policies('wrong','2026-11-16')"), {
    code: "23514",
  });
  await asUser(null);
  await db.query(
    "update auth.users set raw_user_meta_data=(select raw_user_meta_data from auth.users where id=$2) where id=$1",
    [unconfirmed, two],
  );
  await asUser(unconfirmed);
  assert.equal(
    await scalar("select public.has_accepted_policies()"),
    false,
    "Changing Auth metadata after signup cannot establish acceptance",
  );
  for (const id of [unconfirmed, guest]) {
    await asUser(id);
    await db.query("select public.accept_policies('2026-11-16','2026-11-16')");
    assert.equal(await scalar("select public.has_accepted_policies()"), true);
    const personal = await scalar("select public.ensure_personal_archive()");
    assert.ok(personal, "Restricted accounts can still use their private notes");
    await assert.rejects(db.query("select public.create_archive('Shared group')"), {
      code: "42501",
    });
    await assert.rejects(db.query("select public.claim_archive_invite($1)", ["a".repeat(64)]), {
      code: "42501",
    });
    await assert.rejects(db.query("select public.report_safety_issue('spam')"), { code: "42501" });
    await assert.rejects(
      db.query(
        "insert into storage.objects(bucket_id,name,owner,owner_id) values ('avatars',$1,$2,$2::uuid::text)",
        [`${id}/${crypto.randomUUID()}`, id],
      ),
      { code: "42501" },
    );
    await assert.rejects(
      db.query(
        "insert into public.archive_messages(archive_id,author_id,body) values ($1,$2,'Chat')",
        [personal, id],
      ),
      { code: "42501" },
    );
    await asUser(null);
    const saved = (
      await db.query(
        "select source, accepted_at from private.policy_acceptances where user_id=$1",
        [id],
      )
    ).rows[0];
    assert.equal(saved.source, "rpc");
    assert.ok(saved.accepted_at);
  }
  assert.equal(await scalar("select public.email_allowed('x@mailinator.com.')"), false);

  stage = "a stale JWT cannot bypass suspension or an Auth ban";
  const revokedSession = crypto.randomUUID();
  await db.query("insert into auth.sessions values ($1,$2)", [revokedSession, two]);
  await db.query("select public.set_account_suspension($1,true)", [two]);
  assert.equal(
    await scalar("select count(*) from auth.sessions where user_id=$1", [two]).then(Number),
    0,
  );
  await asUser(two);
  assert.equal(await scalar("select public.archive_plan($1)", [safetyArchive]), null);
  await assert.rejects(db.query("select public.report_safety_issue('child_safety')"), {
    code: "42501",
  });
  assert.equal(
    (
      await db.query(
        "update public.profiles set nickname='blocked' where user_id=$1 returning user_id",
        [two],
      )
    ).rows.length,
    0,
  );
  await asUser(null);
  await db.query("select public.set_account_suspension($1,false)", [two]);
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ sub: two, role: "authenticated", session_id: revokedSession }),
  ]);
  assert.equal(await scalar("select public.archive_plan($1)", [safetyArchive]), null);
  await asUser(null);
  await db.query("update auth.users set banned_until=now() + interval '1 hour' where id=$1", [two]);
  await asUser(two);
  assert.equal(await scalar("select public.archive_plan($1)", [safetyArchive]), null);
  await asUser(null);
  await db.query("update auth.users set banned_until=null where id=$1", [two]);

  stage = "comment and sticker evidence are hidden and retained independently";
  const evidenceNote = crypto.randomUUID();
  const evidenceComment = crypto.randomUUID();
  const sticker = crypto.randomUUID();
  const stickerPath = `${safetyArchive}/${sticker}.pack.png`;
  const commentPath = `${safetyArchive}/${evidenceComment}.0.jpg`;
  await db.query(
    "insert into public.notes(id,archive_id,owner_id,created_at,updated_at) values ($1,$2,$3,now(),now())",
    [evidenceNote, safetyArchive, four],
  );
  await db.query(
    "insert into public.note_comments(id,archive_id,note_id,thread_id,author_id,body,attachments) values ($1,$2,$3,gen_random_uuid(),$4,'Comment',$5)",
    [
      evidenceComment,
      safetyArchive,
      evidenceNote,
      four,
      JSON.stringify([{ path: commentPath, kind: "image", width: 1, height: 1 }]),
    ],
  );
  await db.query(
    "insert into public.archive_stickers(id,archive_id,owner_id,path,width,height) values ($1,$2,$3,$4,1,1)",
    [sticker, safetyArchive, four, stickerPath],
  );
  for (const path of [stickerPath, commentPath])
    await db.query(
      "insert into storage.objects(bucket_id,name,owner,owner_id) values ('chat-media',$1,$2,$2::uuid::text)",
      [path, four],
    );
  await asUser(two);
  const commentReport = await scalar(
    "select public.report_safety_issue('harassment', $1, target_comment_id => $2)",
    [evidenceNote, evidenceComment],
  );
  const stickerReport = await scalar(
    "select public.report_safety_issue('child_safety', target_sticker_id => $1)",
    [sticker],
  );
  await asUser(null);
  assert.equal(
    await scalar("select (id=$1) from public.pending_safety_reports() limit 1", [stickerReport]),
    true,
  );
  const evidenceIds = [];
  for (const [id, path] of [
    [commentReport, commentPath],
    [stickerReport, stickerPath],
  ]) {
    const evidenceId = await scalar(
      "select id from private.safety_evidence_objects where report_id=$1 and source_name=$2",
      [id, path],
    );
    assert.ok(evidenceId);
    evidenceIds.push(evidenceId);
    await assert.rejects(db.query("delete from storage.objects where name=$1", [path]), {
      code: "PT423",
    });
    await db.query("insert into storage.objects(bucket_id,name) values ('safety-evidence',$1)", [
      evidenceId,
    ]);
    await db.query("select public.safety_worker_ack('copy',$1,$2)", [evidenceId, path]);
    await db.query("select public.review_safety_report($1,true)", [id]);
  }
  await asUser(four);
  assert.equal(
    await scalar("select count(*)::int from public.notes where id=$1", [evidenceNote]),
    1,
  );
  assert.equal(
    await scalar("select count(*)::int from public.note_comments where id=$1", [evidenceComment]),
    0,
  );
  assert.equal(
    await scalar("select count(*)::int from public.archive_stickers where id=$1", [sticker]),
    0,
  );
  assert.equal(
    await scalar("select count(*)::int from storage.objects where name in ($1,$2)", [
      stickerPath,
      commentPath,
    ]),
    0,
  );
  assert.equal(
    await scalar("select count(*)::int from storage.objects where bucket_id='safety-evidence'"),
    0,
  );
  await asUser(null);
  await db.query("update private.safety_reports set legal_hold=true where id=$1", [stickerReport]);
  await asUser(two);
  assert.match(
    await scalar("select public.archive_deletion_refusal($1)", [safetyArchive]),
    /must be preserved/,
  );
  await asUser(null);

  await assert.rejects(
    db.query("select public.begin_account_erasure($1,$2)", [four, crypto.randomUUID()]),
    { code: "PT423" },
  );
  await assert.rejects(db.query("delete from auth.users where id=$1", [four]), { code: "PT423" });
  await assert.rejects(db.query("delete from public.archive_stickers where id=$1", [sticker]), {
    code: "PT423",
  });
  await assert.rejects(db.query("delete from storage.objects where name=$1", [evidenceIds[1]]), {
    code: "PT423",
  });
  await db.query("insert into private.account_legal_holds(user_id) values ($1)", [four]);
  await assert.rejects(db.query("delete from storage.objects where name=$1", [commentPath]), {
    code: "PT423",
  });
  await db.query("delete from private.account_legal_holds where user_id=$1", [four]);
  await db.query(
    "update private.safety_reports set legal_hold=false, reviewed_at=now()-interval '91 days' where id in ($1,$2)",
    [commentReport, stickerReport],
  );
  assert.equal(
    await scalar(
      "select count(*)::int from public.safety_worker_jobs() where kind='expire' and id=$1",
      [evidenceIds[0]],
    ),
    1,
  );
  assert.equal(
    await scalar(
      "select count(*)::int from public.safety_worker_jobs() where kind='expire' and id=$1",
      [evidenceIds[1]],
    ),
    0,
  );
  await db.query(
    "update private.safety_reports set reviewed_at=now()-interval '366 days' where id=$1",
    [stickerReport],
  );
  assert.equal(
    await scalar(
      "select count(*)::int from public.safety_worker_jobs() where kind='expire' and id=$1",
      [evidenceIds[1]],
    ),
    1,
  );
  await db.query("delete from storage.objects where bucket_id='safety-evidence' and name=$1", [
    evidenceIds[0],
  ]);
  await db.query("select public.safety_worker_ack('expire',$1,$2)", [
    evidenceIds[0],
    evidenceIds[0],
  ]);
  await db.query("select private.purge_reviewed_safety_reports()");
  assert.equal(
    await scalar("select count(*)::int from private.safety_reports where id=$1", [commentReport]),
    0,
  );

  stage = "storage quotas, orphan cleanup and scan quarantine";
  assert.equal(
    await scalar(
      "select 'application/octet-stream' = any(allowed_mime_types) from storage.buckets where id='note-images'",
    ),
    false,
  );
  await db.query(
    "insert into storage.objects(bucket_id,name,owner,owner_id,metadata) values ('avatars',$1,$2,$2::uuid::text,jsonb_build_object('size',20000000000))",
    [`${four}/${crypto.randomUUID()}`, four],
  );
  await assert.rejects(
    db.query(
      "insert into storage.objects(bucket_id,name,owner,owner_id,metadata) values ('avatars',$1,$2,$2::uuid::text,jsonb_build_object('size',1))",
      [`${four}/${crypto.randomUUID()}`, four],
    ),
    { code: "PT413" },
  );
  await db.query("delete from storage.objects where bucket_id='avatars' and owner=$1", [four]);
  await assert.rejects(
    db.query(
      "insert into storage.objects(bucket_id,name,metadata) values ('note-images',$1,jsonb_build_object('size',5000000001))",
      [`${safetyArchive}/${crypto.randomUUID()}`],
    ),
    { code: "PT413" },
  );
  const abandonedId = crypto.randomUUID();
  const abandoned = `${safetyArchive}/${abandonedId}.0.jpg`;
  await db.query(
    "insert into storage.objects(bucket_id,name,created_at) values ('chat-media',$1,now()-interval '2 days')",
    [abandoned],
  );
  const lease = await scalar("select public.safety_worker_start()");
  assert.ok(lease);
  assert.equal(await scalar("select public.safety_worker_start()"), null);
  assert.equal(
    await scalar(
      "select count(*)::int from public.safety_worker_jobs() where kind='orphan' and path=$1",
      [abandoned],
    ),
    1,
  );
  await assert.rejects(
    db.query(
      "insert into public.archive_messages(id,archive_id,author_id,body) values ($1,$2,$3,'Late')",
      [abandonedId, safetyArchive, four],
    ),
    { code: "23514" },
  );
  await db.query("select public.safety_worker_finish($1)", [lease]);

  await db.query("update private.safety_retention set scan_new_uploads=true");
  const suspicious = `${four}/${crypto.randomUUID()}`;
  const upload = await scalar(
    "insert into storage.objects(bucket_id,name,owner,owner_id,metadata) values ('avatars',$1,$2,$2::uuid::text,jsonb_build_object('size',1)) returning id",
    [suspicious, four],
  );
  await asUser(four);
  assert.equal(await scalar("select count(*)::int from storage.objects where id=$1", [upload]), 0);
  await asUser(null);
  await assert.rejects(db.query("delete from storage.objects where id=$1", [upload]), {
    code: "PT423",
  });
  const matchedReport = await scalar("select public.flag_safety_scan($1)", [upload]);
  assert.equal(await scalar("select public.flag_safety_scan($1)", [upload]), matchedReport);
  assert.equal(
    await scalar("select reason from private.safety_reports where id=$1 and legal_hold", [
      matchedReport,
    ]),
    "child_safety",
  );
  assert.equal(
    await scalar("select count(*)::int from private.suspended_accounts where user_id=$1", [four]),
    1,
  );
  const quarantineCopy = await scalar(
    "select id from private.safety_evidence_objects where report_id=$1 and quarantine",
    [matchedReport],
  );
  await db.query("insert into storage.objects(bucket_id,name) values ('safety-evidence',$1)", [
    quarantineCopy,
  ]);
  await db.query("select public.safety_worker_ack('copy',$1,$2)", [quarantineCopy, suspicious]);
  await db.query("delete from storage.objects where id=$1", [upload]);
  await db.query("select public.safety_worker_ack('quarantine',$1,$2)", [upload, suspicious]);
  await assert.rejects(
    db.query("insert into storage.objects(bucket_id,name) values ('avatars',$1)", [suspicious]),
    /permanently deleted/,
  );

  stage =
    "public notices require a location and good faith, and allow anonymous child-safety notices";
  await db.exec("set role anon");
  const notice = "select public.submit_safety_notice($1,$2,$3,$4,$5,$6)";
  await assert.rejects(
    db.query(notice, ["https://example.test/content", "Explanation", "", "", false, true]),
    { code: "23514" },
  );
  await assert.rejects(
    db.query(notice, ["javascript:alert(1)", "Explanation", "", "", true, true]),
    { code: "23514" },
  );
  const publicNotice = await scalar(notice, [
    "https://example.test/content",
    "Explanation",
    "",
    "",
    true,
    true,
  ]);
  await assert.rejects(db.query("select public.safety_report_detail($1)", [publicNotice]), {
    code: "42501",
  });
  await asUser(null);
  assert.equal(
    await scalar("select reason from private.safety_reports where id=$1", [publicNotice]),
    "child_safety",
  );
  await db.query("select public.decide_safety_notice($1,'Decision and redress information')", [
    publicNotice,
  ]);
  assert.equal(
    await scalar("select status from private.safety_reports where id=$1", [publicNotice]),
    "dismissed",
  );
  console.log(
    "Local PostgreSQL erasure checks passed: migration replay, idempotency, retained shared work, files manifest, history, Yjs, stale JWTs, tombstones, RPC privileges, reports, moderation and user blocks",
  );
} catch (error) {
  console.error(`${stage}: ${error.message}`);
  process.exitCode = 1;
} finally {
  await db.close();
}
