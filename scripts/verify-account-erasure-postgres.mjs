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
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
    create table auth.sessions(id uuid primary key, user_id uuid references auth.users(id) on delete cascade);
    create function auth.uid() returns uuid language sql stable as
      $$select (nullif(current_setting('request.jwt.claims', true),'')::jsonb->>'sub')::uuid$$;
    create function auth.role() returns text language sql stable as
      $$select coalesce(nullif(current_setting('request.jwt.claims', true),'')::jsonb->>'role','service_role')$$;
    create function auth.jwt() returns jsonb language sql stable as
      $$select coalesce(nullif(current_setting('request.jwt.claims', true),'')::jsonb,'{}')$$;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid() primary key,bucket_id text references storage.buckets(id),name text,owner uuid,owner_id text,unique(bucket_id,name));
    alter table storage.objects enable row level security;
    create publication supabase_realtime;
    grant usage on schema public, auth, storage to anon, authenticated, service_role;
  `);
  const directory = new URL("../supabase/migrations/", import.meta.url);
  for (const file of (await readdir(directory))
    .filter(
      (name) =>
        name.endsWith(".sql") &&
        (name < "20261024030000" ||
          name === "20261024040000_safety_reports_and_blocks.sql" ||
          name === "20261024050000_reviewed_report_retention.sql" ||
          name === "20261024060000_erasure_mention_cleanup.sql"),
    )
    .sort()) {
    stage = `migration ${file}`;
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
      ('avatars','${one}/${crypto.randomUUID()}','${one}','${one}');
    insert into public.media_text(archive_id,object_id,text) values ('${shared}','${file}','Erase OCR'),('${shared}','${keptFile}','Keep OCR');
  `);
  const scalar = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0])[0];
  stage = "begin erasure and retain other people's work";
  assert.equal(await scalar("select public.begin_account_erasure($1,$2)", [one, token]), token);
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
  assert.equal(paths.length, 3, "Retained attachment must not be queued");
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
  await asUser(two);
  await db.query("select public.block_user($1)", [outsider]);
  await db.query("select public.block_user($1)", [three]);
  await asUser(two);
  await assert.rejects(
    db.query("update public.note_comments set body='Still blocked' where id=$1", [
      retainedSafetyComment,
    ]),
    /cannot mention a blocked account/,
  );
  await asUser(null);
  stage = "erasure scrubs legacy blocked mentions in retained comments";
  await db.query("select public.begin_account_erasure($1,$2)", [three, crypto.randomUUID()]);
  assert.deepEqual(
    (
      await db.query("select mentions from public.note_comments where id=$1", [
        retainedSafetyComment,
      ])
    ).rows[0].mentions,
    [outsider],
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
    0,
    "Erasure removes report snapshots about erased content/accounts",
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
