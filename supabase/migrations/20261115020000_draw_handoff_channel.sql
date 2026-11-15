-- Draw on iPhone.
--
-- The desk asks the phone signed into the same account to draw a picture or a
-- board, over a private Realtime channel whose topic is that account's own:
-- `draw:<auth.uid()>`. Only the asking crosses it (broadcast) and whether a
-- phone is listening (presence); the strokes are written to the note's Y.Doc
-- through the collaboration server, which judges them as it judges any edit.
--
-- Nobody but the account itself may join, listen or speak on its topic.

drop policy if exists draw_owner_select on realtime.messages;
create policy draw_owner_select
  on realtime.messages
  for select
  to authenticated
  using (
    realtime.messages.extension in ('broadcast', 'presence')
    and (select realtime.topic()) = 'draw:' || (select auth.uid())::text
  );

drop policy if exists draw_owner_insert on realtime.messages;
create policy draw_owner_insert
  on realtime.messages
  for insert
  to authenticated
  with check (
    realtime.messages.extension in ('broadcast', 'presence')
    and (select realtime.topic()) = 'draw:' || (select auth.uid())::text
  );
