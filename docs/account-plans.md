# Account plans

Apply the account entitlement and trial-reminder migrations before releasing clients that call the new RPCs. Update the collaboration server as part of the same rollout so open WebSockets enforce the database's answer. The entitlement migration grants existing registered accounts 720 hours of Plus from the backfill. A new registered account starts at creation. A guest session starts its trial when converted into a registered account. Each account has one entitlement row, and sign-in, invitation claims and linking an existing account do not restart the trial.

The archive creator supplies its plan and Storage quota. An invited member keeps their own plan and trial dates. If account erasure leaves an archive without its creator, the oldest remaining member supplies the plan. Free accounts can keep private Notes archives and one writable two-person Notes group. When several groups survive a downgrade, the oldest two-person Notes group stays writable. Extra groups, books and groups with more than two people remain readable and exportable. Plus group capacity comes from the archive's seat limit, up to eight. Free members can invite someone into a private Notes archive while their shared-group slot is available.

The database decides the effective plan at request time. Paid active, past-due and canceled entitlements retain Plus through the recorded paid-through timestamp. All three require a finite timestamp. After a downgrade, older version rows stay in the database and RLS limits visibility to 720 hours. Free accounts can restore visible versions, with an unnamed checkpoint of the present. Storage charges finalized file sizes in `note-images` and `chat-media` against the archive owner's 1 GB or 20 GB (decimal). It serializes quota checks per owner and preserves existing media.

Native Account Settings shows the plan and trial expiration. Preview supports `?plan=free`, `?plan=readonly`, `?plan=last-week` and `?plan=last-day`.

## Stripe Plus billing

Start with a Stripe sandbox and a separate Supabase test database. Only expose the publishable key to the client.

1. In Stripe, create a Napp Plus product with recurring EUR Prices of €4 monthly and €36 yearly. Enable the Customer Portal with payment method updates, invoices and cancellation at period end. Configure currency, payment methods and tax for the intended market before enabling live checkout.
2. Apply the migrations and deploy `stripe-billing`, `stripe-webhook` and the updated `delete-account` function. Set `STRIPE_SECRET_KEY`, `STRIPE_PLUS_PRICE_ID` (yearly), `STRIPE_PLUS_PRICE_ID_MONTHLY` and `STRIPE_NAPP_WEB_URL` in Supabase secrets. Use the web app's full base URL, including its subpath on GitHub Pages. Allow the `invoice.paid` webhook event at `/functions/v1/stripe-webhook` and set its signing secret as `STRIPE_WEBHOOK_SECRET`.
3. Set `VITE_STRIPE_PUBLISHABLE_KEY` at web and desktop build time. The desktop app opens the web checkout in the default browser. The browser may require sign-in to the Napp account.
4. In the sandbox, verify both billing periods from separate disposable accounts, a switch that expires the previous Checkout Session, checkout from Free and trial, a declined card, 3-D Secure, duplicate checkout tabs, webhook retry, renewal, cancellation and account deletion. The last paid invoice determines the Plus deadline. Deleting a Napp account closes open sessions and deletes the linked Stripe Customer to cancel renewals.

Use the same Stripe environment for the Price, API keys, webhook and portal. If replacing a recurring Price after launch, preserve recognition of earlier Price IDs for their existing renewals before changing the configured ID.

## Trial reminder job

The reminder sender ships disabled. Once production SMTP is configured and delivery has been verified, configure a trusted job to run `python3 scripts/send-trial-reminders.py` every 15 minutes with `TRIAL_REMINDERS_ENABLED=1`. Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TRIAL_SMTP_HOST`, `TRIAL_SMTP_PORT` (defaults to 465, implicit TLS), `TRIAL_SMTP_FROM`, `TRIAL_SMTP_USER` and `TRIAL_SMTP_PASSWORD` in the job's secrets. The service-role RPC leases up to ten due reminders per run and records confirmed sends. SMTP and Postgres cannot commit together. A retry after an ambiguous delivery can send the same Message-ID again.
