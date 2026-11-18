-- The general chat joins the safety rules the note chat already had.
--
-- 1. A block hides the blocked person's messages and reactions, both ways,
--    exactly as `comments_safety_filter` does for note comments.
-- 2. A message cannot newly name somebody on the other side of a block.
--    Only names an edit adds are checked: a mention written before the block
--    must not freeze the message, and scrubbing a name must never fail.
-- 3. A general-chat message can be reported. `report_safety_issue` took only
--    note comments, so every report of a general message was refused.
-- 4. A member who leaves, or whose account is erased, is taken out of the
--    mentions. Their id stayed behind and, since a message may only name
--    members, the message could no longer be edited.
--
-- Additive for released clients: the report function keeps its old named
-- arguments; `target_message_id` is new and defaults to null.

-- 1.
drop policy if exists archive_messages_safety_filter on public.archive_messages;
create policy archive_messages_safety_filter on public.archive_messages
  as restrictive for all to authenticated
  using (private.people_not_blocked(author_id))
  with check (private.people_not_blocked(author_id));

drop policy if exists archive_message_reactions_safety_filter on public.archive_message_reactions;
create policy archive_message_reactions_safety_filter on public.archive_message_reactions
  as restrictive for all to authenticated
  using (private.people_not_blocked(user_id))
  with check (private.people_not_blocked(user_id));

-- 2. Membership and blocks, checked against the names this write adds.
create or replace function private.check_archive_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $check$
declare
  added uuid[] := array(
    select named from unnest(new.mentions) as named
    except
    select kept from unnest(case when tg_op = 'UPDATE' then old.mentions else '{}'::uuid[] end) as kept
  );
begin
  if exists (
    select 1 from unnest(added) as named(user_id)
    where not exists (
      select 1 from public.archive_members m
      where m.archive_id = new.archive_id and m.user_id = named.user_id
    )
  ) then
    raise check_violation using message = 'A message can only name members';
  end if;
  if (select auth.role()) = 'authenticated' and exists (
    select 1 from unnest(added) as named(user_id)
    join public.user_blocks b
      on (b.blocker_id = new.author_id and b.blocked_id = named.user_id)
      or (b.blocked_id = new.author_id and b.blocker_id = named.user_id)
  ) then
    raise check_violation using message = 'You cannot mention a blocked account';
  end if;
  if new.reply_to is not null and not exists (
    select 1 from public.archive_messages answered
    where answered.id = new.reply_to and answered.archive_id = new.archive_id
  ) then
    raise check_violation using message = 'A reply answers a message of the same archive';
  end if;
  return new;
end;
$check$;

-- 3.
alter table private.safety_reports
  add column if not exists message_id uuid
    references public.archive_messages (id) on delete set null;

drop function if exists public.report_safety_issue(text, uuid, uuid, uuid, text);
create function public.report_safety_issue(reason_code text, target_note_id uuid default null,
  target_user_id uuid default null, target_comment_id uuid default null,
  report_details text default '', target_message_id uuid default null)
returns uuid language plpgsql security definer set search_path = ''
as $report_safety$
declare
  caller uuid := (select auth.uid());
  target_note public.notes%rowtype;
  target_comment public.note_comments%rowtype;
  target_message public.archive_messages%rowtype;
  report_id uuid;
  captured jsonb := '{}'::jsonb;
  reported_user uuid := target_user_id;
begin
  if caller is null or not exists(select 1 from auth.users where id = caller)
    or exists(select 1 from private.account_erasure_jobs where user_id = caller) then
    raise insufficient_privilege using message = 'Sign in again';
  end if;
  if reason_code not in ('harassment','sexual_content','hate','violence','illegal','spam','other')
    or char_length(coalesce(report_details,'')) > 2000 then
    raise check_violation using message = 'Choose a reason and use up to 2000 characters';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('report:' || caller::text, 0));
  if target_note_id is not null then
    select * into target_note from public.notes where id = target_note_id;
    if not found or not private.is_archive_member(target_note.archive_id)
      or not private.archived_note_visible(target_note.owner_id, target_note.archived_at)
      or not private.people_not_blocked(target_note.owner_id) then
      raise insufficient_privilege using message = 'This note is not available to report';
    end if;
    captured := jsonb_build_object('note',to_jsonb(target_note));
    reported_user := target_note.owner_id;
  end if;
  if target_comment_id is not null then
    select * into target_comment from public.note_comments where id = target_comment_id and note_id = target_note_id;
    if not found or not private.people_not_blocked(target_comment.author_id) then
      raise insufficient_privilege using message = 'This comment is not available to report';
    end if;
    captured := captured || jsonb_build_object('comment',to_jsonb(target_comment));
    reported_user := target_comment.author_id;
  end if;
  if target_message_id is not null then
    select * into target_message from public.archive_messages where id = target_message_id;
    if not found or not private.is_archive_member(target_message.archive_id)
      or not private.people_not_blocked(target_message.author_id) then
      raise insufficient_privilege using message = 'This message is not available to report';
    end if;
    captured := captured || jsonb_build_object('message',to_jsonb(target_message));
    reported_user := target_message.author_id;
  end if;
  if target_note_id is null and not exists (
    select 1 from public.archive_members mine join public.archive_members theirs using(archive_id)
      where mine.user_id = caller and theirs.user_id = reported_user
  ) then raise insufficient_privilege using message = 'Choose a note or a member of your archive'; end if;
  if reported_user = caller then raise check_violation using message = 'You cannot report your own content'; end if;
  select r.id into report_id from private.safety_reports r where r.reporter_id = caller
    and r.note_id is not distinct from target_note_id and r.target_user_id is not distinct from reported_user
    and r.comment_id is not distinct from target_comment_id
    and r.message_id is not distinct from target_message_id
    and r.reason = reason_code and r.status = 'pending'
    order by r.created_at limit 1;
  if report_id is not null then return report_id; end if;
  if (select count(*) from private.safety_reports where reporter_id = caller and created_at > now() - interval '1 hour') >= 10 then
    raise check_violation using message = 'Too many reports. Contact support for urgent concerns';
  end if;
  insert into private.safety_reports(reporter_id,target_user_id,note_id,comment_id,message_id,reason,details,snapshot)
    values(caller,reported_user,target_note_id,target_comment_id,target_message_id,reason_code,coalesce(report_details,''),captured)
    returning id into report_id;
  return report_id;
end;
$report_safety$;
revoke all on function public.report_safety_issue(text,uuid,uuid,uuid,text,uuid) from public, anon;
grant execute on function public.report_safety_issue(text,uuid,uuid,uuid,text,uuid) to authenticated;

-- 4. Leaving covers erasure too: `begin_account_erasure` deletes the
--    erased account's memberships.
create or replace function private.forget_departed_mentions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $forget$
begin
  update public.archive_messages
    set mentions = array_remove(mentions, old.user_id)
    where archive_id = old.archive_id and old.user_id = any(mentions);
  return old;
end;
$forget$;
revoke all on function private.forget_departed_mentions() from public, anon, authenticated;

drop trigger if exists forget_departed_mentions on public.archive_members;
create trigger forget_departed_mentions
  after delete on public.archive_members
  for each row execute function private.forget_departed_mentions();

-- Names already left behind by people who are no longer members.
update public.archive_messages message
  set mentions = array(
    select named from unnest(message.mentions) as named
    where exists (
      select 1 from public.archive_members m
      where m.archive_id = message.archive_id and m.user_id = named
    )
  )
  where exists (
    select 1 from unnest(message.mentions) as named
    where not exists (
      select 1 from public.archive_members m
      where m.archive_id = message.archive_id and m.user_id = named
    )
  );
