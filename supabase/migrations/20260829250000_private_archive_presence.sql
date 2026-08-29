-- Presence is symmetric in the client: you only see others while sharing
-- your own. The server must enforce the same boundary, so a non-member can
-- neither publish presence nor observe it.
--
-- Realtime authorization is enforced on `realtime.messages`. Each policy maps
-- to a channel action (receive / publish) and is evaluated when the client
-- joins the topic, using `realtime.topic()` together with the caller's JWT.
-- See https://supabase.com/docs/guides/realtime/authorization
--
-- The presence channel is private (`config.private = true`) and its topic is
-- `presence:<archiveId>`. The archive id is therefore derived from the topic
-- and checked against `archive_members`. Postgres Changes subscriptions keep
-- their existing public channels and table RLS; this migration touches only
-- the `presence` extension.

create or replace function private.presence_archive_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $presence_archive$
  select
    case
      when (select realtime.topic()) ~* '^presence:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then split_part((select realtime.topic()), ':', 2)::uuid
      else null
    end;
$presence_archive$;

revoke all on function private.presence_archive_id() from public, anon;
grant execute on function private.presence_archive_id() to authenticated;

-- Receiving presence: SELECT on realtime.messages where extension = 'presence'
drop policy if exists presence_member_select on realtime.messages;
create policy presence_member_select
  on realtime.messages
  for select
  to authenticated
  using (
    realtime.messages.extension = 'presence'
    and (select private.is_archive_member((select private.presence_archive_id())))
  );

-- Publishing presence: INSERT where extension = 'presence'
drop policy if exists presence_member_insert on realtime.messages;
create policy presence_member_insert
  on realtime.messages
  for insert
  to authenticated
  with check (
    realtime.messages.extension = 'presence'
    and (select private.is_archive_member((select private.presence_archive_id())))
  );
