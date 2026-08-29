-- Two roles, and no implied permissions in the interface: every archive row
-- remains readable by a member, while only editors may change archive data or
-- note-images Storage objects. Profile and avatar writes remain personal and
-- are therefore intentionally independent of the archive role.

alter table public.archive_members
  add column if not exists role text not null default 'editor';

alter table public.archive_invites
  add column if not exists role text not null default 'editor';

do $role_constraints$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'archive_members_role_check'
  ) then
    alter table public.archive_members
      add constraint archive_members_role_check check (role in ('editor', 'viewer'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'archive_invites_role_check'
  ) then
    alter table public.archive_invites
      add constraint archive_invites_role_check check (role in ('editor', 'viewer'));
  end if;
end
$role_constraints$;

create or replace function private.can_write_archive(target_archive_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $writer$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.archive_members as member
      where member.archive_id = target_archive_id
        and member.user_id = (select auth.uid())
        and member.role = 'editor'
    );
$writer$;

revoke all on function private.can_write_archive(uuid) from public, anon;
grant execute on function private.can_write_archive(uuid) to authenticated;

-- Database rows: members read; editors write.
drop policy if exists archives_member_all on public.archives;
drop policy if exists archives_member_select on public.archives;
drop policy if exists archives_editor_insert on public.archives;
drop policy if exists archives_editor_update on public.archives;
drop policy if exists archives_editor_delete on public.archives;
create policy archives_member_select on public.archives
  for select to authenticated
  using ((select private.is_archive_member(id)));
create policy archives_editor_insert on public.archives
  for insert to authenticated
  with check ((select private.can_write_archive(id)));
create policy archives_editor_update on public.archives
  for update to authenticated
  using ((select private.can_write_archive(id)))
  with check ((select private.can_write_archive(id)));
create policy archives_editor_delete on public.archives
  for delete to authenticated
  using ((select private.can_write_archive(id)));

drop policy if exists archive_members_member_all on public.archive_members;
drop policy if exists archive_members_member_select on public.archive_members;
create policy archive_members_member_select on public.archive_members
  for select to authenticated
  using ((select private.is_archive_member(archive_id)));

drop policy if exists notes_member_all on public.notes;
drop policy if exists notes_member_select on public.notes;
drop policy if exists notes_editor_insert on public.notes;
drop policy if exists notes_editor_update on public.notes;
drop policy if exists notes_editor_delete on public.notes;
create policy notes_member_select on public.notes
  for select to authenticated
  using ((select private.is_archive_member(archive_id)));
create policy notes_editor_insert on public.notes
  for insert to authenticated
  with check ((select private.can_write_archive(archive_id)));
create policy notes_editor_update on public.notes
  for update to authenticated
  using ((select private.can_write_archive(archive_id)))
  with check ((select private.can_write_archive(archive_id)));
create policy notes_editor_delete on public.notes
  for delete to authenticated
  using ((select private.can_write_archive(archive_id)));

drop policy if exists folders_member_all on public.folders;
drop policy if exists folders_member_select on public.folders;
drop policy if exists folders_editor_insert on public.folders;
drop policy if exists folders_editor_update on public.folders;
drop policy if exists folders_editor_delete on public.folders;
create policy folders_member_select on public.folders
  for select to authenticated
  using ((select private.is_archive_member(archive_id)));
create policy folders_editor_insert on public.folders
  for insert to authenticated
  with check ((select private.can_write_archive(archive_id)));
create policy folders_editor_update on public.folders
  for update to authenticated
  using ((select private.can_write_archive(archive_id)))
  with check ((select private.can_write_archive(archive_id)));
create policy folders_editor_delete on public.folders
  for delete to authenticated
  using ((select private.can_write_archive(archive_id)));

drop policy if exists tags_member_all on public.tags;
drop policy if exists tags_member_select on public.tags;
drop policy if exists tags_editor_insert on public.tags;
drop policy if exists tags_editor_update on public.tags;
drop policy if exists tags_editor_delete on public.tags;
create policy tags_member_select on public.tags
  for select to authenticated
  using ((select private.is_archive_member(archive_id)));
create policy tags_editor_insert on public.tags
  for insert to authenticated
  with check ((select private.can_write_archive(archive_id)));
create policy tags_editor_update on public.tags
  for update to authenticated
  using ((select private.can_write_archive(archive_id)))
  with check ((select private.can_write_archive(archive_id)));
create policy tags_editor_delete on public.tags
  for delete to authenticated
  using ((select private.can_write_archive(archive_id)));

drop policy if exists note_tags_member_all on public.note_tags;
drop policy if exists note_tags_member_select on public.note_tags;
drop policy if exists note_tags_editor_insert on public.note_tags;
drop policy if exists note_tags_editor_update on public.note_tags;
drop policy if exists note_tags_editor_delete on public.note_tags;
create policy note_tags_member_select on public.note_tags
  for select to authenticated
  using ((select private.is_archive_member(archive_id)));
create policy note_tags_editor_insert on public.note_tags
  for insert to authenticated
  with check ((select private.can_write_archive(archive_id)));
create policy note_tags_editor_update on public.note_tags
  for update to authenticated
  using ((select private.can_write_archive(archive_id)))
  with check ((select private.can_write_archive(archive_id)));
create policy note_tags_editor_delete on public.note_tags
  for delete to authenticated
  using ((select private.can_write_archive(archive_id)));

-- Membership writes go through the invitation and role RPCs only.
revoke insert, update, delete on public.archive_members from authenticated;

-- Private note files follow the same editor boundary as their note rows.
drop policy if exists note_images_member_insert on storage.objects;
drop policy if exists note_images_member_update on storage.objects;
drop policy if exists note_images_member_delete on storage.objects;
drop policy if exists note_images_editor_insert on storage.objects;
drop policy if exists note_images_editor_update on storage.objects;
drop policy if exists note_images_editor_delete on storage.objects;
create policy note_images_editor_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'note-images'
    and (select private.can_write_archive(private.storage_archive_id(name)))
  );
