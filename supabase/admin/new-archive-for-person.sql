-- Give one person their own empty archive.
--
-- Use this when someone should be able to *use* the app without seeing an
-- existing archive's notes. Adding them to `public.archive_members` of a shared
-- archive is the opposite: membership is full read and write over every note,
-- folder, tag and file in it.
--
-- This has to run in the Supabase SQL editor rather than through the app,
-- because `archives_member_all` checks `private.is_archive_member(id)` on
-- insert — a brand new archive has no members yet, so no client session can
-- create one. `pnpm add:member` covers the other case, joining an account to an
-- archive that already exists.
--
-- Replace the email and the archive name, then run the whole statement. If the
-- email does not match an account, nothing is created.

with target as (
  select id from auth.users where email = 'person@example.com'
),
new_archive as (
  insert into public.archives (name)
  select 'Their notes'
  from target
  returning id
)
insert into public.archive_members (archive_id, user_id, owner)
select new_archive.id, target.id, 'u1'
from new_archive
cross join target
returning archive_id, user_id, owner;
