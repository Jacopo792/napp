-- 1. Eight seats, not two. The default and every archive still on the old
--    default; an archive somebody set by hand keeps its number.
-- 2. A new archive is made with the people the caller already shares an
--    archive with. Inviting the person you write with into every archive
--    you make was a ceremony with one possible answer. Up to the seats.

alter table public.archives alter column seat_limit set default 8;
update public.archives set seat_limit = 8 where seat_limit = 2;

create or replace function private.create_archive(archive_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $create$
declare
  current_user_id uuid := (select auth.uid());
  trimmed text := pg_catalog.btrim(coalesce(archive_name, ''));
  new_archive_id uuid;
begin
  if current_user_id is null then
    raise insufficient_privilege using message = 'Authentication required';
  end if;
  if trimmed = '' or pg_catalog.length(trimmed) > 80 then
    raise check_violation using message = 'An archive needs a name of up to 80 characters';
  end if;
  -- Not a quota anybody is meant to meet; a loop in a client is.
  if (select count(*) from public.archive_members where user_id = current_user_id) >= 20 then
    raise check_violation using message = 'You already belong to twenty archives';
  end if;

  insert into public.archives (name, settings)
  values (trimmed, '{}'::jsonb)
  returning id into new_archive_id;

  insert into public.archive_members (archive_id, user_id)
  values (new_archive_id, current_user_id);

  insert into public.archive_members (archive_id, user_id)
  select new_archive_id, others.user_id
    from (
      select distinct other.user_id
        from public.archive_members mine
        join public.archive_members other on other.archive_id = mine.archive_id
       where mine.user_id = current_user_id
         and other.user_id <> current_user_id
       limit 7
    ) others
  on conflict do nothing;

  return new_archive_id;
end;
$create$;
