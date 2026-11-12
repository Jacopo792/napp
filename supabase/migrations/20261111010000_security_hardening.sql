-- Findings of the 2026-11 security review that the database alone can close.

-- 1. The member-role picker was removed from every client, but its RPC stayed
--    callable: any editor, including one invited a minute ago, could demote
--    every other member to viewer and nobody else could undo it.
revoke execute on function public.set_archive_member_role(uuid, uuid, text) from authenticated;
revoke execute on function private.change_archive_member_role(uuid, uuid, text) from authenticated;

-- 2. Reactions were readable by plain membership, so they kept announcing
--    comments on notes the reader can no longer see (archived and hidden,
--    hidden by moderation, or owned by a blocked account). Reading `notes`
--    here applies that table's own policies, as note_versions already does.
drop policy if exists note_comment_reactions_member_select on public.note_comment_reactions;
create policy note_comment_reactions_member_select on public.note_comment_reactions
  for select to authenticated
  using (
    (select private.is_archive_member(archive_id))
    and exists (select 1 from public.notes n where n.id = note_id)
  );

-- 3. Two claims arriving together at the last seat both counted the members
--    before either was inserted. Taking the archive's row first makes the
--    second wait for the first. Named to sort ahead of the seat-cap trigger.
create function private.lock_archive_for_seating()
returns trigger language plpgsql security definer set search_path = ''
as $lock_archive_for_seating$
begin
  perform 1 from public.archives where id = new.archive_id for update;
  return new;
end;
$lock_archive_for_seating$;
revoke all on function private.lock_archive_for_seating() from public, anon, authenticated;
create trigger a_lock_archive_for_seating before insert on public.archive_members
for each row execute function private.lock_archive_for_seating();

-- 4. A note stays in the archive it was written in. The update policy only
--    asked for editor rights on the new archive, and a moved note left its
--    document, versions and comments behind under the old one.
create function private.keep_note_archive()
returns trigger language plpgsql set search_path = ''
as $keep_note_archive$
begin
  if (select auth.role()) = 'authenticated' then new.archive_id := old.archive_id; end if;
  return new;
end;
$keep_note_archive$;
create trigger keep_note_archive before update of archive_id on public.notes
for each row execute function private.keep_note_archive();

-- 5. A comment belongs to the archive of the note it is on. Definer rights:
--    this is a consistency check, not a visibility one.
create function private.check_comment_archive()
returns trigger language plpgsql security definer set search_path = ''
as $check_comment_archive$
begin
  if not exists (select 1 from public.notes n
      where n.id = new.note_id and n.archive_id = new.archive_id) then
    raise check_violation using message = 'That note is not in this archive';
  end if;
  return new;
end;
$check_comment_archive$;
revoke all on function private.check_comment_archive() from public, anon, authenticated;
create trigger check_comment_archive before insert on public.note_comments
for each row execute function private.check_comment_archive();

-- 6. Reporting a comment hid the whole note from the reporter until an
--    operator reviewed it — including the reporter's own note. Only a report
--    about the note itself hides the note.
create or replace function private.safety_note_visible(target_note_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $safety_note_visible$
  select not exists (select 1 from private.hidden_safety_notes where note_id = target_note_id)
    and not exists (select 1 from private.safety_reports
      where reporter_id = (select auth.uid()) and note_id = target_note_id
        and comment_id is null and status = 'pending');
$safety_note_visible$;

-- 7. The reported party could make a pending report disappear by deleting the
--    note or comment it was about. The report and its snapshot now outlive
--    their subject. Erasing the reported account still removes the report.
alter table private.safety_reports
  drop constraint safety_reports_note_id_fkey,
  drop constraint safety_reports_comment_id_fkey,
  add constraint safety_reports_note_id_fkey
    foreign key (note_id) references public.notes(id) on delete set null,
  add constraint safety_reports_comment_id_fkey
    foreign key (comment_id) references public.note_comments(id) on delete set null;
do $drop_target_check$
declare found name;
begin
  for found in select conname from pg_constraint
    where conrelid = 'private.safety_reports'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%target_user_id is not null%'
  loop
    execute format('alter table private.safety_reports drop constraint %I', found);
  end loop;
end;
$drop_target_check$;

-- 8. A block refused mentions between the two accounts but still let one hand
--    the other a thread to answer.
create or replace function private.check_blocked_mentions()
returns trigger language plpgsql security definer set search_path = ''
as $blocked_mentions$
begin
  if exists (select 1 from unnest(new.mentions || new.assignee_id) named(user_id)
    join public.user_blocks b
    on (b.blocker_id = new.author_id and b.blocked_id = named.user_id)
      or (b.blocked_id = new.author_id and b.blocker_id = named.user_id)) then
    raise check_violation using message = 'You cannot mention a blocked account';
  end if;
  return new;
end;
$blocked_mentions$;

-- 9. Tables created after the first revoke never took their grants back from
--    the signed-out role. Row level security already answered it with nothing;
--    this removes the reliance on that being the only barrier.
revoke all on public.note_comments, public.note_versions, public.note_comment_reactions,
  public.archive_sources, public.media_text from anon;
