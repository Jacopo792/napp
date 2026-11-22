# Backend operations

## Production allocation

On 13 November 2026, `notes-collab` was upgraded in the Render dashboard to
`0.5c-512mb`: 0.5 CPU and 512 MB RAM, with a base price of USD 7/month.
The replacement deployment reached Live. The previous free allocation was
0.1 CPU and the same 512 MB RAM; this upgrade increases CPU allocation, not RAM.
It does not establish a measured user capacity or a fivefold app speed increase.

The workspace remains Hobby. One collaboration instance runs in Frankfurt;
`notes-collab-bus` remains the free Redis-compatible Valkey bus. Supabase still
owns Auth, Postgres, Realtime and private Storage. The durable note content is
in Postgres, not Redis or the collaboration container's filesystem.

`render.yaml` records this allocation but does not drive the existing service.
Change live allocation in the dashboard and update that file to match.

## Always-on operation

Paid web instances do not spin down after inactivity. The old GitHub Actions
keep-awake loop is obsolete and has been removed from this checkout. The
published workflow was also disabled manually in GitHub Actions on 13 November
2026, stopping future scheduled runs without publishing this checkout's changes.

Keep `/readyz` as the Render health-check path: it checks Supabase and the bus.
`/healthz` checks the process only, and `/version` identifies its running commit.
For a read-only release smoke check, run:

```bash
VITE_COLLAB_URL=wss://notes-collab.onrender.com \
EXPECTED_REVISION=<full-deployed-commit-sha> pnpm verify:deployment
```

This checks readiness, the expected revision and allowed/rejected WebSocket
origins. It does not read note content or substitute for a load test.

## Newly available tools

- Dashboard Shell is available for diagnostics. External SSH additionally
  requires account key setup and a compatible Docker image; do not assume it
  works merely because the plan is paid.
- Manual scaling is available. Each additional instance adds its own compute
  charge; retain one instance until measurements justify more. Keep Redis
  coordination when processes overlap, including during deployments.
- One-off jobs can reuse the deployed image and environment for maintenance.
  They incur separate compute charges and should run only for a specific task.
- Paid services can attach persistent disks, but this service does not need one:
  durable data already lives in Supabase. A disk would also prevent horizontal
  scaling and disable zero-downtime deployments.
- Horizontal autoscaling requires a Pro workspace or higher; the USD 7 instance
  alone does not include it. Workspace, bandwidth and build usage are billed
  separately according to their included allowances.

Preserve the CI deployment gate, readiness checks, Redis coordination and client
reconnect behavior. Always-on compute does not eliminate restarts, deploys or
network interruptions, and does not require changing the collaboration protocol.

## Capacity decisions

Before increasing process concurrency, cache TTLs or memory limits, measure CPU,
resident memory, active sockets, simultaneously open documents, initial sync
latency, persistence latency and reconnect/error rates under realistic editing.
Use disposable staging accounts and documents for load tests, not production
notes. Registered-user count alone does not size the collaboration process.

Review Render bandwidth and build usage alongside compute, and measure Supabase
queries/storage separately. A paid collaboration process does not increase
Supabase or Valkey quotas. Keep backup and restore planning with those services.

## Schema rollout and recovery

1. Replay migrations and run the backend checks against a disposable Supabase
   instance. Before production schema changes, check the latest usable backup
   and rehearse recovery in a separate project, including private Storage
   objects alongside database rows.
2. Apply required migrations before publishing clients or services that depend
   on them.
3. Deploy the compatible Edge Functions and validate Auth templates and redirects
   in staging. Keep staging and production SMTP credentials separate.
4. Verify the Render revision and browser/native origins before publishing the
   website. On a failed release, restore the last compatible frontend and server
   revisions, and verify their behavior against the current database schema.
   Reverting application code leaves the applied migrations in place. Use a
   forward repair for a shared schema unless a restoration has been rehearsed.

The CI deploy hook sends the tested Git SHA as the Render `ref` parameter.
[Render deploy hooks](https://render.com/docs/deploy-hooks#deploying-a-specific-git-commit)

## Provider references

- [Compute prices](https://render.com/pricing#compute)
- [Free versus paid instances](https://render.com/docs/free)
- [Scaling](https://render.com/docs/scaling)
- [Shell and SSH](https://render.com/docs/ssh)
- [Deployment behavior](https://render.com/docs/deploys)
- [One-off jobs](https://render.com/docs/one-off-jobs)

## Confirmed email and anonymous sign-ups

Keep Auth email confirmation enabled for production (`[auth.email].enable_confirmations = true`). Configure production SMTP through the Auth dashboard with a verified sender and the production mailbox credentials, then test confirmation, address changes and recovery in staging. Validate callback URLs, limits and mail delivery before making live configuration changes. Postgres checks both `auth.users.email_confirmed_at` and `is_anonymous` for sharing. Auth still allows anonymous sign-ins for personal archives, with a local default of 10 per IP per hour in `[auth.rate_limit].anonymous_users`. Set the hosted limit independently. [Supabase anonymous sign-ins](https://supabase.com/docs/guides/auth/auth-anonymous).

CAPTCHA is off by default. For a staged rollout, configure `[auth.captcha]` with `enabled = true`, `provider = "turnstile"` or `"hcaptcha"` and the server-only `NAPP_AUTH_CAPTCHA_SECRET`. Pass the same provider and its public site key as `VITE_AUTH_CAPTCHA_PROVIDER` and `VITE_AUTH_CAPTCHA_SITE_KEY` in the web and desktop builds. Test the challenge on the delivered origins and verify the native clients pass a challenge token for anonymous sign-up before enabling the hosted Auth switch. Existing native clients also need a server policy-acceptance record or support for `accept_policies` before they write. [Supabase CAPTCHA configuration](https://supabase.com/docs/guides/auth/auth-captcha).

The upload ceilings use decimal bytes. Free allows 1 GB per uploader and billing account and 1 GB per archive. Plus allows 20 GB per uploader and billing account and 5 GB per archive. Reaching a limit blocks additional uploads. Existing data remains readable under its existing access rules. Chat upload paths without a message, comment or sticker go to cleanup after 24 hours.
