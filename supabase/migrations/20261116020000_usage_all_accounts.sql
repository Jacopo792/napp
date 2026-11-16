-- Every account with an email appears, even before it reports activity from an
-- updated client; device columns are null for those rows. Anonymous accounts
-- appear only once they have activity.
create or replace function public.list_usage_activity(p_search text default '', p_offset integer default 0)
returns table (
  user_id uuid, email text, nickname text, device_id uuid, client text,
  device text, os text, browser text, first_seen_at timestamptz,
  last_active_at timestamptz, total_count bigint
) language plpgsql stable security definer set search_path = ''
as $list$
begin
  if not public.is_usage_administrator() then
    raise insufficient_privilege using message = 'Access denied';
  end if;
  return query
    select u.id, u.email::text, coalesce(p.nickname, '')::text,
      d.device_id, d.client, d.device, d.os, d.browser,
      coalesce(d.first_seen_at, u.created_at), d.last_active_at, count(*) over ()
    from auth.users u
    left join private.usage_devices d on d.user_id = u.id
    left join public.profiles p on p.user_id = u.id
    where (u.email is not null or d.user_id is not null)
      and (coalesce(u.email, '') ilike '%' || left(coalesce(p_search, ''), 100) || '%'
        or coalesce(p.nickname, '') ilike '%' || left(coalesce(p_search, ''), 100) || '%')
    order by d.last_active_at desc nulls last, u.created_at desc, u.id, d.device_id, d.client
    limit 100 offset greatest(0, coalesce(p_offset, 0));
end;
$list$;
