-- What kind of archive this is, and the order of a document's chapters.
--
-- 1. `archives.kind` — 'notes' or 'document'. A column with a check rather than a
--    key inside `settings`: Postgres holds the only two values it may take,
--    every archive that exists becomes 'notes' by the default, and a select
--    names it like any other column. `settings` is free-form jsonb that a
--    client used to overwrite whole.
-- 2. `merge_archive_settings(archive_id, patch)` — `settings || patch`, under
--    the caller's own row level security. Writing `{ partnerName }` over the
--    column would wipe a document's options the first time a name changed.
-- 3. `notes.position` — the order of a document's chapters, the same for every
--    member and every device. Null is "not placed yet", which sorts after the
--    placed ones by creation; nothing outside a document reads it.
-- 4. `create_archive(name, kind)` — the kind chosen when the archive is made.
--    The one-argument form stays for the client already deployed.
-- 5. `delete_archive(id)` — only by its last member, and never an account's
--    last archive. The old policy let any member drop everybody's notes; this
--    one cannot take anything from anybody but the caller. Rows go by cascade.
--    Storage objects cannot be deleted from SQL (`storage.protect_delete`),
--    so the client asks `archive_deletion_refusal` first, removes the
--    pictures, then deletes.

alter table public.archives
  add column if not exists kind text not null default 'notes';

do $kind_check$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'archives_kind_check' and conrelid = 'public.archives'::regclass
  ) then
    alter table public.archives
      add constraint archives_kind_check check (kind in ('notes', 'document'));
  end if;
end;
$kind_check$;

alter table public.notes
  add column if not exists position double precision;

create or replace function public.merge_archive_settings(target_archive_id uuid, patch jsonb)
returns jsonb
language sql
set search_path = ''
as $merge$
  update public.archives
     set settings = coalesce(settings, '{}'::jsonb) || coalesce(patch, '{}'::jsonb)
   where id = target_archive_id
  returning settings;
$merge$;

revoke all on function public.merge_archive_settings(uuid, jsonb) from public, anon;
grant execute on function public.merge_archive_settings(uuid, jsonb) to authenticated;

create or replace function private.create_archive_of_kind(archive_name text, archive_kind text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $create_kind$
declare
  new_archive_id uuid;
begin
  if archive_kind not in ('notes', 'document') then
    raise check_violation using message = 'An archive is either notes or a document';
  end if;
  new_archive_id := private.create_archive(archive_name);
  update public.archives set kind = archive_kind where id = new_archive_id;
  return new_archive_id;
end;
$create_kind$;

revoke all on function private.create_archive_of_kind(text, text) from public, anon;
grant execute on function private.create_archive_of_kind(text, text) to authenticated;

create or replace function public.create_archive(archive_name text, archive_kind text)
returns uuid
language sql
set search_path = ''
as $public_create_kind$
  select private.create_archive_of_kind(archive_name, archive_kind);
$public_create_kind$;

revoke all on function public.create_archive(text, text) from public, anon;
grant execute on function public.create_archive(text, text) to authenticated;

create or replace function private.archive_deletion_refusal(target_archive_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $refusal$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    return 'Authentication required';
  end if;
  if not exists (
    select 1 from public.archive_members
    where archive_id = target_archive_id and user_id = current_user_id
  ) then
    return 'You are not in this archive';
  end if;
  if exists (
    select 1 from public.archive_members
    where archive_id = target_archive_id and user_id <> current_user_id
  ) then
    return 'Somebody else is still in this archive';
  end if;
  if not exists (
    select 1 from public.archive_members
    where user_id = current_user_id and archive_id <> target_archive_id
  ) then
    return 'This is your only archive';
  end if;
  return null;
end;
$refusal$;

revoke all on function private.archive_deletion_refusal(uuid) from public, anon;
grant execute on function private.archive_deletion_refusal(uuid) to authenticated;

create or replace function public.archive_deletion_refusal(target_archive_id uuid)
returns text
language sql
stable
set search_path = ''
as $public_refusal$
  select private.archive_deletion_refusal(target_archive_id);
$public_refusal$;

revoke all on function public.archive_deletion_refusal(uuid) from public, anon;
grant execute on function public.archive_deletion_refusal(uuid) to authenticated;

create or replace function private.delete_archive(target_archive_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $delete$
declare
  refusal text;
begin
  -- Held for the transaction, so an invitation redeemed in between cannot
  -- seat somebody in an archive about to go.
  perform 1 from public.archives where id = target_archive_id for update;
  refusal := private.archive_deletion_refusal(target_archive_id);
  if refusal is not null then
    raise insufficient_privilege using message = refusal;
  end if;
  delete from public.archives where id = target_archive_id;
end;
$delete$;

revoke all on function private.delete_archive(uuid) from public, anon;
grant execute on function private.delete_archive(uuid) to authenticated;

create or replace function public.delete_archive(target_archive_id uuid)
returns void
language sql
set search_path = ''
as $public_delete$
  select private.delete_archive(target_archive_id);
$public_delete$;

revoke all on function public.delete_archive(uuid) from public, anon;
grant execute on function public.delete_archive(uuid) to authenticated;
