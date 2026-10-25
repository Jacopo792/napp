-- Erasure is durable across Storage/API failures. Only the service role can
-- start or process a job. Work in other people's notes is deliberately kept.
-- Retire the initial request-only API in favour of verified erasure.
revoke execute on function public.request_account_deletion(uuid),
  private.request_account_deletion(uuid) from authenticated;
create table private.account_erasure_receipts (
  token uuid primary key,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create table private.account_erasure_jobs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  receipt_token uuid not null unique references private.account_erasure_receipts(token),
  created_at timestamptz not null default now()
);
create table private.account_erasure_objects (
  user_id uuid not null references private.account_erasure_jobs(user_id) on delete cascade,
  bucket_id text not null,
  object_name text not null,
  primary key (user_id, bucket_id, object_name)
);
-- Minimal tombstones stop old offline clients from recreating erased data.
create table private.erased_note_ids (note_id uuid primary key);
create table private.erased_storage_paths (path_hash bytea primary key);
revoke all on private.account_erasure_receipts, private.account_erasure_jobs,
  private.account_erasure_objects, private.erased_note_ids, private.erased_storage_paths from anon, authenticated;

-- Let the Auth FK clear the creator while continuing to forbid clients from
-- transferring an archive into their own name.
create or replace function private.freeze_archive_creator()
returns trigger language plpgsql set search_path = ''
as $erasure_creator$
begin
  if (select auth.role()) = 'authenticated' then new.created_by := old.created_by; end if;
  return new;
end;
$erasure_creator$;

create function private.guard_erased_account_writes()
returns trigger language plpgsql security definer set search_path = ''
as $guard_account$
declare caller uuid := (select auth.uid());
begin
  if caller is not null and (
    not exists (select 1 from auth.users where id = caller)
    or exists (select 1 from private.account_erasure_jobs where user_id = caller)
  ) then
    raise insufficient_privilege using message = 'This account is being deleted';
  end if;
  return new;
end;
$guard_account$;

do $install_erasure_guards$
declare target text;
begin
  foreach target in array array[
    'archives','archive_members','archive_invites','notes','folders','tags',
    'note_tags','profiles','profile_preferences','note_comments',
    'note_comment_reactions','note_versions','archive_sources','media_text'
  ] loop
    execute format('create trigger guard_erased_account_writes before insert or update on public.%I for each row execute function private.guard_erased_account_writes()', target);
  end loop;
end;
$install_erasure_guards$;

create trigger guard_erased_account_writes before insert or update on storage.objects
for each row execute function private.guard_erased_account_writes();

create function private.reject_erased_note()
returns trigger language plpgsql security definer set search_path = ''
as $guard_note$
begin
  if exists (select 1 from private.erased_note_ids where note_id = new.id) then
    raise check_violation using message = 'This note was permanently deleted';
  end if;
  return new;
end;
$guard_note$;
create trigger reject_erased_note before insert or update on public.notes
for each row execute function private.reject_erased_note();

create function private.reject_erased_storage_path()
returns trigger language plpgsql security definer set search_path = ''
as $guard_path$
begin
  if exists (select 1 from private.erased_storage_paths
    where path_hash = sha256(convert_to(new.bucket_id || ':' || new.name, 'UTF8'))) then
    raise check_violation using message = 'This file was permanently deleted';
  end if;
  return new;
end;
$guard_path$;
create trigger reject_erased_storage_path before insert or update on storage.objects
for each row execute function private.reject_erased_storage_path();

