# AJR cart-recovery reminders

AJR sends one recovery-only email only when a signed-in customer has actively opted in on the cart page and leaves a non-empty cart inactive for the configured threshold (30 minutes by default). The email has no discount or marketing content and includes an unsubscribe link.

## One-time setup

1. In the Supabase project SQL Editor, run supabase/abandoned-carts.sql. This creates the protected tracking table, recovery helpers, and the atomic cron-claim function.
2. Configure these production environment variables in the hosting provider:

   - NEXT_PUBLIC_APP_URL — the public HTTPS AJR site URL.
   - ABANDONED_CART_MINUTES=30 — accepts whole numbers from 10 to 1440.
   - SUPABASE_SERVICE_ROLE_KEY — server-only; never expose it in the browser.
   - RESEND_API_KEY and RESEND_FROM_EMAIL — a verified Resend sender.
   - NOTIFICATIONS_EMAIL_ENABLED=true.
   - CRON_SECRET — a long, randomly generated secret. Vercel uses it to authorize the scheduled request.
   - SUPPORT_EMAIL — optional reply/help address shown in the reminder.
3. Deploy the app. vercel.json invokes /api/cron/abandoned-carts every 30 minutes. Use a Vercel plan that supports this schedule.

## Safety controls

- The cron route rejects requests without Authorization: Bearer $CRON_SECRET.
- Every batch is claimed atomically in Supabase before any email is sent, preventing overlapping runs from sending duplicates.
- The recipient address is re-checked against the verified Supabase account before dispatch.
- Recovery links are single-use, expire after 14 days, and only a SHA-256 hash is stored.
- A provider rejection can be retried later; an uncertain provider outcome remains locked for review so AJR never risks a duplicate email.
- No real email is sent unless Resend is configured and the customer has opted in.
