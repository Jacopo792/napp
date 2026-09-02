-- Preferences are not part of who you are to the other members.
--
-- They were put on `public.profiles` yesterday, which was the wrong row for two
-- reasons that only showed up once something started writing it often:
--
-- 1. `subscribeToArchive` treats *any* change to `profiles` as a wake-up and
--    reloads the whole archive snapshot — six queries plus the note payloads.
--    That was right while the row only changed when somebody renamed themselves.
--    It is wrong now that dragging a colour slider writes it: the other
--    member's browser reloaded her entire archive while you picked an accent.
--
-- 2. `profiles_read_shared` is a row policy with no column list, so sharing an
--    archive with somebody let them select your wallpaper, your palette and how
--    long your session waits before locking itself. None of that is theirs.
--
-- Its own table answers both: nobody else may read it, so nobody else is woken
-- by it. `profiles` goes back to being the row the roster draws.
--
-- Additive on purpose. `profiles.preferences` stays where it is until the
-- client that no longer reads it is deployed and confirmed — that ordering is
-- the one this repository has been bitten by before.

create table if not exists public.profile_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Whatever the previous shape already collected, so nobody's palette resets.
insert into public.profile_preferences (user_id, preferences)
select user_id, preferences
from public.profiles
where preferences is not null
  and preferences <> '{}'::jsonb
on conflict (user_id) do nothing;

alter table public.profile_preferences enable row level security;

-- Yours alone, in all three directions. There is no shared read here and there
-- is no reason for one.
drop policy if exists profile_preferences_read_own on public.profile_preferences;
create policy profile_preferences_read_own on public.profile_preferences
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists profile_preferences_insert_own on public.profile_preferences;
create policy profile_preferences_insert_own on public.profile_preferences
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists profile_preferences_update_own on public.profile_preferences;
create policy profile_preferences_update_own on public.profile_preferences
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.profile_preferences from anon;
grant select, insert, update on public.profile_preferences to authenticated;

create or replace function public.touch_profile_preferences()
returns trigger
language plpgsql
security definer
set search_path = ''
as $touch_preferences$
begin
  new.updated_at := now();
  return new;
end;
$touch_preferences$;

drop trigger if exists profile_preferences_touch on public.profile_preferences;
create trigger profile_preferences_touch
  before update on public.profile_preferences
  for each row execute function public.touch_profile_preferences();

-- Realtime is what tells the browser you left open that you changed something
-- in the other one. The read policy above is what keeps that delivery to you.
do $publish_preferences$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'profile_preferences'
  ) then
    alter publication supabase_realtime add table public.profile_preferences;
  end if;
end
$publish_preferences$;
