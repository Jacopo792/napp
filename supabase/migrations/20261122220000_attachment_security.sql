-- Old clients select and write explicit profile fields. The copied legacy
-- values must no longer be part of the shared profile row.
alter table public.profiles drop column preferences;

-- Freeze the association for older uploads before accepting any new edits.
-- Ambiguous references stay private to the uploader until explicitly migrated.
create table private.note_asset_bindings (
  object_id uuid primary key references storage.objects(id) on delete cascade,
  note_id uuid not null
);
revoke all on private.note_asset_bindings from public, anon, authenticated;

create function private.note_document_assets(document jsonb)
returns setof text language sql immutable set search_path = ''
as $assets$
  select value #>> '{}' from jsonb_path_query(document,
    'lax $.** ? (@.type == "privateImage" || @.type == "privateFile").attrs.objectId') as asset(value)
$assets$;

insert into private.note_asset_bindings(object_id, note_id)
select o.id, min(ref.note_id::text)::uuid
from (
  select n.archive_id, n.id as note_id, a.object_name from public.notes n
    cross join lateral (
      select private.note_document_assets(n.content)
      union all select n.page_icon->>'objectId' where n.page_icon->>'kind' = 'photo'
      union all select n.cover->>'objectId' where n.cover->>'kind' = 'upload'
      union all select match[1] from regexp_matches(n.legacy_body,
        '\]\(napp-(?:image|file):([0-9a-f-]{36})\)', 'gi') as match
        where n.content_version = 0
    ) as a(object_name)
  union all
  select v.archive_id, v.note_id, private.note_document_assets(v.content) from public.note_versions v
) as ref
join storage.objects o on o.bucket_id = 'note-images'
  and o.name = ref.archive_id::text || '/' || ref.object_name
group by o.id
having count(distinct ref.note_id) = 1;

-- Supabase supplies user_metadata at upload finalization. The binding is
-- write-once for each storage row, including when a client edits its notes.
create function private.bind_uploaded_note_asset()
returns trigger language plpgsql security definer set search_path = ''
as $bind$
declare
  source_note text := new.user_metadata->>'noteId';
begin
  if source_note ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    insert into private.note_asset_bindings(object_id, note_id)
    values (new.id, source_note::uuid);
  end if;
  return new;
end
$bind$;
revoke all on function private.bind_uploaded_note_asset() from public, anon, authenticated;
create trigger bind_uploaded_note_asset after insert on storage.objects
for each row when (new.bucket_id = 'note-images')
execute function private.bind_uploaded_note_asset();

create function private.note_asset_source(target_object_id uuid)
returns uuid language sql stable security definer set search_path = ''
as $source$
  select b.note_id from private.note_asset_bindings b
  join storage.objects o on o.id = b.object_id
  where b.object_id = target_object_id
    and private.is_archive_member(private.storage_archive_id(o.name))
$source$;
revoke all on function private.note_asset_source(uuid) from public, anon;
grant execute on function private.note_asset_source(uuid) to authenticated;

-- Public uploads create a new object. Replacing an existing object could
-- rewrite its source binding or replace somebody else's bytes.
drop policy note_images_editor_update on storage.objects;

-- Restrict writable object names to the attachment layout used by clients.
create policy attachment_upload_paths on storage.objects
as restrictive for insert to authenticated
with check (
  bucket_id not in ('note-images', 'chat-media')
  or (
    private.storage_archive_id(name) is not null
    and split_part(name, '/', 3) = ''
    and name = split_part(name, '/', 1) || '/' || split_part(name, '/', 2)
    and case when bucket_id = 'note-images' then
      split_part(name, '/', 2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    else
      private.chat_media_message_id(name) is not null
      and substring(split_part(name, '/', 2), 38) ~ '^([0-9]{1,2}|giphy|link|pack|sticker)\.[a-z0-9]{2,5}$'
    end
  )
);

create function private.attachment_visible(
  bucket text, object_name text, object_id uuid, uploader text
)
returns boolean language sql stable security invoker set search_path = ''
as $visible$
  select case
    when bucket = 'avatars' then private.people_not_blocked(private.storage_user_id(object_name))
    when bucket = 'note-images' then uploader = (select auth.uid())::text
      or exists (
        select 1 from public.notes n
        where n.archive_id = private.storage_archive_id(object_name)
          and n.id = private.note_asset_source(object_id)
          and n.trashed_at is null
          and (
            (n.page_icon->>'kind' = 'photo' and n.page_icon->>'objectId' = split_part(object_name,'/',2))
            or (n.cover->>'kind' = 'upload' and n.cover->>'objectId' = split_part(object_name,'/',2))
            or split_part(object_name,'/',2) in (select private.note_document_assets(n.content))
            or (n.content_version = 0 and exists (select 1 from regexp_matches(n.legacy_body,
              '\]\(napp-(?:image|file):([0-9a-f-]{36})\)', 'gi') as match
              where match[1] = split_part(object_name,'/',2)))
            or exists (select 1 from public.note_versions v
              where v.note_id = n.id and v.archive_id = n.archive_id
                and split_part(object_name,'/',2) in (select private.note_document_assets(v.content)))
          )
      )
    when bucket = 'chat-media' then uploader = (select auth.uid())::text
      or exists (
        select 1 from public.archive_messages m
        where m.id = private.chat_media_message_id(object_name)
          and m.archive_id = private.storage_archive_id(object_name)
          and m.author_id::text = uploader
          and (m.attachments @> jsonb_build_array(jsonb_build_object('path', object_name))
            or m.sticker->>'path' = object_name or m.link->>'image' = object_name)
      )
      or exists (
        select 1 from public.note_comments c join public.notes n on n.id = c.note_id
        where c.id = private.chat_media_message_id(object_name)
          and c.archive_id = private.storage_archive_id(object_name)
          and c.author_id::text = uploader and n.trashed_at is null
          and (c.attachments @> jsonb_build_array(jsonb_build_object('path', object_name))
            or c.sticker->>'path' = object_name or c.link->>'image' = object_name)
      )
      or exists (select 1 from public.archive_stickers s
        where s.path = object_name and s.owner_id::text = uploader)
    else false end
$visible$;
revoke all on function private.attachment_visible(text,text,uuid,text) from public, anon;
grant execute on function private.attachment_visible(text,text,uuid,text) to authenticated;

alter policy storage_safety_filter on storage.objects using (
  private.attachment_visible(bucket_id, name, id, coalesce(owner_id,owner::text))
);
drop function private.safety_file_visible(text,text,text);

-- Search results and PDF text must follow the same read rules as the bytes.
create policy media_text_attachment_visibility on public.media_text
as restrictive for select to authenticated
using (exists (
  select 1 from storage.objects o
  where o.bucket_id = 'note-images'
    and o.name = media_text.archive_id::text || '/' || media_text.object_id::text
));
