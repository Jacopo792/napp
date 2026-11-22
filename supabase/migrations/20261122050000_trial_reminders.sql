create table private.trial_reminders (
  owner_id uuid not null references public.account_entitlements(owner_id) on delete cascade,
  trial_ends_at timestamptz not null,
  days_left smallint not null check (days_left in (1, 7)),
  lease uuid not null,
  leased_at timestamptz not null,
  sent_at timestamptz,
  primary key (owner_id, trial_ends_at, days_left)
);
revoke all on private.trial_reminders from public, anon, authenticated;

-- A crashed sender can retry after the lease. The SMTP Message-ID is derived
-- from the reminder's primary key and stays stable on a retry.
create function public.claim_trial_reminders()
returns table(owner_id uuid, email text, trial_ends_at timestamptz, days_left smallint, lease uuid)
language sql security definer set search_path = ''
as $claim$
  with due as (
    select e.owner_id, e.trial_ends_at, d.days_left
    from public.account_entitlements e
    join auth.users u on u.id = e.owner_id
    cross join (values (1::smallint), (7::smallint)) d(days_left)
    where e.status = 'trialing' and e.source = 'trial'
      and private.effective_plan(e.owner_id) = 'plus'
      and u.email_confirmed_at is not null and u.email is not null
      and e.trial_ends_at > statement_timestamp() + (d.days_left - 1) * interval '24 hours'
      and e.trial_ends_at <= statement_timestamp() + d.days_left * interval '24 hours'
      and not exists (select 1 from private.account_erasure_jobs job where job.user_id = e.owner_id)
      and not exists (
        select 1 from private.trial_reminders r
        where r.owner_id = e.owner_id and r.trial_ends_at = e.trial_ends_at and r.days_left = d.days_left
          and (r.sent_at is not null or r.leased_at > statement_timestamp() - interval '30 minutes')
      )
    order by e.trial_ends_at, e.owner_id limit 10
  ), claimed as (
    insert into private.trial_reminders as r (owner_id, trial_ends_at, days_left, lease, leased_at)
    select d.owner_id, d.trial_ends_at, d.days_left, gen_random_uuid(), statement_timestamp() from due d
    on conflict (owner_id, trial_ends_at, days_left) do update
      set lease = excluded.lease, leased_at = excluded.leased_at
      where r.sent_at is null and r.leased_at <= statement_timestamp() - interval '30 minutes'
    returning r.owner_id, r.trial_ends_at, r.days_left, r.lease
  )
  select c.owner_id, u.email::text, c.trial_ends_at, c.days_left, c.lease
  from claimed c join auth.users u on u.id = c.owner_id;
$claim$;

create function public.complete_trial_reminder(reminder_lease uuid)
returns void language sql security definer set search_path = ''
as $complete$
  update private.trial_reminders set sent_at = statement_timestamp()
  where lease = reminder_lease and sent_at is null;
$complete$;

revoke all on function public.claim_trial_reminders(), public.complete_trial_reminder(uuid)
  from public, anon, authenticated;
grant execute on function public.claim_trial_reminders(), public.complete_trial_reminder(uuid)
  to service_role;
