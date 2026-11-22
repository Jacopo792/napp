create function private.mail_safety_notice(recipient text, subject text, body text)
returns void language plpgsql security definer set search_path = ''
as $mail$
declare mail_key text; mail_from text;
begin
  if recipient is null or to_regclass('vault.decrypted_secrets') is null
    or to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then return; end if;
  select decrypted_secret into mail_key from vault.decrypted_secrets where name = 'napp_report_mail_key';
  select decrypted_secret into mail_from from vault.decrypted_secrets where name = 'napp_report_mail_from';
  if mail_key is null or mail_from is null then return; end if;
  perform net.http_post(url := 'https://api.resend.com/emails',
    headers := jsonb_build_object('Authorization','Bearer ' || mail_key,'Content-Type','application/json'),
    body := jsonb_build_object('from',mail_from,'to',jsonb_build_array(recipient),
      'subject',subject,'text',body));
exception when others then
  raise warning 'Safety notice email not queued (%)', sqlstate;
end;
$mail$;

create index safety_public_notices_time on private.safety_reports(created_at)
where snapshot ? 'public_notice';

create function public.submit_safety_notice(
  content_location text, explanation text, contact_name text, contact_email text,
  child_safety boolean, good_faith boolean
)
returns uuid language plpgsql security definer set search_path = ''
as $notice$
declare report uuid; address text := nullif(lower(btrim(contact_email)), '');
begin
  if auth.uid() is not null and not private.account_write_allowed() then
    raise insufficient_privilege using message = 'This account cannot write';
  end if;
  if good_faith is distinct from true or child_safety is null
    or char_length(btrim(coalesce(explanation,''))) not between 1 and 2000
    or char_length(btrim(coalesce(content_location,''))) not between 1 and 2048
    or btrim(content_location) !~ '^https?://[^[:space:]]+$'
    or char_length(btrim(coalesce(contact_name,''))) > 200
    or (not child_safety and (address is null or nullif(btrim(contact_name),'') is null))
    or (address is not null and (char_length(address) > 254
      or address !~ '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$'))
  then
    raise check_violation using message = 'Enter the content URL, explanation and required contact details';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('napp-public-safety-notices', 0));
  if (select count(*) from private.safety_reports where snapshot ? 'public_notice'
      and created_at > now() - interval '1 hour') >= 100
    or (address is not null and (select count(*) from private.safety_reports
      where snapshot ? 'public_notice' and created_at > now() - interval '1 hour'
        and snapshot #>> '{public_notice,email}' = address) >= 3)
  then
    raise sqlstate 'PT429' using message = 'Too many notices. Please contact the safety inbox.';
  end if;
  insert into private.safety_reports(reason,details,snapshot)
    values (case when child_safety then 'child_safety' else 'illegal' end, btrim(explanation),
      jsonb_build_object('public_notice', jsonb_build_object(
        'location',btrim(content_location),'name',nullif(btrim(contact_name),''),
        'email',address,'good_faith',true)))
    returning id into report;
  perform private.mail_safety_notice(address, 'Napp received a notice',
    'Napp received your notice for review. Reference: ' || report::text);
  return report;
end;
$notice$;

create function public.decide_safety_notice(target_report_id uuid, decision text)
returns void language plpgsql security definer set search_path = ''
as $decision$
declare recipient text;
begin
  if char_length(btrim(coalesce(decision,''))) not between 1 and 2000 then
    raise check_violation using message = 'Provide the decision, reasons and redress options';
  end if;
  update private.safety_reports
    set reviewed_at = now(), status = 'dismissed',
      snapshot = snapshot || jsonb_build_object('decision', btrim(decision))
    where id = target_report_id and snapshot ? 'public_notice' and not (snapshot ? 'decision')
    returning snapshot #>> '{public_notice,email}' into recipient;
  if not found then raise exception 'Pending public notice not found'; end if;
  perform private.mail_safety_notice(recipient, 'Napp notice decision',
    'Reference: ' || target_report_id::text || chr(10) || chr(10) || btrim(decision));
end;
$decision$;

revoke all on function private.mail_safety_notice(text,text,text),
  public.submit_safety_notice(text,text,text,text,boolean,boolean),
  public.decide_safety_notice(uuid,text) from public, anon, authenticated;
grant execute on function public.submit_safety_notice(text,text,text,text,boolean,boolean) to anon, authenticated;
grant execute on function public.decide_safety_notice(uuid,text) to service_role;
