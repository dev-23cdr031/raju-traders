# Notification automation setup

## Database

Run these SQL files in the Supabase SQL Editor, in order:

1. `supabase/customer-features.sql`
2. `supabase/abandoned-carts.sql`
3. `supabase/notification-automation.sql`

The final migration creates the service-role-only event ledger used for idempotency, delivery status, and the Notification Automation admin page.
Order email dispatch requires this migration: if the ledger or claim function is missing, checkout still succeeds but the email is not sent. Check server logs and the admin notification ledger for errors. Applying the migration does not automatically send confirmations for previously placed orders; verify delivery status before using the admin resend action to avoid duplicates.

## Environment secrets

Set these in the hosting provider only—never in browser variables:

- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and `RESEND_WEBHOOK_SECRET`
- `META_WHATSAPP_ACCESS_TOKEN`, `META_WHATSAPP_PHONE_NUMBER_ID`, `META_APP_SECRET`, and `META_WEBHOOK_VERIFY_TOKEN`
- `META_WHATSAPP_ORDER_TEMPLATE`: approved Utility template with five body parameters: customer name, order ID, total, product summary, tracking URL.
- `META_WHATSAPP_ABANDONED_CART_TEMPLATE`: approved Marketing template; send only when separate marketing consent has been recorded.
- `ADMIN_NOTIFICATION_EMAIL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, and `NEXT_PUBLIC_APP_URL`
- `ABANDONED_CART_MINUTES=30`

Order confirmations use the server's `RESEND_API_KEY` and a sender on a verified Resend domain. Signup OTP messages are sent separately by Supabase Auth using its own SMTP settings. Check the Supabase Auth logs, custom SMTP credentials, sender, and signup email template when OTP delivery fails; configure the template to include `{{ .Token }}` for the six-digit code. Do not copy SMTP credentials into frontend variables or logs.

Set `NEXT_PUBLIC_APP_URL=https://www.rajutraders.in` in Vercel and redeploy so order-email links and relative product images use the publicly accessible website. If it is missing or points to localhost, order emails fall back to the public Raju Traders site and log a warning. Absolute product-image URLs must themselves be publicly accessible over HTTPS; some email clients also block remote images until the recipient permits them.

## Provider webhooks

Configure these HTTPS callback URLs:

- Meta: `/api/webhooks/meta-whatsapp`. Use the verify token above and subscribe to message statuses.
- Resend: `/api/webhooks/resend`. Copy the generated signing secret to `RESEND_WEBHOOK_SECRET`.

Both routes reject unsigned requests. Delivery receipts update the event ledger; provider tokens are never returned to the browser.

## Safe verification checklist

1. With provider flags disabled, create a COD order: checkout must succeed and an event is recorded after the migration is active.
2. Confirm the same idempotency key does not produce a second event.
3. Create an unpaid online order: no confirmation event should dispatch until the payment provider marks it paid.
4. Use provider sandbox/test recipients to confirm order email, admin email, and Utility WhatsApp variable order.
5. Create an opted-in signed-in cart, wait 30 minutes, then verify exactly one recovery event/link after the next Supabase cron run. Purchase before the cron runs and confirm no reminder is sent. Each five-minute run processes at most 20 carts. Follow [the scheduler setup](./abandoned-cart-reminders.md); it is not active until deployed and verified.
6. Verify signed Resend and Meta webhook callbacks update delivery states; unsigned requests must return 404.
