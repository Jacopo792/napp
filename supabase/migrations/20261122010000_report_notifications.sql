-- A new safety report emails the safety inbox (safety@, an alias of support@), so a report reaches a person
-- without anybody polling the queue. The email carries the report's id,
-- reason and time only: no reporter, no target and no reported content.
-- Read the report itself with `scripts/moderate-reports.mjs --show <id>`.
--
-- Sent through Resend's HTTP API with pg_net (asynchronous: a failed email
-- never refuses the report); Postgres cannot speak SMTP, so the IONOS mailbox
-- is not used here. The sender's domain, nappnote.com, must be verified in
-- Resend first. Configure once, with the service role, in Vault:
--   select vault.create_secret('<resend api key>', 'napp_report_mail_key');
--   select vault.create_secret('safety@nappnote.com', 'napp_report_mail_to');
--   select vault.create_secret('Napp <support@nappnote.com>', 'napp_report_mail_from');
-- Until all three exist nothing is sent; the queue still holds every report.
-- pg_net and Vault come from 20261024030000_account_erasure_retry.sql.

create or replace function private.notify_safety_report()
returns trigger language plpgsql security definer set search_path = ''
as $notify$
declare mail_key text; mail_to text; mail_from text;
begin
  -- Without the Supabase stack (the PGlite replay) there is nothing to send with.
  if to_regclass('vault.decrypted_secrets') is null or to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then
    return new;
  end if;
  select decrypted_secret into mail_key from vault.decrypted_secrets where name = 'napp_report_mail_key';
  select decrypted_secret into mail_to from vault.decrypted_secrets where name = 'napp_report_mail_to';
  select decrypted_secret into mail_from from vault.decrypted_secrets where name = 'napp_report_mail_from';
  if mail_key is null or mail_to is null or mail_from is null then return new; end if;
  perform net.http_post(
    url := 'https://api.resend.com/emails',
    headers := jsonb_build_object('Authorization', 'Bearer ' || mail_key, 'Content-Type', 'application/json'),
    body := jsonb_build_object(
      'from', mail_from,
      'to', jsonb_build_array(mail_to),
      'subject', 'Napp: new report (' || new.reason || ')',
      'text', 'A new report is waiting for review.' || chr(10) || chr(10)
        || 'Report: ' || new.id || chr(10)
        || 'Reason: ' || new.reason || chr(10)
        || 'Kind: ' || case when new.message_id is not null then 'chat message'
             when new.comment_id is not null then 'comment'
             when new.note_id is not null then 'note' else 'user' end || chr(10)
        || 'Received: ' || to_char(new.created_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI') || ' UTC' || chr(10) || chr(10)
        || 'node scripts/moderate-reports.mjs --show ' || new.id
    )
  );
  return new;
end;
$notify$;
revoke all on function private.notify_safety_report() from public, anon, authenticated;

drop trigger if exists notify_safety_report on private.safety_reports;
create trigger notify_safety_report after insert on private.safety_reports
for each row execute function private.notify_safety_report();
