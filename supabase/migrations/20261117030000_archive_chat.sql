-- The archive's general chat: one conversation among its members, about no
-- note in particular.
--
-- Its own table rather than note_comments with no note: every released client
-- reads note_comments across the whole archive to count unread remarks per
-- note, and a row with no note would be counted against nothing. Same rules
-- as the note chat: members read, editors write under their own name, only
-- the author changes or deletes the words.
--
-- Additive: no released client selects these tables. Apply before deploying
-- the client that does.

create table if not exists public.archive_messages (
  id uuid primary key default gen_random_uuid(),
  archive_id uuid not null references public.archives (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  mentions uuid[] not null default '{}',
  bubble text check (bubble is null or bubble ~ '^[a-z]{1,24}$'),
  reply_to uuid references public.archive_messages (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists archive_messages_archive_idx
  on public.archive_messages (archive_id, created_at);

alter table public.archive_messages enable row level security;

drop policy if exists archive_messages_member_select on public.archive_messages;
create policy archive_messages_member_select on public.archive_messages
  for select
  to authenticated
  using ((select private.is_archive_member(archive_id)));

drop policy if exists archive_messages_editor_insert on public.archive_messages;
create policy archive_messages_editor_insert on public.archive_messages
  for insert
  to authenticated
  with check (
    (select private.can_write_archive(archive_id))
    and author_id = (select auth.uid())
  );

drop policy if exists archive_messages_author_update on public.archive_messages;
create policy archive_messages_author_update on public.archive_messages
  for update
  to authenticated
  using (
    (select private.can_write_archive(archive_id))
    and author_id = (select auth.uid())
  )
  with check (
    (select private.can_write_archive(archive_id))
    and author_id = (select auth.uid())
  );

drop policy if exists archive_messages_author_delete on public.archive_messages;
create policy archive_messages_author_delete on public.archive_messages
  for delete
  to authenticated
  using (
    (select private.can_write_archive(archive_id))
    and author_id = (select auth.uid())
  );

-- An edit changes the words and whom they name, nothing else. A reply may be
-- cleared, because that is what `on delete set null` does.
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
  if new.reply_to is not null then
    new.reply_to := old.reply_to;
  end if;
  return new;
end;
$freeze$;

drop trigger if exists freeze_archive_message on public.archive_messages;
create trigger freeze_archive_message
  before update on public.archive_messages
  for each row execute function private.freeze_archive_message();

-- A message names members of its archive, and answers a message of its own
-- archive.
create or replace function private.check_archive_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $check$
begin
  if exists (
    select 1 from unnest(new.mentions) as named(user_id)
    where not exists (
      select 1 from public.archive_members m
      where m.archive_id = new.archive_id and m.user_id = named.user_id
    )
  ) then
    raise check_violation using message = 'A message can only name members';
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

drop trigger if exists check_archive_message on public.archive_messages;
create trigger check_archive_message
  before insert or update of mentions on public.archive_messages
  for each row execute function private.check_archive_message();

create table if not exists public.archive_message_reactions (
  message_id uuid not null references public.archive_messages (id) on delete cascade,
  archive_id uuid not null references public.archives (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

create index if not exists archive_message_reactions_archive_idx
  on public.archive_message_reactions (archive_id);

alter table public.archive_message_reactions enable row level security;

drop policy if exists archive_message_reactions_member_select on public.archive_message_reactions;
create policy archive_message_reactions_member_select on public.archive_message_reactions
  for select
  to authenticated
  using ((select private.is_archive_member(archive_id)));

drop policy if exists archive_message_reactions_own_insert on public.archive_message_reactions;
create policy archive_message_reactions_own_insert on public.archive_message_reactions
  for insert
  to authenticated
  with check (
    (select private.can_write_archive(archive_id))
    and user_id = (select auth.uid())
    and exists (
      select 1 from public.archive_messages m
      where m.id = archive_message_reactions.message_id
        and m.archive_id = archive_message_reactions.archive_id
    )
  );

drop policy if exists archive_message_reactions_own_delete on public.archive_message_reactions;
create policy archive_message_reactions_own_delete on public.archive_message_reactions
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- An account being erased writes nothing new here either.
drop trigger if exists guard_erased_account_writes on public.archive_messages;
create trigger guard_erased_account_writes
  before insert or update on public.archive_messages
  for each row execute function private.guard_erased_account_writes();
drop trigger if exists guard_erased_account_writes on public.archive_message_reactions;
create trigger guard_erased_account_writes
  before insert or update on public.archive_message_reactions
  for each row execute function private.guard_erased_account_writes();

do $publish$
declare
  published text;
begin
  foreach published in array array['archive_messages', 'archive_message_reactions'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = published
    ) then
      execute format('alter publication supabase_realtime add table public.%I', published);
    end if;
  end loop;
end;
$publish$;
