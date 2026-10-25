# Quality checks and device-content removal

## Automated checks

`pnpm test:e2e` runs two UI smoke tests against the preview fixture. They cover
navigation, editing and finding a new note through search. They do not prove
backend authorization or persistence.

Start local Supabase with `supabase start`, then run `pnpm test:e2e:full` for
browser tests against the production web app and a local collaboration server.
The harness obtains credentials only from local CLI status and refuses a hosted
API URL. Backend fixtures use disposable accounts and archives, with one-time
sessions provisioned without sending mail. Interactive sign-in still uses real
password authentication. Cleanup waits for document and history persistence.

For server integration tests, also start a disposable Valkey instance. The port
must be free; reuse your existing local test instance if one is already running.

```sh
docker run -d --rm --name napp-test-valkey -p 127.0.0.1:6380:6379 valkey/valkey:8-alpine
REQUIRE_INTEGRATION=1 REDIS_URL=redis://127.0.0.1:6380 pnpm test:server
pnpm test:e2e:full
# After testing, stop only the services you started for this run:
docker stop napp-test-valkey
supabase stop
```

The suite covers persistence after reload, unauthorized access and a tampered
archive selection, invitations, offline convergence between browsers, locked
notes, version restoration, account deletion preserving another member's work,
and explicit sign-out. Cache regressions cover two tabs, a blocked deletion,
new opens during removal, a late payload writer and an aborted transaction.
Automatic inactivity locking is also checked while offline.

Typechecking includes the harness. Both browser suites run in CI without automatic
retries or skipped failures; failure screenshots and traces are retained for
seven days and contain only local fixtures. CI raises the local fixture sign-in
quota only in its disposable checkout, without changing committed or production
Auth configuration. Repeated local runs can still hit normal local quotas.

## Device-content policy

Explicit sign-out asks for consent to remove local copies, including edits that
have not reached the server. Providers close, account-scoped IndexedDB deletion
must finish, and payload/image caches are cleared before the session is removed.
A blocked or aborted removal reports an error and leaves the session available
for a retry. Other saved accounts and their collaborative document stores remain.

A shared removal marker prevents other tabs opening new documents or writing
late payloads. If cleanup is interrupted by a crash, restoration requires fresh
authentication rather than reopening a blocked editor.

Automatic inactivity locking hides the workspace immediately, even offline,
and retains collaborative stores for recovery. Switching accounts also retains
them. Retained stores are plaintext, not disk encryption.

## Deployment verification

`ops/collab-origins.json` records expected origins. A server test checks that
`render.yaml` documents the same values. Live environment settings must still be
configured to match; this manifest does not silently edit the hosting service.

The server validates origin configuration at startup. `/version` reports the
full running Git revision with caching disabled; unconfigured local development
explicitly reports `null`.

`VITE_COLLAB_URL=wss://your-service.example pnpm verify:deployment` verifies
readiness, actual WebSocket upgrades for expected origins and rejection of an
unrelated origin. Set `EXPECTED_REVISION` to a full Git SHA to require that
version; `DEPLOY_WAIT_MS` bounds the optional rollout wait.

CI checks the requested server revision, readiness and origins before publishing
Pages. A missing deploy hook is explicitly reported as a skipped backend deploy.

## Practical limits

Browser integration checks do not establish signed installer acceptance or
runtime behavior in every operating-system version. Desktop installers remain
unsigned. Production mail delivery, moderation operations and backup policies
must be verified separately; see `SECURITY.md` and `moderation-operations.md`.

Refactor large components in small extractions behind these tests. Realtime
redesign should follow measurements, and localization should follow a product
decision. Neither is implied by a successful test run.
