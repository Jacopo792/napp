# Private usage dashboard

Open Settings → Napp → Usage. The section appears only for the administrator. The server grants access only to the verified account `ansalonenahida@gmail.com`, pinned to its immutable Auth user ID when the migration runs. Other accounts cannot list activity or read/write the private tables directly. No service key is shipped to clients.

Migration `supabase/migrations/20261116010000_usage_dashboard.sql` was applied on 2026-11-16, before the clients that use it. If that verified account does not exist when the migration runs, no administrator is granted. Once its email has been verified, provision it from the trusted SQL console:

```sql
insert into private.usage_administrator(user_id)
select id from auth.users
where lower(email) = 'ansalonenahida@gmail.com'
  and email_confirmed_at is not null
on conflict do nothing;
```

Updated clients report activity on opening/resuming and interactions, at most once per minute. No timer claims an idle client is active. The server supplies the user ID and timestamp. Activity time has roughly one-minute granularity during continuous use; this is not an online indicator. Data collection is best-effort while online; old clients and offline activity are not reconstructed.

Each row represents one account, random local installation/browser-profile identifier and client type. Clearing local storage or reinstalling can create another row. Different browsers and the native app on the same physical device can appear separately. Browser detection yields a coarse device category, not a verified hardware model. These client-supplied labels are informational, never security signals. Search is server-side, with 100 entries per page ordered by last activity. Account deletion cascades to activity rows.

The updated privacy notice describes this collection; its version is bumped so the existing policy gate shows the revised notice. No note contents, entered text, IP addresses or location are added to usage records.

Validate with `node --experimental-strip-types --test packages/core/src/lib/usage.test.ts` and the existing TypeScript, lint and build checks. The PGlite tests run the actual SQL, including administrator/non-administrator/anonymous access and account-deletion behavior.
