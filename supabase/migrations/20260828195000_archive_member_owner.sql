-- Each authenticated member lands on their own organisational view. This is
-- presentation state only; archive membership remains the authorization rule.

alter table public.archive_members
  add column if not exists owner text check (owner in ('u1', 'u2'));

create unique index if not exists archive_members_archive_owner_idx
  on public.archive_members (archive_id, owner)
  where owner is not null;
