# AJR shopping assistant

The assistant is not operational until the migration, environment settings,
deployment, and controlled tests are completed. It starts disabled.

## Privacy and limitations

Google's Gemini free-tier terms prohibit submitting sensitive, confidential,
or personal information and allow submitted content to be used to improve
Google's products. The assistant therefore sends only a fixed shopping action
and selected public catalog product IDs, names, and categories to Gemini.
It does not send typed customer messages, account identifiers, order details,
the customer's IP address, or conversation history. Gemini ranks public product
IDs; the website supplies actual names, images and prices from the catalog.
Free-text natural-language chat is not sent to Gemini; this is a deliberate
limitation, not a fully conversational AI. Gemini is not trained on the shop.

The database stores structured request metadata, keyed hashes of network
addresses and (for authenticated requests) account IDs, product IDs, statuses,
and conversation IDs, not customer message text.
Browser conversation history remains on that browser. Request records older
than 90 days are removed in bounded batches when requests are made, so a period
of inactivity can delay cleanup. Counts and conversation IDs represent requests,
not verified people. Product clicks and requests are not attributed purchases;
do not treat them as revenue.

Administrators may add and publish approved public FAQs in the assistant
dashboard. No shipping or return policy is invented or seeded. Published FAQ
responses are publicly cached for up to 90 seconds; do not put confidential
information in them. Contact customer support when no approved answer exists.

## Deployment

1. Back up the database and apply `supabase/ai-assistant.sql` in the Supabase
   SQL Editor. The singleton settings row defaults to disabled. Do not apply
   this migration to production without approval.
2. Obtain a Gemini Developer API key with access to `gemini-2.5-flash-lite`.
   Set server-only Vercel environment variables `GEMINI_API_KEY` and
   `AI_RATE_LIMIT_SECRET` (an independent random secret of at least 32
   characters). Never put these in client-side environment variables, source
   control, screenshots, or chat. Existing Supabase server environment
   variables are also required.
3. Keep the Google project on the free tier without paid billing. Local daily
   and monthly limits reduce usage but cannot determine the billing tier,
   account for other applications, or guarantee that Google won't charge a
   billing-enabled project. Check current model availability and quotas in
   Google AI Studio. No paid billing is enabled by this project.
4. Deploy the website and enable the assistant in the authorized admin
   dashboard after verification. Do not add a Vercel Cron job. The rate limiter
   limits both the network and authenticated account, trusts Vercel's
   `x-vercel-forwarded-for` header in production and fails
   closed if it is missing; another hosting environment needs an equivalent
   trusted proxy configuration. See [Vercel request headers](https://vercel.com/docs/headers/request-headers).

## Verification

Run `node --test .\scripts\test-ai-assistant.cjs .\scripts\test-shopping-assistant-client.cjs`
and `npm run build`.
Use synthetic requests and test accounts, never real customer data, to verify:

- The assistant is disabled before activation and is hidden on admin pages.
- Product data and budget filters match the live catalog, no restricted coupon
  is displayed, and cart changes require confirmation.
- Signed-in order requests show only the authenticated customer's orders.
- Customer-entered text, tokens, emails, and order data never reach Gemini.
- Missing keys, rate limits, provider errors, and exhausted configured quotas
  produce a clearly identified fallback without breaking the shop.
- Publish and unpublish a synthetic FAQ, then verify the public help endpoint
  and allow up to 90 seconds for its cache to refresh.
- Global, per-network and authenticated-account limits work across concurrent
  server instances.
- Admin endpoints reject non-admin requests; controls and metrics reflect saved
  records. Analytics don't claim an unverified conversion or revenue.
- Customer pages, authentication, payment, checkout, notifications, and both
  reminder automations continue to work.
