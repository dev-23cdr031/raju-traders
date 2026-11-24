import 'server-only'

import { safeRecoveryBaseUrl } from '@/lib/abandoned-carts'
import { cartUnsubscribeSignature } from '@/lib/cart-reminder-token'
import { MarketingEmailRejectedError, sendMarketingEmail } from '@/lib/marketing-email'

export class CartRecoveryEmailRejectedError extends Error {}
export class CartRecoveryPreparationError extends Error {}

type EmailLine = { product?: { name?: string; image?: string; price?: number }; quantity?: number }
const escapeHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#039;')
const money = (value: number) => `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`

export async function sendCartRecoveryEmail({
  email, name, items = [], cartId,
}: { email: string; name: string; itemCount: number; items?: EmailLine[]; token: string; cartId: string }) {
  if (process.env.NOTIFICATIONS_EMAIL_ENABLED === 'false') throw new Error('Email notifications are disabled.')
  const origin = safeRecoveryBaseUrl()
  const cartUrl = `${origin}/?cart=1`
  const unsubscribe = `${origin}/api/cart/reminder-unsubscribe?id=${encodeURIComponent(cartId)}&signature=${cartUnsubscribeSignature(cartId)}`
  if (!items.length) throw new CartRecoveryPreparationError('The saved cart has no items.')
  const lines = items.map((line) => {
    const productName = String(line.product?.name || '').trim()
    const quantity = Number(line.quantity)
    const price = Number(line.product?.price)
    const rawImage = String(line.product?.image || '').trim()
    let image = ''
    if (rawImage.startsWith('/') && !rawImage.startsWith('//')) image = `${origin}${rawImage}`
    else {
      try {
        const url = new URL(rawImage)
        if (url.protocol === 'https:' && !url.username && !url.password) image = url.href
      } catch {}
    }
    if (!productName || !Number.isInteger(quantity) || quantity < 1 || !Number.isFinite(price) || price < 0 ||
      !image || new URL(image).pathname === '/nut-selection.png') {
      throw new CartRecoveryPreparationError('A saved cart item has an invalid name, image, price or quantity.')
    }
    return { productName, quantity, price, image }
  })
  const total = lines.reduce((sum, line) => sum + line.price * line.quantity, 0)
  const text = `Hello ${name || 'there'},

Looks like you left some wonderful products in your shopping cart. Complete your purchase whenever you're ready.

Your selected products are just a click away!

${lines.map((line) => `${line.productName.replace(/[\r\n]+/g, ' ')} × ${line.quantity} — ${money(line.price)} each`).join('\n')}
Total cart value: ${money(total)}

Complete your purchase: ${cartUrl}
Unsubscribe from cart reminders: ${unsubscribe}

Raju Traders`
  const products = lines.map((line) => `<tr><td style="padding:14px 0;border-bottom:1px solid #e8e3d3"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td width="82" valign="top"><img src="${escapeHtml(line.image)}" alt="${escapeHtml(line.productName)}" width="72" style="display:block;width:72px;height:auto;border:0"></td><td valign="top" style="padding-left:12px;color:#183b2c;font-size:15px;line-height:1.6"><strong>${escapeHtml(line.productName)}</strong><br>Quantity: ${line.quantity}<br>${escapeHtml(money(line.price))} each</td><td valign="top" align="right" style="color:#183b2c;font-size:14px;white-space:nowrap">${escapeHtml(money(line.price * line.quantity))}</td></tr></table></td></tr>`).join('')
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;background:#f4f2e9;font-family:Arial,Helvetica,sans-serif;color:#173b2e"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f2e9"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff"><tr><td align="center" style="background:#123d2e;padding:30px;border-bottom:4px solid #c9ab63"><img src="${escapeHtml(origin)}/ajr-logo.png" alt="Raju Traders" width="110" style="display:block;width:110px;height:auto"><p style="color:#e2c880;letter-spacing:3px;font-size:12px;margin:12px 0 0">RAJU TRADERS</p></td></tr><tr><td style="padding:32px 24px"><h1 style="font-family:Georgia,serif;font-weight:normal;font-size:30px;margin:0 0 24px">Your Cart Is Waiting for You!</h1><p>Hello ${escapeHtml(name || 'there')},</p><p style="line-height:1.7">Looks like you left some wonderful products in your shopping cart. Complete your purchase whenever you're ready.</p><p style="line-height:1.7">Your selected products are just a click away!</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${products}<tr><td align="right" style="padding:18px 0;font-weight:bold">Total cart value: ${escapeHtml(money(total))}</td></tr></table><a href="${escapeHtml(cartUrl)}" style="display:inline-block;background:#174c37;color:#fff;text-decoration:none;padding:15px 24px;font-size:12px;letter-spacing:1px">COMPLETE YOUR PURCHASE</a></td></tr><tr><td style="background:#123d2e;color:#f8f6ea;text-align:center;padding:24px;font-size:12px;line-height:1.8">Raju Traders<br><a href="${escapeHtml(origin)}" style="color:#e2c880">${escapeHtml(origin)}</a><br><a href="${escapeHtml(unsubscribe)}" style="color:#e2c880">Unsubscribe from cart reminders</a></td></tr></table></td></tr></table></body></html>`

  try {
    return await sendMarketingEmail({
      campaign: 'cart', id: cartId, to: email,
      subject: 'You Left Something Behind at Raju Traders!',
      text, html, unsubscribe,
    })
  } catch (error) {
    if (error instanceof MarketingEmailRejectedError) throw new CartRecoveryEmailRejectedError(error.message)
    throw error
  }
}
