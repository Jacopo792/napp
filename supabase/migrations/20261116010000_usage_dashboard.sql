-- The administrator is pinned to a verified account ID, never JWT metadata.
create table private.usage_administrator (
  user_id uuid primary key references auth.users(id) on delete cascade
);
insert into private.usage_administrator(user_id)
  select id from auth.users
  where lower(email) = 'ansalonenahida@gmail.com' and email_confirmed_at is not null;

create table private.usage_devices (
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null,
  client text not null check (client in ('web', 'desktop', 'mobile')),
  device text not null check (length(device) between 1 and 80),
  os text not null check (length(os) between 1 and 80),
  browser text not null check (length(browser) <= 80),
  first_seen_at timestamptz not null default now(),
  last_active_at timestamptz not null default now(),
  primary key (user_id, device_id, client)
);
create index usage_devices_last_active on private.usage_devices(last_active_at desc);
alter table private.usage_devices enable row level security;
alter table private.usage_administrator enable row level security;
revoke all on private.usage_devices, private.usage_administrator from public, anon, authenticated;

create function public.is_usage_administrator()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from private.usage_administrator where user_id = (select auth.uid()));
$$;

create function public.record_usage_activity(
  p_device_id uuid, p_client text, p_device text, p_os text, p_browser text
) returns void language plpgsql security definer set search_path = ''
as $$
declare caller uuid := (select auth.uid());
begin
  if caller is null then raise insufficient_privilege using message = 'Sign in required'; end if;
  if exists (select 1 from private.account_erasure_jobs where user_id = caller) then return; end if;
  -- Identity and timestamps come from the server, never from client arguments.
  insert into private.usage_devices(user_id, device_id, client, device, os, browser)
  values (caller, p_device_id, p_client, p_device, p_os, p_browser)
  on conflict (user_id, device_id, client) do update
    set device = excluded.device, os = excluded.os, browser = excluded.browser,
        last_active_at = now()
    where private.usage_devices.last_active_at < now() - interval '30 seconds';
end;
$$;

create function public.list_usage_activity(p_search text default '', p_offset integer default 0)
returns table (
  user_id uuid, email text, nickname text, device_id uuid, client text,
  device text, os text, browser text, first_seen_at timestamptz,
  last_active_at timestamptz, total_count bigint
) language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_usage_administrator() then
    raise insufficient_privilege using message = 'Access denied';
  end if;
  return query
    select d.user_id, u.email::text, coalesce(p.nickname, '')::text,
      d.device_id, d.client, d.device, d.os, d.browser, d.first_seen_at,
      d.last_active_at, count(*) over ()
    from private.usage_devices d
    join auth.users u on u.id = d.user_id
    left join public.profiles p on p.user_id = d.user_id
    where coalesce(u.email, '') ilike '%' || left(coalesce(p_search, ''), 100) || '%'
      or coalesce(p.nickname, '') ilike '%' || left(coalesce(p_search, ''), 100) || '%'
    order by d.last_active_at desc, d.user_id, d.device_id, d.client
    limit 100 offset greatest(0, coalesce(p_offset, 0));
end;
$$;

revoke all on function public.is_usage_administrator() from public, anon;
revoke all on function public.record_usage_activity(uuid,text,text,text,text) from public, anon;
revoke all on function public.list_usage_activity(text,integer) from public, anon;
grant execute on function public.is_usage_administrator() to authenticated;
grant execute on function public.record_usage_activity(uuid,text,text,text,text) to authenticated;
grant execute on function public.list_usage_activity(text,integer) to authenticated;
