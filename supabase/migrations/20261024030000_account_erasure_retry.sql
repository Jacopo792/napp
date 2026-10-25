create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- The Edge Function configures this using its server-only service key. The
-- scheduled command contains Vault lookups, never a literal credential.
create function public.configure_account_erasure_worker(endpoint text, worker_key text)
returns void language plpgsql security definer set search_path = ''
as $configure_erasure$
begin
  perform pg_advisory_xact_lock(hashtextextended('napp-account-erasure-config', 0));
  if not exists (select 1 from vault.secrets where name = 'napp_account_erasure_key') then
    perform vault.create_secret(worker_key, 'napp_account_erasure_key');
  end if;
  if not exists (select 1 from vault.secrets where name = 'napp_account_erasure_endpoint') then
    perform vault.create_secret(endpoint, 'napp_account_erasure_endpoint');
  end if;
  if not exists (select 1 from cron.job where jobname = 'napp-account-erasure-retry') then
    perform cron.schedule('napp-account-erasure-retry', '* * * * *', $cron_erasure$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'napp_account_erasure_endpoint'),
        headers := jsonb_build_object('Content-Type','application/json','Authorization',
          'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'napp_account_erasure_key')),
        body := '{"action":"resume"}'::jsonb,
        timeout_milliseconds := 30000
      );
    $cron_erasure$);
  end if;
  if not exists (select 1 from cron.job where jobname = 'napp-account-erasure-receipt-expiry') then
    perform cron.schedule('napp-account-erasure-receipt-expiry', '17 3 * * *', $cron_receipts$
      delete from private.account_erasure_receipts r where r.created_at < now() - interval '7 days'
        and not exists (select 1 from private.account_erasure_jobs j where j.receipt_token = r.token);
    $cron_receipts$);
  end if;
end;
$configure_erasure$;
revoke all on function public.configure_account_erasure_worker(text,text) from public, anon, authenticated;
grant execute on function public.configure_account_erasure_worker(text,text) to service_role;
