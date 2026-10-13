-- Recognized text belongs to the archive; the note keeps its original media.
create table public.media_text (
 archive_id uuid not null references public.archives(id) on delete cascade,
 object_id uuid not null,
 text text not null check (octet_length(text) <= 2097152),
 primary key (archive_id, object_id)
);
alter table public.media_text enable row level security;
create policy media_text_member_select on public.media_text for select to authenticated
 using ((select private.is_archive_member(archive_id)));
create policy media_text_writer_insert on public.media_text for insert to authenticated
 with check ((select private.can_write_archive(archive_id)));
create policy media_text_writer_update on public.media_text for update to authenticated
 using ((select private.can_write_archive(archive_id))) with check ((select private.can_write_archive(archive_id)));
create policy media_text_writer_delete on public.media_text for delete to authenticated
 using ((select private.can_write_archive(archive_id)));
grant select, insert, update, delete on public.media_text to authenticated;

alter publication supabase_realtime add table public.media_text;
