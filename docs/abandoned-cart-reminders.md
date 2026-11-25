# Shared cart and product reminder deployment

**Not operational until deployed and verified.** This setup starts real sends.
Do not use the old `abandoned-cart-scheduler.sql` or
`product-reminder-scheduler.sql`: the shared scheduler replaces both jobs.
`vercel.json` contains no Vercel Cron; Vercel Pro is not required for scheduling.

## Existing installation: manual-send update

These steps are for an installation that already uses the shared scheduler,
function and webhook. Do not repeat the full setup below, recreate secrets,
reset preferences, or create another cron job.

1. Back up the database. In Admin > Abandoned Carts, pause cart automation
   and temporarily stop administrators from sending reminders manually.
   Wait for in-flight cart scheduler and send requests to finish. Inspect
   function and website logs and the processing states; a lingering `sending`
   state may be an uncertain delivery, not a running request. Do not clear it
   or retry it without investigating the provider outcome.
2. In the Supabase SQL Editor for the existing project, run only
   `supabase/cart-manual-reminder.sql`. Its transaction adds claim metadata
   and updates the existing cart claim and final-eligibility functions. It does
   not recreate the scheduler, secrets, or customer preferences.
3. Deploy the updated website to the existing Vercel deployment. The shared
   Edge Function's code has not changed and does not need redeployment **if**
   the deployed version already calls `ajr_marketing_email_still_eligible`
   immediately before sending. Verify the deployed version or its logs;
   redeploy the existing shared function only if it is missing or outdated.
4. Re-enable cart automation if it was previously enabled. With an opted-in,
   verified test account and a test inbox, test an immediate manual send on
   a new cart, then independently test an automatic send after 30 minutes of
   inactivity (the existing five-minute scheduler may add delay). Confirm
   provider acceptance, webhook status, inbox delivery, unsubscribe,
   purchase/empty-cart cancellation and the 24-hour limit. Never retry an
   uncertain send without checking Resend and the delivery records.

Manual sends bypass only the inactivity threshold. The campaign switch, consent,
verified email, purchase, current-cart, frequency, quota and duplicate checks
still apply. Times are stored as absolute timestamps; the dashboard formats
them using the viewer's local time zone.

## Customer and delivery safeguards

Only verified signed-in accounts with a valid preference receive marketing.
The optional registration checkbox is unchecked and covers both campaigns;
older product-only consent does not authorize cart email. Existing explicit
cart consent applies only to its original bag. Anonymous visitors do not receive
email. Product and cart unsubscribe links remain valid across future visits;
the signed Resend webhook records delivery and suppresses both campaigns after
bounces, complaints or suppression.

Cart reminders are eligible after 30 minutes of inactivity, with at most one per
customer per 24 hours. Changed cart contents reset the timer; saving the same
contents does not. Empty or purchased carts
are excluded. Product reminders are eligible after two hours and are cancelled
on cart addition or purchase. Open carts and recent sends coordinate the two
campaigns. The current saved cart opens from the email button; sign-in may be
needed. Product clicks and cart/order matches are not proof of causal recovery.
Cart images, prices and values are saved snapshots, not verified order revenue.
Provider acceptance is not confirmed inbox delivery. A change racing after the
last eligibility check cannot recall an accepted email; offline changes cannot
be seen until saved. Unknown delivery outcomes are locked for manual review.
The dashboard's Scheduled state is an eligibility estimate, not a guarantee:
the shared scheduler still checks consent, cooldown, configuration and quota.
Skipped reflects an actual recorded notification event; delivery states require
provider receipts. A customer closing the site before a cart save completes can
prevent that change from reaching the server.

## Free-tier safeguards

