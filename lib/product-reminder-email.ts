import { createHmac, timingSafeEqual } from 'node:crypto'

const ORIGIN = 'https://www.rajutraders.in'
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character] || character)

export function currentProductOffer(product: {
  price: unknown; type: unknown; image: unknown; varieties: unknown; pack_sizes: unknown
}) {
  const weights = ['25 g', '50 g', '100 g', '250 g', '500 g', '1 kg'] as const
  const fractions = { '25 g': 0.025, '50 g': 0.05, '100 g': 0.1, '250 g': 0.25, '500 g': 0.5, '1 kg': 1 }
  const packSizes: unknown[] = Array.isArray(product.pack_sizes) ? product.pack_sizes : []
  const offered = weights.filter((weight) => packSizes.includes(weight))
  const weight = offered[0] || (product.type === 'Spices' ? '50 g' : '250 g')
  const varieties = Array.isArray(product.varieties) ? product.varieties.filter((item) =>
    item && typeof item === 'object' && typeof item.name === 'string' && item.name.trim() &&
    Number.isFinite(Number(item.price)) && Number(item.price) > 0) : []
  const available = varieties.find((item) => item.active !== false && (item.stock == null || Number(item.stock) > 0))
  if (varieties.length && !available) throw new Error('No product variety is available.')
  const price = available ? Math.round(Number(available.price) * fractions[weight])
    : Number(product.price) * fractions[weight] * 4
  if (!Number.isFinite(price) || price < 0) throw new Error('Invalid product price.')
  return {
    price,
    weight,
    image: String(available?.image || product.image || ''),
    variety: available ? String(available.name) : '',
  }
}

export function reminderSignature(id: string, purpose: 'click' | 'unsubscribe') {
  const secret = process.env.PRODUCT_REMINDER_TOKEN_SECRET || ''
  if (secret.length < 32) throw new Error('PRODUCT_REMINDER_TOKEN_SECRET must contain at least 32 characters.')
  return createHmac('sha256', secret).update(`${purpose}:${id}`).digest('hex')
}

export function validReminderSignature(id: string, purpose: 'click' | 'unsubscribe', signature: string) {
  if (!/^[0-9a-f]{64}$/.test(signature)) return false
  const expected = reminderSignature(id, purpose)
  return timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))
}

export function productReminderEmail(input: {
  id: string
  customerName: string
  productName: string
  productImage: string
  description: string
  price: number
  weight: string
  variety: string
}) {
  const click = `${ORIGIN}/api/product-reminders/click?id=${encodeURIComponent(input.id)}&signature=${reminderSignature(input.id, 'click')}`
  const unsubscribe = `${ORIGIN}/api/product-reminders/unsubscribe?id=${encodeURIComponent(input.id)}&signature=${reminderSignature(input.id, 'unsubscribe')}`
  let image = ''
  if (input.productImage.startsWith('/') && !input.productImage.startsWith('//')) image = `${ORIGIN}${input.productImage}`
  else {
    try {
      const parsed = new URL(input.productImage)
      if (parsed.protocol === 'https:' && !parsed.username && !parsed.password) image = parsed.href
    } catch {}
  }
  if (!image || input.productImage === '/nut-selection.png') throw new Error('A product-specific image is required.')
  const name = input.customerName.trim() || 'there'
  const price = `₹${input.price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
  const offer = `${input.variety ? `${input.variety} · ` : ''}${input.weight}: ${price}`
  const text = `Hi ${name},\n\nWe noticed you recently explored something at Raju Traders.\n\nSometimes the best finds deserve a second look.\n\nHere's the product you viewed:\n${input.productName}\n${offer}${input.description ? `\n${input.description}` : ''}\n\nView product: ${click}\n\nUnsubscribe: ${unsubscribe}\n\nRaju Traders\n${ORIGIN}`
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f4f2e9;font-family:Arial,sans-serif;color:#173b2e"><div style="display:none;max-height:0;overflow:hidden">Your recently viewed product is just a click away.</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f2e9"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff"><tr><td align="center" style="background:#123d2e;padding:30px"><img src="${ORIGIN}/ajr-logo.png" alt="Raju Traders" width="110" style="display:block;max-width:110px;height:auto"><div style="color:#d8bf7b;font-size:12px;letter-spacing:3px;padding-top:12px">RAJU TRADERS</div></td></tr><tr><td style="padding:36px 28px"><p style="color:#a78942;letter-spacing:2px;font-size:11px">A SECOND LOOK</p><h1 style="font-family:Georgia,serif;font-size:30px;font-weight:normal;margin:0 0 24px">Something Caught Your Eye!</h1><p style="line-height:1.7">Hi ${escapeHtml(name)},</p><p style="line-height:1.7">We noticed you recently explored something at Raju Traders.</p><p style="line-height:1.7">Sometimes the best finds deserve a second look.</p><p style="line-height:1.7">Here's the product you viewed.</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7f6ef"><tr><td align="center" style="padding:24px">${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(input.productName)}" width="220" style="display:block;max-width:100%;height:auto">` : ''}<h2 style="font-family:Georgia,serif;font-weight:normal;font-size:24px;margin:18px 0 8px">${escapeHtml(input.productName)}</h2><p style="color:#6b5b2f">${escapeHtml(offer)}</p>${input.description ? `<p style="font-size:14px;line-height:1.6">${escapeHtml(input.description)}</p>` : ''}<a href="${escapeHtml(click)}" style="display:inline-block;background:#174c37;color:#ffffff;text-decoration:none;padding:15px 28px;font-size:12px;letter-spacing:1.5px">VIEW PRODUCT</a></td></tr></table></td></tr><tr><td align="center" style="background:#123d2e;color:#f8f6ea;padding:24px;font-size:12px;line-height:1.7">Raju Traders<br><a style="color:#dfc989" href="${ORIGIN}">${ORIGIN}</a><br><a style="color:#dfc989" href="${escapeHtml(unsubscribe)}">Unsubscribe from product reminders</a></td></tr></table></td></tr></table></body></html>`
  return { html, text, unsubscribe, subject: 'Still Thinking It Over? Take Another Look' }
}
