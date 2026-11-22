-- `review_safety_report(id, true)` hid only a report's note. A general-chat
-- message report has no note, so the operator's "hide" marked the report
-- hidden while the message, and its photos, stayed visible to every member.
--
-- A hidden message is filtered the way a hidden note is: from everybody,
-- author included, and the filter outlives the report's ninety-day retention.
-- Its chat files follow it through `safety_file_visible`, which reads
-- `archive_messages` under these policies.

create table if not exists private.hidden_safety_messages (
  message_id uuid primary key references public.archive_messages (id) on delete cascade,
  report_id uuid references private.safety_reports (id) on delete set null,
  created_at timestamptz not null default now()
);
revoke all on private.hidden_safety_messages from public, anon, authenticated;

create or replace function private.safety_message_visible(target_message_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $safety_message_visible$
  select not exists (
    select 1 from private.hidden_safety_messages where message_id = target_message_id
  );
$safety_message_visible$;
revoke all on function private.safety_message_visible(uuid) from public, anon;
grant execute on function private.safety_message_visible(uuid) to authenticated;

drop policy if exists archive_messages_moderation_filter on public.archive_messages;
create policy archive_messages_moderation_filter on public.archive_messages
  as restrictive for all to authenticated
  using (private.safety_message_visible(id))
  with check (private.safety_message_visible(id));

create or replace function public.review_safety_report(target_report_id uuid, hide_content boolean)
returns void language plpgsql security definer set search_path = ''
as $review_safety$
declare target_note_id uuid; target_message_id uuid;
begin
  select note_id, message_id into target_note_id, target_message_id
    from private.safety_reports where id = target_report_id for update;
  if not found then raise exception 'Report not found'; end if;
  if hide_content and target_note_id is not null then
    insert into private.hidden_safety_notes(note_id,report_id) values(target_note_id,target_report_id) on conflict do nothing;
  end if;
  if hide_content and target_message_id is not null then
    insert into private.hidden_safety_messages(message_id,report_id) values(target_message_id,target_report_id) on conflict do nothing;
  end if;
  update private.safety_reports set status = case when hide_content then 'hidden' else 'dismissed' end,
    reviewed_at = now() where id = target_report_id;
end;
$review_safety$;
revoke all on function public.review_safety_report(uuid,boolean) from public, anon, authenticated;
grant execute on function public.review_safety_report(uuid,boolean) to service_role;

-- The chat tables arrived after 20261111010000 took table grants back from the
-- signed-out role. Their policies already answer `anon` with nothing.
revoke all on public.archive_messages, public.archive_message_reactions,
  public.archive_stickers from anon;