create policy note_images_editor_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'note-images'
    and (select private.can_write_archive(private.storage_archive_id(name)))
  )
  with check (
    bucket_id = 'note-images'
    and (select private.can_write_archive(private.storage_archive_id(name)))
  );
create policy note_images_editor_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'note-images'
    and (select private.can_write_archive(private.storage_archive_id(name)))
  );

-- Re-issue the invitation RPC with an explicit role. The old two-argument
-- function is removed so a client cannot bypass the new choice accidentally.
drop function if exists public.create_archive_invite(uuid, text);
drop function if exists private.issue_archive_invite(uuid, text);

create or replace function private.issue_archive_invite(
  target_archive_id uuid,
  target_email text,
  target_role text
)
returns text
language plpgsql
security definer
set search_path = ''
as $issue_role$
declare
  current_user_id uuid := (select auth.uid());
  normalized_email text := lower(pg_catalog.btrim(target_email));
  raw_token text := pg_catalog.encode(extensions.gen_random_bytes(32), 'hex');
  hashed_token bytea := extensions.digest(raw_token, 'sha256');
begin
  if current_user_id is null
     or not private.can_write_archive(target_archive_id) then
    raise insufficient_privilege using message = 'Editor role required';
  end if;

  if target_role not in ('editor', 'viewer') then
    raise invalid_parameter_value using message = 'Role must be editor or viewer';
  end if;

  if char_length(normalized_email) < 3
     or char_length(normalized_email) > 320
     or pg_catalog.strpos(normalized_email, '@') < 2 then
    raise invalid_parameter_value using message = 'Enter a valid email address';
  end if;

  update public.archive_invites
  set token_hash = hashed_token,
      role = target_role,
      invited_by = current_user_id,
      created_at = now(),
      expires_at = now() + interval '7 days'
  where archive_id = target_archive_id
    and lower(email) = normalized_email
    and claimed_at is null;

  if not found then
    insert into public.archive_invites (
      archive_id, email, token_hash, invited_by, role
    ) values (
      target_archive_id, normalized_email, hashed_token, current_user_id, target_role
    );
  end if;

  return raw_token;
