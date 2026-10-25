# Quality checks and device-content removal

## Local validation, 25 October 2026

- 292 core/function tests and the local PostgreSQL erasure verification passed.
- 62 server tests passed against Supabase and Valkey, with no skips.
- 15 full-stack browser tests and two preview UI smoke tests passed.
- Workspace typechecking, formatting and lint passed; lint retains 26 existing
  Fast Refresh warnings and no errors.
- Web and desktop renderer builds, the mobile editor build and the iOS Metro
  export passed. These are not native device runtime or store-signing results.
- An independent code review checked the cleanup lifecycle and its regressions.

## Automated checks

`pnpm test:e2e` runs two browser smoke tests against the preview fixture:
navigation retains edits, and a new note can be written and found in search.
These tests prove UI behavior, not backend authorization or persistence.

`supabase start`, then `pnpm test:e2e:full`, runs the production app with
local Supabase and a local collaboration server. The harness reads credentials
only from the local CLI status and refuses a hosted API URL. It never loads
administrative credentials from `.env`. Tests using backend data create disposable
accounts and archives and clean them up after the collaboration server has flushed
its documents and versions. Fixture sessions use one-time tokens generated locally
without sending mail; interactive sign-in uses the actual account password.
There are no automatic test retries or ignored failures.

CI raises the sign-in quota only in its disposable local Supabase checkout:
server and browser fixtures all use one loopback IP. The committed Auth config
and production limits are unchanged. Repeated local runs can still hit the
ordinary local quota; authentication failures are not silently retried.

The full suite covers:

- Actual typing, database persistence and reloading.
- Another account's inability to read an archive, including a tampered local
  archive selection and a direct PostgREST request.
- Invitation redemption, an idempotent return by the intended recipient, and
  refusal to grant access to a stranger with the same token.
- Offline editing, convergence with another browser, and reopening.
- A locked note's read-only interface and refused metadata writes.
- Restoring a named version while preserving the current words.
- Public account deletion, including preserving another member's notes.
- Cancelling explicit sign-out, account-scoped cache removal, and another open tab.
- A blocked IndexedDB deletion failing without removing the session, followed
  by a successful retry.
- An inactivity lock hiding the archive offline while retaining its document.
- Another tab being unable to open a new document during device removal,
  a late cache writer being suppressed, and an aborted payload clear failing.
- The real mobile editor bundle acknowledging device-content removal only
  after deleting that account's IndexedDB stores. This runs in Chromium with a
  native-message adapter, not in a native WebView.

Both suites run in CI. A failure uploads screenshots and traces for seven days.
Those artifacts contain only disposable local fixture accounts. Typechecking
includes the E2E harness. The full suite builds its hosted-editor artifact into
`e2e/.hosted-editor/`, leaving the ordinary mobile build output untouched.

## Sign-out policy

Explicit sign-out requires confirmation that device copies, including unsynced
edits, will be removed. The app waits for provider closure and completed database
deletion. A separate host, such as the native editor, must acknowledge its own
cleanup before the session is removed. A deletion timeout leaves the session
available for a retry and reports the error.

Removal also blocks new document opens and payload writes in other tabs. A
persisted marker survives interrupted cleanup; restoration then asks for fresh
authentication instead of opening a permanently blocked editor. The native
transition clears content before unmounting the WebView that must acknowledge it.

Automatic locking hides the archive immediately, signs out and retains Yjs
stores for recovery. Account switching also keeps them. This distinction avoids
discarding offline work because an inactivity timer fired. None of these stores
is encrypted, and older installed clients retain their previous policy until
updated.

## Deployment verification

`ops/collab-origins.json` records the expected production and development
origins. A server test requires `render.yaml` to document the same values.
The live service still has to be configured to match; the manifest does not
silently change Render's environment.

The server rejects malformed origin configuration at startup and exposes its
source commit at `/version`, with caching disabled. A local development process
without a configured revision explicitly reports `null`.

Run `VITE_COLLAB_URL=wss://your-service.example pnpm verify:deployment` to check
readiness and real WebSocket upgrades for the expected production origins, plus
rejection of an unrelated origin. Set `EXPECTED_REVISION` to the full Git SHA
to require that precise deployment. `DEPLOY_WAIT_MS` optionally bounds the wait
for that SHA; CI allows ten minutes after requesting a deploy.

CI now verifies the server's revision, readiness and origins before publishing
the new Pages artifact. A missing Render hook is still explicitly reported as a
skipped server deployment; the workflow does not claim that the backend shipped.

## Remaining release validation

Native sign-out must still be exercised in iOS and Android WebViews, including
offline edits, a killed WebView process and account switching. The automated
bundle test does not establish native UI or bridge scheduling behavior.

Store signing, real mail delivery, production ownership and release review
remain tracked in `store-release-readiness.md`. No live deployment, store
submission or infrastructure-plan change is part of this work.

Refactoring the large React components should proceed by small extractions
behind these tests. Realtime batching and internationalization should follow
measured behavior and an explicit product decision; neither is a release claim
made by the automated suite.