The shared function checks Resend's account-wide Usage API before each
promotional send, reserves a database slot atomically, and fails closed if usage
cannot be checked. The API requires a **full-access** Resend key; protect it as
an administrative credential. Default ceilings are 100 emails per rolling
24 hours and 3,000 per calendar month; 20 daily and 300 monthly are held back
for transactional mail. These values can be lowered in
`email_automation_settings` by a trusted database administrator. Do not set
them above the free-tier ceilings. The admin pages show account usage including
inbound mail, conservative promotional capacity and both on/off controls.
Recent sends may be double-counted briefly, intentionally reducing capacity.
Unknown reservations remain counted until their period expires. The service
spaces its own Resend API requests; other applications can still use capacity or
rate limits concurrently. The reserve reduces but cannot eliminate external
races, and does not guarantee delivery of a burst of transactional mail.
Verify Resend account limits and billing settings; no upgrade is performed.

One shared five-minute job processes up to five carts and five product
reminders per invocation. Backlogs, service outages, free-project pauses and
provider rate limits can delay sends. Check actual Supabase and Resend plan
availability and restrictions before rollout. Vercel Hobby terms restrict
commercial use; confirm that your current hosting use complies.

## Safe cutover

1. Back up the database. Disable any old Supabase jobs named
   `ajr-abandoned-cart-reminders` and `ajr-product-reminders`, and any old
   Vercel Cron. Inspect in-flight requests before continuing. In SQL Editor
   apply, in order:
   `supabase/customer-features.sql`, `supabase/abandoned-carts.sql`,
   `supabase/notification-automation.sql`, `supabase/visitor-analytics.sql`,
   `supabase/product-reminders.sql`, `supabase/cart-recovery-automation.sql`,
   `supabase/email-automation.sql`. The Auth triggers require permission on
   `auth.users`; install them before publishing the new signup checkbox.
   Never infer existing customer consent.
   To stop those two legacy jobs without affecting other jobs:
   `select cron.unschedule(jobid) from cron.job where jobname in ('ajr-abandoned-cart-reminders', 'ajr-product-reminders');`
2. Before deploying, pause both campaigns for a controlled rollout:
   `update public.email_automation_settings set cart_enabled = false, product_enabled = false where id;`
   Apply the shared scheduler SQL in step 6 to remove any remaining old
   Supabase jobs idempotently.
3. Configure server-only Vercel environment variables:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL=https://www.rajutraders.in`,
   `CRON_SECRET` (32+ random characters), `PRODUCT_REMINDER_TOKEN_SECRET`
   (a separate 32+ random characters), `AJR_EMAIL_EDGE_URL` (the shared Edge
   URL), `AJR_MAIL_SECRET` (another independent 32+ random characters),
   `RESEND_WEBHOOK_SECRET`, and `NOTIFICATIONS_EMAIL_ENABLED=true`.
   Keep existing `RESEND_API_KEY` and sender configuration for order
   confirmations; the transactional code is unchanged. Rotating
   `PRODUCT_REMINDER_TOKEN_SECRET` invalidates previously signed links.
4. In Supabase Edge Function secrets set:
   - `RESEND_API_KEY`: existing Resend key with full access for Usage API.
   - `RESEND_FROM_EMAIL`: `no-reply@rajutraders.in`.
   - `APP_URL`: `https://www.rajutraders.in`.
   - `AJR_SCHEDULER_SECRET`: independent random 32+ character secret.
   - `AJR_MAIL_SECRET`: exactly the Vercel `AJR_MAIL_SECRET`.
   - `AJR_CRON_SECRET`: exactly the Vercel `CRON_SECRET`.

   Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to Edge
   Functions. Store secrets in the respective dashboards, not source control,
   shell history, screenshots, chat or public client variables. Verify the Resend
   sender domain and DNS in Resend before proceeding.
