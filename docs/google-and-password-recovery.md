# Google sign-in and password recovery

These features require deployment of the app **and** the following dashboard configuration. The recovery template is separate from the existing signup OTP template; do not change the latter.

## Supabase

1. In Authentication > URL Configuration, set the Site URL to `https://www.rajutraders.in` (the current canonical hostname; `rajutraders.in` redirects to it). Add these exact redirect URLs:
   - `https://www.rajutraders.in/auth/callback`
   - `https://www.rajutraders.in/reset-password`
   - `https://rajutraders.in/auth/callback`
   - `https://rajutraders.in/reset-password`
   - `http://127.0.0.1:3000/auth/callback`
   - `http://127.0.0.1:3000/reset-password`
   Add equivalent `localhost` URLs only if you use that hostname. Use the same hostname when starting and completing OAuth because the PKCE verifier is browser-origin scoped.
2. In Authentication > Sign In / Providers > Google, confirm the callback URL shown by **this project's dashboard** is `https://kaxcerzvwypplynqzspy.supabase.co/auth/v1/callback` (provided by the project owner). Enable Google and enter the Google web client ID and secret there. Never put the secret in the app or `NEXT_PUBLIC_*` environment variables.
3. In Authentication > Email Templates > Reset Password, set the subject to `Reset Your Raju Traders Password` and paste `supabase/email-recovery.html`. Save it separately from Confirm Signup. The template uses Supabase's `RedirectTo` and `TokenHash` variables; the reset page verifies the hash as a recovery token. It must not be replaced with a signup OTP or a generic confirmation template.
4. In Authentication > SMTP Settings, verify custom SMTP host `smtp.resend.com`, port `465`, username `resend`, sender `no-reply@rajutraders.in`, and the Resend API key as the SMTP password. Keep the key secret. Confirm sending is enabled and set suitable Auth email and verification rate limits under Authentication > Rate Limits. Supabase enforces these limits independently of the website.
5. In Resend and DNS, verify the sender domain and its current SPF and DKIM records. Publish a valid DMARC policy after checking existing records; avoid conflicting SPF records. Disable click tracking for recovery emails because link rewriting can expose or alter single-use recovery links. Check bounces and spam complaints; inbox placement cannot be guaranteed.
6. Check the project's password policy, secure password change setting, email token expiry, SMTP and email rate limits. Supabase enforces the authoritative policy; the UI's six-character minimum is the existing application's minimum, not a substitute for stricter project policy.

## Google Cloud

1. In Google Auth Platform, configure Branding with the Raju Traders name, support contact, domain, and published privacy policy and terms. Select the appropriate Audience (External for public customers), add test users while in testing, and complete publishing/verification as required.
2. Under Data Access, use `openid`, `email`, and `profile` scopes. Create a **Web application** OAuth client under Clients.
3. Add `https://www.rajutraders.in` and `https://rajutraders.in` as Authorized JavaScript origins. For local testing add `http://127.0.0.1:3000` (and `http://localhost:3000` only if used). Use a separate development client/project where practical.
4. Under Authorized redirect URIs, add `https://kaxcerzvwypplynqzspy.supabase.co/auth/v1/callback`, after confirming it matches the Google provider dashboard. This is the Supabase callback, **not** the application's `/auth/callback`. Enter the resulting client ID and secret in Supabase's Google provider settings.

## Operation and verification

The browser uses Supabase PKCE for Google OAuth; the Supabase client verifies the code with the verifier it generated and persists the resulting session. The app uses Supabase Auth user metadata as the customer profile, keyed by Auth user ID, rather than inserting a second profile. Supabase handles automatic identity linking for eligible matching verified emails; do not manually merge accounts by email. Existing carts and orders remain keyed by that user ID.

Recovery uses a separate in-memory Supabase client. A valid, unexpired, unused recovery token must be verified before that client can change a password; a normal signed-in session is not sufficient. The link can be opened on a different device from the request. Reloading the reset form after the token has been consumed requires a new email.

After configuration, verify real new and existing Google accounts, cancellation, bad provider configuration, refresh persistence, guest-cart merging and logout. Request a recovery email, inspect its link and sender, reset a password, sign in with it, and reject expired, invalid and reused links. Finally verify the unchanged six-digit signup OTP flow. Do not use real customer accounts for destructive tests.
