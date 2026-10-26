-- Limit the retained copy of reviewed reports. A confirmed content filter
-- survives deletion of its report via the existing ON DELETE SET NULL FK.
create function private.purge_reviewed_safety_reports()
returns void language sql security definer set search_path = ''
as $purge_reviewed_reports$
  delete from private.safety_reports where reviewed_at < now() - interval '90 days';
$purge_reviewed_reports$;
revoke all on function private.purge_reviewed_safety_reports() from public, anon, authenticated;
grant execute on function private.purge_reviewed_safety_reports() to service_role;

do $schedule_report_retention$
begin
  if exists(select 1 from pg_namespace where nspname = 'cron') then
    perform cron.schedule('purge-reviewed-safety-reports', '37 3 * * *',
      'select private.purge_reviewed_safety_reports()');
  end if;
end;
$schedule_report_retention$;
