-- "Is typing" in a chat is a Realtime broadcast on the private topic
-- `typing:<archiveId>`: said and forgotten, never stored. Only the archive's
-- members may join it, to listen or to speak, exactly as for presence
-- (20260829250000_private_archive_presence.sql).

create or replace function private.typing_archive_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $typing_archive$
  select
    case
      when (select realtime.topic()) ~* '^typing:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then split_part((select realtime.topic()), ':', 2)::uuid
      else null
    end;
$typing_archive$;

revoke all on function private.typing_archive_id() from public, anon;
grant execute on function private.typing_archive_id() to authenticated;

drop policy if exists typing_member_select on realtime.messages;
create policy typing_member_select
  on realtime.messages
  for select
  to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and (select private.is_archive_member((select private.typing_archive_id())))
  );

drop policy if exists typing_member_insert on realtime.messages;
create policy typing_member_insert
  on realtime.messages
  for insert
  to authenticated
  with check (
    realtime.messages.extension = 'broadcast'
    and (select private.is_archive_member((select private.typing_archive_id())))
  );
