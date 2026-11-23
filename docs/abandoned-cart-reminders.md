# AJR cart-recovery reminders

AJR sends one recovery-only email only when a signed-in customer has actively opted in on the cart page and leaves a non-empty cart inactive for the configured threshold (30 minutes by default). The email has no discount or marketing content and includes an unsubscribe link.

## Manual email

In Admin > Abandoned Carts, open **Details / email** for a cart and select **Send recovery email**. The server verifies admin access, the customer's verified email and cart-reminder consent, the inactivity threshold, cart state, and matching confirmed purchases. The branded email includes the saved items and a private recovery link. A previously sent or uncertain reminder is blocked, including when a scheduled attempt has already claimed the cart. Resend must be configured; the action reports provider acceptance, not confirmed inbox delivery.

## Scheduler setup

The Supabase scheduler calls a small Edge Function every five minutes. That function authenticates the scheduler and calls the existing protected website endpoint; the endpoint retains the existing Resend, order, consent, and duplicate-prevention logic. Nothing needs to remain open in the customer's browser. A cart becomes eligible after 30 minutes and is normally checked within the next five minutes; outages, queues, provider delays, or a backlog can make delivery later. Each run processes at most 20 carts.

**These files do not activate the job.** Creating the SQL job starts real scheduled requests and can send real emails to eligible customers. Coordinate the cutover and use controlled test accounts.

1. In the Supabase SQL Editor for the correct project, apply `supabase/customer-features.sql`, `supabase/abandoned-carts.sql`, then `supabase/notification-automation.sql` if they have not already been applied.
2. In Vercel project settings, set `ABANDONED_CART_MINUTES=30` (an existing explicit value such as `60` overrides the new default). Also configure `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, server-only `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL=https://www.rajutraders.in`, `RESEND_API_KEY`, verified `RESEND_FROM_EMAIL`, `NOTIFICATIONS_EMAIL_ENABLED=true`, and a strong random `CRON_SECRET` of at least 32 characters. `SUPPORT_EMAIL` is optional. Redeploy after changing environment variables.
3. Deploy the website changes, including `vercel.json` with no cron entries. Verify the old Vercel cron is absent in Vercel's Cron Jobs settings before enabling the Supabase job; this avoids two schedulers running at once. The endpoint must be reachable at `https://www.rajutraders.in/api/cron/abandoned-carts` without a redirect.
4. Generate a second, independent random secret of at least 32 characters for the scheduler. In Supabase Dashboard > Edge Functions > Secrets, set:
   - `AJR_SCHEDULER_SECRET`: the new scheduler secret.
   - `AJR_CRON_SECRET`: exactly the same value as Vercel's `CRON_SECRET`.
   - `AJR_SITE_ORIGIN`: `https://www.rajutraders.in` (HTTPS origin only, no path or trailing redirect).

   Never paste secrets into source files, commits, tickets, or chat. Save them through the dashboards, not command-line arguments.
5. From the project root, authenticate the Supabase CLI and deploy the function:

   ```powershell
   npx supabase login
   npx supabase functions deploy abandoned-cart-scheduler --project-ref kaxcerzvwypplynqzspy --no-verify-jwt
   ```

   `--no-verify-jwt` is required because the function authenticates with its own separate `x-ajr-scheduler-secret`, not a user JWT. Do not deploy a version without that authentication check.
6. In Supabase Dashboard > Database > Vault, create two named secrets:
   - `ajr_scheduler_edge_url`: `https://kaxcerzvwypplynqzspy.supabase.co/functions/v1/abandoned-cart-scheduler`.
   - `ajr_scheduler_secret`: the exact value of Edge Function secret `AJR_SCHEDULER_SECRET`.

   Vault encrypts stored values, but pg_net temporarily puts request headers, including the scheduler secret, in its database queue. Restrict database login and Vault access to trusted administrators; see [Supabase's pg_net security note](https://supabase.com/kb/troubleshooting/database-roles-can-read-request-headers-queued-by-pg_net-ad6357). Do not use the Supabase service-role key as the scheduler secret.
7. In Supabase > SQL Editor, run `supabase/abandoned-cart-scheduler.sql`. It validates the Vault entries, enables `pg_cron` and `pg_net`, and creates or updates the named five-minute job. Supabase > Integrations > Cron should show `ajr-abandoned-cart-reminders`. To stop it, run `select cron.unschedule('ajr-abandoned-cart-reminders');` in SQL Editor.
8. Test the function URL without the scheduler secret: it must return 401 and never invoke the website. In Supabase > Edge Functions > abandoned-cart-scheduler > Logs, check for successful invocations and errors. In SQL Editor, inspect job executions with:

   ```sql
   select jobid, status, return_message, start_time, end_time
   from cron.job_run_details
   where jobid = (select jobid from cron.job where jobname = 'ajr-abandoned-cart-reminders')
   order by start_time desc limit 10;

   select status_code, timed_out, error_msg, created
   from net._http_response
   order by created desc limit 10;
   ```

   A successful cron SQL execution only means pg_net queued a request; verify the Edge Function logs and HTTP response too. The pg_net list can include other jobs.
9. With an opted-in test customer and a verified inbox, leave a non-empty cart unchanged for 30 minutes. Confirm one email after a scheduled run, no second email on another run, and no reminder for a completed purchase or revoked consent. Verify the unsubscribe link. Test without a browser open. Do not run these tests against real customer carts. Check Resend delivery logs for the controlled recipient.

Supabase and Resend free tiers have limits, and an inactive free Supabase project can pause; monitor job and delivery failures. Vercel Hobby's terms restrict commercial use, so verify your hosting plan is appropriate for a live store.

## Safety controls

- The cron route rejects requests without Authorization: Bearer $CRON_SECRET.
- Every batch is claimed atomically in Supabase before any email is sent, preventing overlapping runs from sending duplicates.
- The recipient address is re-checked against the verified Supabase account before dispatch.
- The endpoint checks for a confirmed matching order before preparing a reminder and fails closed if that check fails. As with any external email delivery, a purchase or opt-out racing after the final check cannot be atomically recalled once the provider accepts the email.
- Recovery links are single-use, expire after 14 days, and only a SHA-256 hash is stored.
- A provider rejection can be retried later; an uncertain provider outcome remains locked for review so AJR never risks a duplicate email.
- No real email is sent unless Resend is configured and the customer has opted in.
