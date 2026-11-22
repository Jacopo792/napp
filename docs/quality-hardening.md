# Quality checks and device-content removal

## Automated checks

`pnpm test:e2e` runs browser checks against the preview fixture. They cover
navigation, editing, search, slash formatting, note links and drawing commit/cancel.
They do not prove backend authorization or persistence. See
[workspace-editor.md](workspace-editor.md) for module ownership.

Start local Supabase with `supabase start`, then run `pnpm test:e2e:full` for
browser tests against Vite's development server and local collaboration.
The cache-race tests use Vite's source-module URLs to open the stores directly.
The harness obtains credentials only from local CLI status and refuses a hosted
API URL. Backend fixtures use disposable accounts and archives, with one-time
sessions provisioned without sending mail. Interactive sign-in still uses real
password authentication. Cleanup waits for document and history persistence.

For server integration tests, also start a disposable Valkey instance. The port
must be free; reuse your existing local test instance if one is already running.

```sh
docker run -d --rm --name napp-test-valkey -p 127.0.0.1:6380:6379 valkey/valkey:8-alpine
REQUIRE_INTEGRATION=1 REDIS_URL=redis://127.0.0.1:6380 pnpm test:server
pnpm verify:supabase:local
pnpm test:e2e:full
pnpm test:e2e:production
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

Typechecking includes the harness. The browser suites run in CI without automatic
retries or skipped failures; failure screenshots and traces are retained for
seven days and contain only local fixtures. CI raises the local fixture sign-in
quota only in its disposable checkout, without changing committed or production
Auth configuration. Repeated local runs can still hit normal local quotas.

`pnpm test:e2e:production` runs the workspace smoke tests against the built web
bundle with the same disposable backend. `pnpm healthcheck:full` runs the local
checks and all browser suites in
sequence. Start Supabase and Valkey and install Chromium first. On GitHub,
critical dependency advisories fail the checks job.

## Web bundle budgets

`pnpm build:check` follows the Vite manifest for the sign-in route and the
workspace. The budgets are 240 KiB and 550 KiB gzip, respectively. The check
includes the entry and statically imported JavaScript and CSS, with shared files
counted once. It excludes fonts, images and features loaded on demand, such as
the editor, document export and HEIC decoding. Run a browser profile for runtime
timing or asset transfer characteristics.

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
Pages. A missing deploy hook fails the production deployment.

## Practical limits

Browser integration checks do not establish signed installer acceptance or
runtime behavior in every operating-system version. Desktop installers remain
unsigned. Production mail delivery, moderation operations and backup policies
must be verified separately; see `SECURITY.md` and `moderation-operations.md`.

Refactor large components in small extractions behind these tests. Realtime
redesign should follow measurements, and localization should follow a product
decision. Neither is implied by a successful test run.

## Repository audit, 22 November 2026

The review covered the web and Electron entry points, the shared workspace
and editor, Hocuspocus/Valkey, Supabase migrations and Edge Functions, release
workflows, dependencies and operational documentation. It used the working
checkout with the pending account and workspace changes, and compared deployment
configuration with the published `main` revision. Capacity assumptions are a
single Render instance, normal archive collaboration and a second process during
deploys. Production concurrency and archive size still need measurement.

| Priority        | Finding                                                                                                                                                                      | Change or validation still due                                                                                                                                                             |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Release blocker | The branch missed the custom-domain base path and Cloudflare mirror. The Render hook could request a newer commit than CI had tested.                                        | Restored both web targets and their allowed origins. The hook now requests the tested revision and fails directly on an HTTP error.                                                        |
| High            | The dependency audit reported a critical advisory and outdated packages in the editor and build toolchain.                                                                   | Updated the compatible versions and gated CI on critical advisories.                                                                                                                       |
| High            | End-to-end tests used Vite's development server.                                                                                                                             | Added a production-bundle smoke suite and the local Supabase authorization and Realtime check to CI. The source-level cache fixtures stay on Vite dev.                                     |
| Medium          | The workspace loaded the entire release history before opening What's New. Web policy acceptance also repeated an Auth lookup for accounts already confirmed on this device. | Moved the history to Settings, kept the current release identifier lightweight, and used the policy cache. Added gzip budgets for both routes.                                             |
| Medium          | Cold archive loads still fetch each uncached payload for search and note previews. Large archives can also make the workspace recalculate many rows at once.                 | Measure cold and warm archive opens with representative note and attachment sizes. Any change to payload loading must preserve offline drafts, full-text search and version-aware caching. |
| Medium          | There is no measured concurrency envelope or verified recovery time for the production backend.                                                                              | Rehearse restore with database and Storage data, and profile multi-user editing in staging. See [Backend operations](backend-operations.md).                                               |

The workspace's initial JavaScript and CSS fell from 553.4 to 536.2 KiB gzip
in the local build. The final sign-in route measured 226.9 KiB. The workspace
measurement stops at the route boundary, before opening notes or Settings.

The audit checkout passed its embedded PostgreSQL checks and desktop build.
The preview fixtures mark workspace hints as seen before testing the editor.
The collaboration image now installs only the server and core workspace
dependencies. The install linked 199 packages, down from 757 with the previous
hoisted layout. The rebuilt image returned HTTP 200 on `/healthz`. The disposable
Supabase stack experienced Realtime out-of-memory restarts and Auth timeouts, so local
full-stack verification remains incomplete. The fixture CLI calls now have a
deadline and Playwright reuses verified local credentials within each worker.

The published `main` was healthy at revision `b938a24` during the read-only
Render check. The working branch and `main` have commits on both sides. Bring the
work together before release and repeat the checks against the integrated
revision. The review covered the main flows and release boundaries rather than
every UI component or historical migration line by line.
