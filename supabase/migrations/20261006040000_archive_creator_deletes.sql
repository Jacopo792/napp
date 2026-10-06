-- Whoever made an archive may delete it for everybody in it.
--
-- `delete_archive` allowed only the last member, so leaving was the only way
-- out of an archive somebody else was still in — and leaving keeps it alive
-- for them, notes and all. The maker is the one account that may end it;
-- everybody else may only leave.
--
-- `created_by` is backfilled with each archive's first member, which is who
-- `create_archive` and `bootstrap_personal_archive` seat first. New rows take
-- the caller from the column default, so no function has to remember it.

alter table public.archives
  add column if not exists created_by uuid references auth.users (id) on delete set null
  default auth.uid();

update public.archives a
   set created_by = first.user_id
  from (
    select distinct on (archive_id) archive_id, user_id
    from public.archive_members
    order by archive_id, created_at
  ) first
 where first.archive_id = a.id
   and a.created_by is null;

create or replace function private.archive_deletion_refusal(target_archive_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $refusal$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    return 'Authentication required';
  end if;
  if not exists (
    select 1 from public.archive_members
    where archive_id = target_archive_id and user_id = current_user_id
  ) then
    return 'You are not in this archive';
  end if;
  if exists (
    select 1 from public.archive_members
    where archive_id = target_archive_id and user_id <> current_user_id
  ) and not exists (
    select 1 from public.archives
    where id = target_archive_id and created_by = current_user_id
  ) then
    return 'Only whoever made this archive can delete it while others are in it';
  end if;
  if not exists (
    select 1 from public.archive_members
    where user_id = current_user_id and archive_id <> target_archive_id
  ) then
    return 'This is your only archive';
  end if;
  return null;
end;
$refusal$;

-- A member may rename an archive, so the row is writable; the maker is not a
-- thing anybody may rewrite into their own name.
create or replace function private.freeze_archive_creator()
returns trigger
language plpgsql
set search_path = ''
as $freeze$
begin
  new.created_by := old.created_by;
  return new;
end;
$freeze$;

drop trigger if exists freeze_archive_creator on public.archives;
create trigger freeze_archive_creator
  before update of created_by on public.archives
  for each row execute function private.freeze_archive_creator();