create or replace function private.is_archive_member(target_archive_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $erasure_member$
  select (select auth.uid()) is not null
    and not exists (select 1 from private.account_erasure_jobs where user_id = (select auth.uid()))
    and exists (select 1 from public.archive_members
      where archive_id = target_archive_id and user_id = (select auth.uid()));
$erasure_member$;
create or replace function private.can_write_archive(target_archive_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $erasure_writer$
  select private.is_archive_member(target_archive_id)
    and exists (select 1 from public.archive_members
      where archive_id = target_archive_id and user_id = (select auth.uid()) and role = 'editor');
$erasure_writer$;

-- Called only after the Edge Function verifies the user's password and ID.
create function public.begin_account_erasure(target_user_id uuid, request_token uuid)
returns uuid language plpgsql security definer set search_path = ''
as $begin_erasure$
declare
  original_token uuid;
  empty_archives uuid[];
  owned_notes uuid[];
begin
  perform pg_advisory_xact_lock(hashtextextended(target_user_id::text, 0));
  select receipt_token into original_token from private.account_erasure_jobs where user_id = target_user_id;
  if original_token is not null then return original_token; end if;
  if not exists (select 1 from auth.users where id = target_user_id) then
    raise exception 'Account not found';
  end if;
  -- Keep membership, notes, versions and object ownership stable while the
  -- manifest is built. These locks are released before any external API call.
  lock table public.archives, public.archive_members, public.notes,
    public.note_versions, storage.objects in share row exclusive mode;
  insert into private.account_erasure_receipts(token) values (request_token);
  insert into private.account_erasure_jobs(user_id, receipt_token) values (target_user_id, request_token);
  select coalesce(array_agg(a.id), '{}') into empty_archives from public.archives a
    where (a.created_by = target_user_id or exists (
      select 1 from public.archive_members m where m.archive_id = a.id and m.user_id = target_user_id
    )) and not exists (
      select 1 from public.archive_members m where m.archive_id = a.id and m.user_id <> target_user_id
    );
  select coalesce(array_agg(id), '{}') into owned_notes from public.notes
    where owner_id = target_user_id or archive_id = any(empty_archives);
  insert into private.erased_note_ids select unnest(owned_notes) on conflict do nothing;

  -- Candidate files include old uploads no longer linked from a note. Keep
  -- files referenced by surviving notes/versions/preferences, and detach only
  -- their Storage ownership so Auth deletion cannot break the retained work.
  insert into private.account_erasure_objects(user_id, bucket_id, object_name)
    select target_user_id, o.bucket_id, o.name from storage.objects o
    where (
      o.owner_id = target_user_id::text or o.owner = target_user_id
      or (o.bucket_id = 'avatars' and split_part(o.name, '/', 1) = target_user_id::text)
      or (o.bucket_id = 'note-images' and split_part(o.name, '/', 1) = any(empty_archives::text[]))
      or (o.bucket_id = 'note-images' and exists (
        select 1 from public.notes n where n.id = any(owned_notes)
          and n.archive_id::text = split_part(o.name, '/', 1)
          and position(split_part(o.name, '/', 2) in to_jsonb(n)::text) > 0
      ))
      or (o.bucket_id = 'note-images' and exists (
        select 1 from public.note_versions v where v.note_id = any(owned_notes)
          and v.archive_id::text = split_part(o.name, '/', 1)
          and position(split_part(o.name, '/', 2) in v.content::text) > 0
      ))
    ) and (
      o.bucket_id = 'avatars' or not (
        exists (select 1 from public.notes n
          where not (n.id = any(owned_notes)) and n.archive_id::text = split_part(o.name, '/', 1)
          and position(split_part(o.name, '/', 2) in to_jsonb(n)::text) > 0)
        or exists (select 1 from public.note_versions v
          where not (v.note_id = any(owned_notes)) and v.archive_id::text = split_part(o.name, '/', 1)
          and position(split_part(o.name, '/', 2) in v.content::text) > 0)
        or exists (select 1 from public.profile_preferences p
          where p.user_id <> target_user_id and position(split_part(o.name, '/', 2) in p.preferences::text) > 0)
      )
    );

  -- Storage API deletion follows; never delete storage.objects with SQL.
  -- Only unqueued files owned by this account are retained collaborative work.
  update storage.objects o set owner = null, owner_id = null
    where (o.owner_id = target_user_id::text or o.owner = target_user_id)
      and not exists (select 1 from private.account_erasure_objects q
        where q.user_id = target_user_id and q.bucket_id = o.bucket_id and q.object_name = o.name);
  insert into private.erased_storage_paths
    select sha256(convert_to(bucket_id || ':' || object_name, 'UTF8'))
    from private.account_erasure_objects where user_id = target_user_id on conflict do nothing;

  -- Scrub account metadata from retained work without deleting that work.
  delete from public.note_comments where author_id = target_user_id;
  update public.note_comments set mentions = array_remove(mentions, target_user_id),
    assignee_id = case when assignee_id = target_user_id then null else assignee_id end
    where target_user_id = any(mentions) or assignee_id = target_user_id;
  update public.note_versions set author_ids = array_remove(author_ids, target_user_id)
    where target_user_id = any(author_ids);
  delete from public.notes where id = any(owned_notes);
  delete from public.note_tags where owner_id = target_user_id;
  delete from public.tags where owner_id = target_user_id;
  delete from public.folders where owner_id = target_user_id;
  delete from public.archive_invites where invited_by = target_user_id
    or lower(email) = (select lower(email) from auth.users where id = target_user_id);
  update public.archive_members m set role = 'editor'
    where m.user_id <> target_user_id and exists (
      select 1 from public.archive_members leaving
        where leaving.archive_id = m.archive_id and leaving.user_id = target_user_id
    ) and not exists (select 1 from public.archive_members editor
      where editor.archive_id = m.archive_id and editor.user_id <> target_user_id and editor.role = 'editor');
  delete from public.archive_members where user_id = target_user_id;
  delete from public.archives where id = any(empty_archives);
  delete from public.profile_preferences where user_id = target_user_id;
  delete from public.profiles where user_id = target_user_id;
  return request_token;
end;
$begin_erasure$;

create function public.account_erasure_objects(target_user_id uuid)
returns table(bucket_id text, object_name text)
language sql security definer set search_path = ''
as $erasure_objects$
  select q.bucket_id, q.object_name from private.account_erasure_objects q
    where q.user_id = target_user_id order by q.bucket_id, q.object_name limit 100;
$erasure_objects$;

create function public.ack_account_erasure_objects(target_user_id uuid, bucket text, paths text[])
returns void language plpgsql security definer set search_path = ''
as $ack_erasure$
begin
  delete from public.media_text t where bucket = 'note-images' and exists (
    select 1 from unnest(paths) p where t.archive_id::text = split_part(p, '/', 1)
      and t.object_id::text = split_part(p, '/', 2)
  );
  delete from private.account_erasure_objects
    where user_id = target_user_id and bucket_id = bucket and object_name = any(paths);
end;
$ack_erasure$;

create function public.pending_account_erasures()
returns table(user_id uuid, receipt_token uuid)
language sql security definer set search_path = ''
as $pending_erasures$
  select j.user_id, j.receipt_token from private.account_erasure_jobs j order by j.created_at limit 5;
$pending_erasures$;

create function public.finish_account_erasure(target_user_id uuid)
returns boolean language plpgsql security definer set search_path = ''
as $finish_erasure$
declare receipt_to_complete uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_user_id::text, 0));
  select receipt_token into receipt_to_complete from private.account_erasure_jobs where user_id = target_user_id;
  if receipt_to_complete is null then return true; end if;
  if exists (select 1 from private.account_erasure_objects where user_id = target_user_id) then
    return false;
  end if;
  -- Storage ownership is checked again: an incomplete manifest must fail
  -- closed instead of reporting a completed deletion with files left behind.
  if exists (select 1 from storage.objects where owner_id = target_user_id::text or owner = target_user_id) then
    raise exception 'Account still owns files';
  end if;
  delete from auth.users where id = target_user_id;
  update private.account_erasure_receipts set completed_at = now() where token = receipt_to_complete;
  return true;
end;
$finish_erasure$;

create function public.account_erasure_status(request_token uuid)
returns text language sql security definer set search_path = ''
as $erasure_status$
  select coalesce((select case when completed_at is null then 'processing' else 'completed' end
    from private.account_erasure_receipts where token = request_token and created_at > now() - interval '7 days'), 'unknown');
$erasure_status$;

revoke all on function public.begin_account_erasure(uuid, uuid), public.account_erasure_objects(uuid),
  public.ack_account_erasure_objects(uuid, text, text[]), public.pending_account_erasures(),
  public.finish_account_erasure(uuid) from public, anon, authenticated;
grant execute on function public.begin_account_erasure(uuid, uuid), public.account_erasure_objects(uuid),
  public.ack_account_erasure_objects(uuid, text, text[]), public.pending_account_erasures(),
  public.finish_account_erasure(uuid) to service_role;
revoke all on function public.account_erasure_status(uuid) from public;
grant execute on function public.account_erasure_status(uuid) to anon, authenticated, service_role;
revoke all on function private.guard_erased_account_writes(), private.reject_erased_note(),
  private.reject_erased_storage_path() from public, anon, authenticated;
