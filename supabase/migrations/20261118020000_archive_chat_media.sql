-- Photos and videos in the general chat.
--
-- A message carries `attachments`, a list of files in the private
-- `chat-media` bucket, named `<archive>/<message>.<n>.<ext>`: the archive
-- decides who may upload, the message decides who may read. A file is
-- readable by a member exactly when its message is (membership, blocks and
-- reports all apply through the message's own row level security), and by
-- its uploader before the message exists.
--
-- Additive: the column defaults to an empty list, so released clients keep
-- working; a message may now be media alone, which they show as an empty
-- bubble until updated. Apply before deploying the client that sends media.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-media', 'chat-media', false, 104857600, array[
  'image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp', 'image/gif',
  'video/mp4', 'video/quicktime', 'video/webm'
])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.archive_messages
  add column if not exists attachments jsonb not null default '[]'::jsonb;

-- Words, pictures or both; never neither.
alter table public.archive_messages drop constraint if exists archive_messages_body_check;
alter table public.archive_messages drop constraint if exists archive_messages_said_something;
alter table public.archive_messages add constraint archive_messages_said_something check (
  char_length(body) <= 4000
  and (char_length(body) >= 1 or jsonb_array_length(attachments) > 0)
);

-- The message a chat file belongs to, from its name.
create or replace function private.chat_media_message_id(object_name text)
returns uuid
language plpgsql
immutable
security definer
set search_path = ''
as $media_message$
declare
  file text := split_part(object_name, '/', 2);
begin
  if file !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.' then
    return null;
  end if;
  return left(file, 36)::uuid;
end;
$media_message$;

-- An editor uploads into their archive, for a message that is not yet
-- written or is their own.
create or replace function private.can_upload_chat_media(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $media_upload$
  select private.can_write_archive(private.storage_archive_id(object_name))
    and private.chat_media_message_id(object_name) is not null
    and not exists (
      select 1 from public.archive_messages m
      where m.id = private.chat_media_message_id(object_name)
        and (m.author_id <> (select auth.uid())
          or m.archive_id <> private.storage_archive_id(object_name))
    );
$media_upload$;

revoke all on function private.chat_media_message_id(text) from public, anon;
revoke all on function private.can_upload_chat_media(text) from public, anon;
grant execute on function private.chat_media_message_id(text) to authenticated;
grant execute on function private.can_upload_chat_media(text) to authenticated;

-- Every file a message lists sits under its own archive and name, so a
-- message can never point at another archive's file or a stranger's.
create or replace function private.check_archive_message_media()
returns trigger
language plpgsql
security definer
set search_path = ''
as $media_check$
declare
  item jsonb;
begin
  if jsonb_typeof(new.attachments) <> 'array' or jsonb_array_length(new.attachments) > 10 then
    raise check_violation using message = 'A message carries up to ten photos or videos';
  end if;
  for item in select value from jsonb_array_elements(new.attachments) loop
    if jsonb_typeof(item) <> 'object'
      or coalesce(item->>'kind', '') not in ('image', 'video')
      or coalesce(item->>'path', '') !~ ('^' || new.archive_id::text || '/' || new.id::text
        || '\.[0-9]{1,2}\.[a-z0-9]{2,5}$')
      or (item ? 'width' and jsonb_typeof(item->'width') <> 'number')
      or (item ? 'height' and jsonb_typeof(item->'height') <> 'number')
      or (item ? 'duration' and jsonb_typeof(item->'duration') <> 'number')
    then
      raise check_violation using message = 'A message can only carry its own photos and videos';
    end if;
  end loop;
  return new;
end;
$media_check$;

drop trigger if exists check_archive_message_media on public.archive_messages;
create trigger check_archive_message_media
  before insert on public.archive_messages
  for each row execute function private.check_archive_message_media();

-- An edit changes the words and whom they name; the pictures stay as sent.
create or replace function private.freeze_archive_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $freeze$
begin
  new.author_id := old.author_id;
  new.archive_id := old.archive_id;
  new.created_at := old.created_at;
  new.bubble := old.bubble;
  new.refs := old.refs;
  new.attachments := old.attachments;
  if new.reply_to is not null then
    new.reply_to := old.reply_to;
  end if;
  return new;
end;
$freeze$;

-- Storage: members read, editors upload, the uploader removes their own,
-- and whoever may delete the archive may empty it first.
drop policy if exists chat_media_member_select on storage.objects;
create policy chat_media_member_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'chat-media'
    and (select private.is_archive_member(private.storage_archive_id(name)))
  );

drop policy if exists chat_media_editor_insert on storage.objects;
create policy chat_media_editor_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'chat-media' and private.can_upload_chat_media(name));

drop policy if exists chat_media_owner_delete on storage.objects;
create policy chat_media_owner_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'chat-media'
    and (
      owner_id = (select auth.uid())::text
      or private.archive_deletion_refusal(private.storage_archive_id(name)) is null
    )
  );

-- The safety filter now knows the bucket: a chat file is visible exactly
-- when its message is, through the message's own policies.
create or replace function private.safety_file_visible(bucket text, object_name text, owner_text text)
returns boolean language sql stable security invoker set search_path = ''
as $safety_file_visible$
  select case
    when bucket = 'avatars' then private.people_not_blocked(private.storage_user_id(object_name))
    when bucket = 'note-images' then owner_text = (select auth.uid())::text
      or exists (select 1 from public.notes n where n.archive_id::text = split_part(object_name,'/',1)
        and position(split_part(object_name,'/',2) in to_jsonb(n)::text) > 0)
      or exists (select 1 from public.note_versions v where v.archive_id::text = split_part(object_name,'/',1)
        and position(split_part(object_name,'/',2) in v.content::text) > 0)
      or exists (select 1 from public.profile_preferences p where p.user_id = (select auth.uid())
        and position(split_part(object_name,'/',2) in p.preferences::text) > 0)
    when bucket = 'chat-media' then owner_text = (select auth.uid())::text
      or exists (select 1 from public.archive_messages m
        where m.id = private.chat_media_message_id(object_name)
          and m.archive_id = private.storage_archive_id(object_name))
    else false end;
$safety_file_visible$;

-- Erasure: an emptied archive's chat files go with it, and chat files are
-- never kept because a note happens to mention their name.
create or replace function public.begin_account_erasure(target_user_id uuid, request_token uuid)
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
      or (o.bucket_id in ('note-images', 'chat-media')
        and split_part(o.name, '/', 1) = any(empty_archives::text[]))
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
      o.bucket_id in ('avatars', 'chat-media') or not (
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
