-- Read-only metadata; no accounts, content, credentials or receipts returned.
select
  not has_function_privilege('authenticated','public.begin_account_erasure(uuid,uuid)','execute') as erasure_is_service_only,
  not has_function_privilege('anon','public.request_account_deletion(uuid)','execute') as old_request_anonymous_revoked,
  not has_function_privilege('authenticated','public.request_account_deletion(uuid)','execute') as old_request_authenticated_revoked,
  has_function_privilege('anon','public.account_erasure_status(uuid)','execute') as anonymous_receipt_lookup,
  has_function_privilege('authenticated','public.report_safety_issue(text,uuid,uuid,uuid,text)','execute') as authenticated_reporting,
  not has_function_privilege('authenticated','public.review_safety_report(uuid,boolean)','execute') as moderation_is_service_only,
  exists(select 1 from pg_policies where schemaname='public' and tablename='notes' and policyname='notes_safety_filter' and permissive='RESTRICTIVE') as note_filter,
  exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='storage_safety_filter' and permissive='RESTRICTIVE') as storage_filter;
