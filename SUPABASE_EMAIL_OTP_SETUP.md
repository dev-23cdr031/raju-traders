# Supabase Email OTP Setup

## 1. Authentication settings

In Supabase Dashboard:

1. Open **Authentication > Providers > Email**.
2. Enable **Email**.
3. Enable **Confirm email**.
4. Set **Email OTP length** to `6` if your project exposes this setting.
5. Set **OTP Expiry** to `300` seconds (5 minutes).
6. Save the provider settings.

Supabase GoTrue must use email confirmation for signups. Password sign-in remains unchanged.

## 2. Confirm Signup template

Open **Authentication > Email Templates > Confirm signup**.

- Subject: `Your Raju Traders Verification Code`
- Replace the template body with [email-otp-confirm-signup.html](supabase/email-otp-confirm-signup.html).
- Keep exactly `{{ .Token }}` in the OTP position.
- Do not use `{{ .ConfirmationURL }}` or include a verification button.
- The plain-text reference is [email-otp-confirm-signup.txt](supabase/email-otp-confirm-signup.txt).

The HTML file is designed to be pasted directly into the Supabase template editor.

## 3. Resend custom SMTP

Open **Project Settings > Authentication > SMTP Settings**.

Use:

- Sender name: `Raju Traders`
- Sender email: `no-reply@rajutraders.in`
- Host: `smtp.resend.com`
- Port: `465`
- Minimum TLS version: `TLS 1.2`
- Username: `resend`
- Password: your Resend API key
- Secure: enabled

The API key belongs only in the Supabase dashboard and server-side `.env.local`. Never place it in `NEXT_PUBLIC_*` variables or browser code.

Supabase custom SMTP also requires the sender domain to be verified in Resend.

## 4. Resend domain and DNS

In Resend, add and verify `rajutraders.in`, then follow the exact DNS values displayed in the Resend domain setup. Do not copy sample DNS values without verifying them.

Use one SPF record for the domain. Typical Resend setup requires the existing SPF record to include `include:amazonses.com`, but Resend must display the exact record for the current account. Merge it into the existing TXT record if one exists; do not publish multiple SPF TXT records.

Add every DKIM DNS record Resend provides. Keep existing MX and website DNS records. Review DMARC such as:

```text
v=DMARC1; p=none; rua=mailto:dmarc@rajutraders.in
```

Move DMARC enforcement to `quarantine` or `reject` only after reviewing reports. Alignment is correct when the visible sender domain, return domain, and Resend authentication records align to `rajutraders.in`.

DNS changes are not automatically applied by this project and must be reviewed and published by the domain administrator.

## 5. DNS and inbox verification

After DNS propagation:

1. Verify the domain and DKIM status in Resend.
2. Send a registration OTP to Gmail and Outlook test accounts.
3. Inspect the original message headers for SPF, DKIM, and DMARC `PASS`.
4. Review Resend delivery logs for bounces, complaints, and rejections.
5. Start with a low mailbox volume and increase gradually.

Inbox placement cannot be guaranteed. Transactional content, domain reputation, sender history, mailbox filtering, and recipient behavior remain outside application control.