5. The function already exists under
   `supabase/functions/shared-email-automation`; open the nested `ajr`
   project folder if it is not visible in VS Code. From that directory,
   authenticate the Supabase CLI and deploy only the shared function:

   ```powershell
   Set-Location 'C:\Users\sakth\Downloads\ajr-main\ajr-main\ajr'
   npx --yes supabase login
   npx --yes supabase functions deploy shared-email-automation --remote=kaxcerzvwypplynqzspy --no-verify-jwt --use-api --yes
   npx --yes supabase functions list --remote=kaxcerzvwypplynqzspy
   ```

   `--use-api` bundles remotely without Docker. If the CLI reports that the
   local project is not initialized, run `npx --yes supabase init` from the
   same directory and retry; do not use `--force` on an existing configuration.
   JWT verification is disabled because the function validates its own distinct
   scheduler and server-to-server secrets. Never expose the mail secret to the
   browser. Deploy the website and confirm both protected cron endpoints are
   reachable at the configured origin without redirects.
6. In Supabase Vault create `ajr_shared_email_edge_url` with the function URL
   `https://kaxcerzvwypplynqzspy.supabase.co/functions/v1/shared-email-automation`
   and `ajr_scheduler_secret` with the same value as Edge's
   `AJR_SCHEDULER_SECRET`. Update existing entries rather than creating duplicate
   names. Vault protects storage, but pg_net temporarily queues request headers;
   restrict database and Vault access to trusted administrators.
   Run `supabase/shared-email-scheduler.sql` in SQL Editor. It validates Vault
   configuration, removes both old named jobs and creates exactly one named
   `ajr-shared-email-reminders` every five minutes. Confirm pg_cron and pg_net
   are supported and enabled on your plan. To stop it:
   `select cron.unschedule('ajr-shared-email-reminders');`
7. Configure the signed Resend webhook
   `https://www.rajutraders.in/api/webhooks/resend` for delivery, failure,
   bounce, complaint and suppression events available in Resend. Verify
   signatures and actual receipts. Enable campaigns individually in Admin >
   Visitor Analytics or Admin > Abandoned Carts only after controlled testing.

## Verification

If the cart dashboard reports that recovery email is unavailable, its listed
settings are checked in the website's server environment, not the browser.
For local development set them in the untracked `.env.local` and restart the
server. For Vercel set them for the deployment environment and redeploy. The
Edge URL must belong to the same Supabase project, and the website's
`AJR_MAIL_SECRET` must match the Supabase Edge secret. Setting these values
only clears the website configuration warning; the function, Resend secrets,
database migration, scheduler, and webhook must also be deployed and verified.
Do not post secret values in chat.

Run local tests and the build:

```powershell
node --test .\scripts\test-cart-reminder.cjs .\scripts\test-product-reminders.cjs .\scripts\test-visitor-selections.cjs .\scripts\test-shared-email.cjs
npm run build
```

In a controlled environment with verified test inboxes and test accounts only,
verify unchecked signup and old product-only consent, Google sign-in, OTP,
checkout, payment, coupons and order confirmation. Opt in once, close the
browser, and test the 30-minute cart and two-hour product flows, actual images,
current product offer, links, sender, and signed unsubscribe. Verify cart updates
reset the timer; an empty cart, add-to-cart, purchase, opt-out or bounce blocks
the appropriate email; repeated runs and manual sends respect frequency limits.
Exercise both admin switches, quota thresholds, full-access Usage API failure,
explicit provider rejection, uncertain timeout, delivery webhook, recovered
cart and product revisit metrics. Avoid sending to real customers during tests.

Inspect Supabase Edge logs and admin heartbeat; a stale or failed heartbeat
does not prove a specific email was sent. Check both SQL job execution and HTTP
response, since a queued request is not successful delivery:

```sql
select jobid, status, return_message, start_time, end_time
from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'ajr-shared-email-reminders')
order by start_time desc limit 10;

select status_code, timed_out, error_msg, created
from net._http_response order by created desc limit 10;
```

Never blindly retry an `uncertain` send. Confirm cron, function, Resend
acceptance, webhook and real inbox delivery before declaring operation.
