import 'server-only'

import { safeRecoveryBaseUrl } from '@/lib/abandoned-carts'

export class CartRecoveryEmailRejectedError extends Error {}

const escapeHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#039;')

export async function sendCartRecoveryEmail({
  email, name, itemCount, token,
}: { email: string; name: string; itemCount: number; token: string }) {
  if (process.env.NOTIFICATIONS_EMAIL_ENABLED === 'false') {
    throw new Error('Email notifications are disabled by NOTIFICATIONS_EMAIL_ENABLED.')
  }
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) throw new Error('RESEND_API_KEY is not configured.')

  const appUrl = safeRecoveryBaseUrl()
  const recoveryUrl = `${appUrl}/cart/recover?token=${encodeURIComponent(token)}`
  const unsubscribeUrl = `${recoveryUrl}&action=unsubscribe`
  const greeting = escapeHtml(name || 'there')
  const safeRecoveryUrl = escapeHtml(recoveryUrl)
  const safeUnsubscribeUrl = escapeHtml(unsubscribeUrl)
  const supportEmail = String(process.env.SUPPORT_EMAIL || '').trim()
  const supportLine = supportEmail
    ? `Need help? <a href="mailto:${escapeHtml(supportEmail)}" style="color:#506a55;text-decoration:underline;">Contact AJR support</a>.`
    : 'Need help? Please reply to this email and our AJR team will be glad to help.'
  const count = Math.max(1, Math.floor(itemCount))
  const itemLabel = count === 1 ? 'item' : 'items'
  const text = `Hello ${name || 'there'},

Your AJR selection is still saved. Your bag has ${count} ${itemLabel} waiting for you.

Return to my bag: ${recoveryUrl}

This is a one-time service reminder you asked us to send. Your private recovery link expires in 14 days and works only after you sign in to this AJR account.

Stop cart reminders: ${unsubscribeUrl}${supportEmail ? `\n\nNeed help? ${supportEmail}` : ''}`

  const html = `<!doctype html>
<html lang="en"><head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="x-apple-disable-message-reformatting" />
<!--[if mso]><style>table { border-collapse:collapse; }.serif { font-family:Georgia,'Times New Roman',serif!important; }</style><![endif]-->
</head><body style="margin:0;padding:0;background:#f3f2ea;color:#18362a;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
<span style="display:none!important;font-size:1px;color:#f3f2ea;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">Your AJR selection is still saved and ready when you are.</span>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f3f2ea;"><tr><td align="center" style="padding:32px 12px 40px;">
<!--[if mso]><table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background:#fffef9;border:1px solid #d9dfd3;border-radius:18px;overflow:hidden;">
<tr><td style="padding:0;background:#123c2a;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td style="padding:24px 32px 20px;border-bottom:4px solid #cae66c;"><table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
<td valign="middle" style="padding-right:14px;"><img src="https://rajutraders.in/ajr-logo.png" width="58" height="58" alt="AJR Nature — Always Just Royal" style="display:block;width:58px;height:58px;border:0;border-radius:8px;background:#fffef9;object-fit:contain;" /></td>
<td valign="middle"><p style="margin:0;color:#fffef9;font-family:Georgia,'Times New Roman',serif;font-size:27px;font-weight:700;line-height:1;letter-spacing:-.4px;">AJR Nature</p><p style="margin:8px 0 0;color:#dceab4;font-size:10px;font-weight:700;letter-spacing:2px;line-height:1.2;text-transform:uppercase;">Always Just Royal</p></td>
</tr></table></td></tr></table></td></tr>
<tr><td style="padding:34px 32px 12px;"><p style="margin:0 0 14px;color:#557159;font-size:12px;font-weight:700;letter-spacing:1.3px;line-height:1.2;text-transform:uppercase;">A small note from AJR</p><h1 class="serif" style="margin:0;color:#163628;font-family:Georgia,'Times New Roman',serif;font-size:34px;font-weight:400;line-height:1.15;letter-spacing:-.8px;">Your AJR selection is still saved.</h1><p style="margin:20px 0 0;color:#344b3d;font-size:16px;line-height:1.65;">Hello ${greeting},</p><p style="margin:10px 0 0;color:#51675a;font-size:16px;line-height:1.65;">Your bag is exactly where you left it. Whenever the moment feels right, return and continue with your selection.</p></td></tr>
<tr><td style="padding:20px 32px 8px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#edf3e8;border:1px solid #d7e2d1;border-radius:10px;"><tr><td style="padding:18px 20px;border-left:4px solid #9abd58;"><p style="margin:0;color:#426347;font-size:11px;font-weight:700;letter-spacing:1.2px;line-height:1.2;text-transform:uppercase;">Saved in your bag</p><p class="serif" style="margin:8px 0 0;color:#183b2a;font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.25;">${count} saved ${itemLabel} in your AJR bag</p></td></tr></table></td></tr>
<tr><td style="padding:24px 32px 8px;"><!--[if mso]><table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td style="background:#143d2b;padding:14px 23px;"><a href="${safeRecoveryUrl}" style="color:#fffef9;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;text-decoration:none;">Return to my bag&nbsp;&nbsp;→</a></td></tr></table><![endif]--><!--[if !mso]><!--><a href="${safeRecoveryUrl}" style="display:inline-block;background:#143d2b;border:1px solid #143d2b;border-radius:6px;color:#fffef9;font-size:15px;font-weight:700;line-height:1;padding:15px 23px;text-decoration:none;">Return to my bag&nbsp;&nbsp;→</a><!--<![endif]--></td></tr>
<tr><td style="padding:12px 32px 32px;"><p style="margin:0;color:#6c7c6d;font-size:13px;line-height:1.65;">For your privacy, this is a private recovery link. It expires in 14 days and works only after you sign in to the AJR account that received this email.</p></td></tr>
<tr><td style="padding:22px 32px 28px;background:#f7f7f0;border-top:1px solid #e0e5da;"><p style="margin:0 0 8px;color:#4e6654;font-size:12px;line-height:1.65;">You are receiving this one-time service reminder because you chose to receive an email if this AJR bag was left behind. It is not a promotional email.</p><p style="margin:0;color:#4e6654;font-size:12px;line-height:1.65;">${supportLine}</p><p style="margin:16px 0 0;"><a href="${safeUnsubscribeUrl}" style="color:#315941;font-size:12px;font-weight:700;line-height:1.5;text-decoration:underline;">Stop cart reminders</a><span style="color:#9aa59a;font-size:12px;">&nbsp;&nbsp;•&nbsp;&nbsp;AJR Nature</span></p></td></tr>
</table><!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL || process.env.EMAIL_FROM || 'AJR <onboarding@resend.dev>',
      to: [email],
      subject: 'Your AJR selection is still saved',
      text,
      html,
    }),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new CartRecoveryEmailRejectedError(String(result?.message || result?.name || `Resend request failed (${response.status})`))
  }
  return { id: String(result?.id || '') }
}