end;
$issue_role$;

create or replace function public.create_archive_invite(
  archive_id uuid,
  email text,
  role text
)
returns text
language sql
security invoker
set search_path = ''
as $create_role_rpc$
  select private.issue_archive_invite(archive_id, email, role);
$create_role_rpc$;

-- Claim the role carried by the invite. All other token and email checks stay
-- identical to the invitation migration.
create or replace function private.redeem_archive_invite(invite_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $redeem_role$
declare
  current_user_id uuid := (select auth.uid());
  confirmed_email text;
  invitation public.archive_invites%rowtype;
begin
  if current_user_id is null then
    raise insufficient_privilege using message = 'Authentication required';
  end if;
  if invite_token !~ '^[0-9a-f]{64}$' then
    raise invalid_parameter_value using message = 'Invitation is invalid or expired';
  end if;

  select * into invitation
  from public.archive_invites
  where token_hash = extensions.digest(invite_token, 'sha256')
  for update;

  if invitation.id is null or invitation.expires_at <= now() then
    raise invalid_parameter_value using message = 'Invitation is invalid or expired';
  end if;
  if invitation.claimed_at is not null then
    if invitation.claimed_by = current_user_id then
      return invitation.archive_id;
    end if;
    raise invalid_parameter_value using message = 'Invitation is invalid or expired';
  end if;

  select lower(member.email) into confirmed_email
  from auth.users as member
  where member.id = current_user_id
    and member.email_confirmed_at is not null;
  if confirmed_email is null or confirmed_email <> lower(invitation.email) then
    raise insufficient_privilege using message = 'Invitation belongs to another account';
  end if;

  insert into public.archive_members (archive_id, user_id, role)
  values (invitation.archive_id, current_user_id, invitation.role)
  on conflict (archive_id, user_id) do nothing;

  update public.archive_invites
  set claimed_at = now(), claimed_by = current_user_id
  where id = invitation.id;
  return invitation.archive_id;
end;
$redeem_role$;

create or replace function private.change_archive_member_role(
  target_archive_id uuid,
  target_user_id uuid,
  target_role text
)
returns void
language plpgsql
security definer
set search_path = ''
as $change_role$
declare
  current_role text;
  editor_count integer;
begin
  if not private.can_write_archive(target_archive_id) then
    raise insufficient_privilege using message = 'Editor role required';
  end if;
  if target_role not in ('editor', 'viewer') then
    raise invalid_parameter_value using message = 'Role must be editor or viewer';
  end if;

  perform 1 from public.archive_members
  where archive_id = target_archive_id
  for update;

  select role into current_role
  from public.archive_members
  where archive_id = target_archive_id and user_id = target_user_id;
  if current_role is null then
    raise no_data_found using message = 'Member not found';
  end if;

  if current_role = 'editor' and target_role = 'viewer' then
    select count(*) into editor_count
    from public.archive_members
    where archive_id = target_archive_id and role = 'editor';
    if editor_count <= 1 then
      raise check_violation using message = 'An archive needs at least one editor';
    end if;
  end if;

  update public.archive_members
  set role = target_role
  where archive_id = target_archive_id and user_id = target_user_id;
end;
$change_role$;

create or replace function public.set_archive_member_role(
  archive_id uuid,
  user_id uuid,
  role text
)
returns void
language sql
security invoker
set search_path = ''
as $set_role_rpc$
  select private.change_archive_member_role(archive_id, user_id, role);
$set_role_rpc$;

revoke all on function private.issue_archive_invite(uuid, text, text) from public, anon;
revoke all on function public.create_archive_invite(uuid, text, text) from public, anon;
revoke all on function private.change_archive_member_role(uuid, uuid, text) from public, anon;
revoke all on function public.set_archive_member_role(uuid, uuid, text) from public, anon;
grant execute on function private.issue_archive_invite(uuid, text, text) to authenticated;
grant execute on function public.create_archive_invite(uuid, text, text) to authenticated;
grant execute on function private.change_archive_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.set_archive_member_role(uuid, uuid, text) to authenticated;
