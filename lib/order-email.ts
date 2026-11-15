import 'server-only'

type OrderLine = {
  name?: string
  type?: string
  variety?: string
  selectedWeight?: string
  image?: string
  price?: number
  quantity?: number
}

type OrderForEmail = {
  id: string
  order_number: string
  customer_name: string
  email: string
  address: string
  items: OrderLine[]
  subtotal: number
  shipping: number
  total: number
  payment_method?: string
  payment_status?: string
}

const escapeHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;')

const formatMoney = (value: unknown) => new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
}).format(Number(value) || 0)

const absoluteUrl = (value: string, baseUrl: string) => {
  if (!value) return ''
  if (/^https?:\/\//i.test(value)) return value
  return `${baseUrl.replace(/\/$/, '')}/${value.replace(/^\//, '')}`
}

function orderEmailHtml(order: OrderForEmail, appUrl: string) {
  const customerName = escapeHtml(order.customer_name || 'there')
  const orderNumber = escapeHtml(order.order_number)
  const paymentMethod = escapeHtml(order.payment_method || 'Cash on delivery')
  const paymentStatus = escapeHtml(order.payment_status || 'Pending')
  const items = Array.isArray(order.items) ? order.items : []
  const productRows = items.map((item) => {
    const image = absoluteUrl(String(item.image || '/ajr-logo.png'), appUrl)
    const detail = [item.variety, item.selectedWeight, item.type].filter(Boolean).map(escapeHtml).join(' · ')
    const quantity = Math.max(1, Number(item.quantity) || 1)
    const price = Number(item.price) || 0
    return `
      <tr>
        <td style="padding:16px 0;border-bottom:1px solid #e7ebe2;width:68px;vertical-align:top">
          <img src="${escapeHtml(image)}" width="56" height="56" alt="${escapeHtml(item.name)}" style="display:block;width:56px;height:56px;object-fit:cover;border-radius:10px;background:#edf2e9" />
        </td>
        <td style="padding:16px 12px;border-bottom:1px solid #e7ebe2;vertical-align:top">
          <p style="margin:0;color:#1b3d31;font-size:14px;font-weight:700;line-height:1.35">${escapeHtml(item.name)}</p>
          ${detail ? `<p style="margin:4px 0 0;color:#6f7d70;font-size:11px;line-height:1.4">${detail}</p>` : ''}
          <p style="margin:5px 0 0;color:#6f7d70;font-size:11px">Quantity: ${quantity}</p>
        </td>
        <td style="padding:16px 0;border-bottom:1px solid #e7ebe2;vertical-align:top;text-align:right;color:#1b3d31;font-size:13px;font-weight:700;white-space:nowrap">${escapeHtml(formatMoney(price * quantity))}</td>
      </tr>`
  }).join('')

  const logo = absoluteUrl('/ajr-logo.png', appUrl)
  const trackingUrl = `${appUrl.replace(/\/$/, '')}/my-orders`
  const supportEmail = escapeHtml(process.env.SUPPORT_EMAIL || 'support@ajr.com')
  const supportPhone = escapeHtml(process.env.SUPPORT_PHONE || '')

  return `<!doctype html>
<html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#f3f5ef;color:#203c31;font-family:Arial,Helvetica,sans-serif">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">Your AJR order ${orderNumber} has been received.</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f3f5ef;padding:30px 12px"><tr><td align="center">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;background:#fffefa;border-radius:18px;overflow:hidden;border:1px solid #e1e8dd">
      <tr><td style="background:#173c31;padding:28px 34px 30px;text-align:center">
        <img src="${escapeHtml(logo)}" width="54" height="54" alt="AJR" style="display:inline-block;width:54px;height:54px;object-fit:contain;border-radius:12px;background:#f7f9ee" />
        <p style="margin:12px 0 0;color:#d9e9b6;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase">Always Just Royal</p>
        <h1 style="margin:10px 0 0;color:#fffef7;font-family:Georgia,'Times New Roman',serif;font-size:30px;font-weight:400;line-height:1.15">Thank you for your order</h1>
      </td></tr>
      <tr><td style="padding:34px">
        <p style="margin:0 0 10px;font-size:16px;line-height:1.5">Hello ${customerName},</p>
        <p style="margin:0;color:#657467;font-size:14px;line-height:1.65">We have received your order and are preparing it with care. We will keep you updated as it moves toward you.</p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0;background:#edf3e7;border:1px solid #dce7d5;border-radius:12px"><tr>
          <td style="padding:16px 18px"><p style="margin:0;color:#64755f;font-size:10px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase">Order number</p><p style="margin:5px 0 0;color:#1b3d31;font-size:15px;font-weight:700">${orderNumber}</p></td>
          <td style="padding:16px 18px;text-align:right"><p style="margin:0;color:#64755f;font-size:10px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase">Order total</p><p style="margin:5px 0 0;color:#1b3d31;font-size:18px;font-weight:700">${escapeHtml(formatMoney(order.total))}</p></td>
        </tr></table>
        <h2 style="margin:0 0 4px;color:#1b3d31;font-family:Georgia,'Times New Roman',serif;font-size:23px;font-weight:400">Your selection</h2>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${productRows}</table>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:18px">
          <tr><td style="padding:5px 0;color:#6a786b;font-size:13px">Subtotal</td><td style="padding:5px 0;text-align:right;color:#314c3d;font-size:13px">${escapeHtml(formatMoney(order.subtotal))}</td></tr>
          <tr><td style="padding:5px 0;color:#6a786b;font-size:13px">Delivery</td><td style="padding:5px 0;text-align:right;color:#314c3d;font-size:13px">${escapeHtml(Number(order.shipping) ? formatMoney(order.shipping) : 'Complimentary')}</td></tr>
          <tr><td style="padding:13px 0 0;border-top:1px solid #dfe6d9;color:#193c30;font-size:15px;font-weight:700">Total</td><td style="padding:13px 0 0;border-top:1px solid #dfe6d9;text-align:right;color:#193c30;font-size:17px;font-weight:700">${escapeHtml(formatMoney(order.total))}</td></tr>
        </table>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:25px"><tr><td style="padding:17px 18px;background:#fafaf5;border-left:3px solid #a9bf7d">
          <p style="margin:0 0 6px;color:#63755f;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase">Payment & delivery</p>
          <p style="margin:0;color:#344e3e;font-size:13px;line-height:1.65">${paymentMethod} · ${paymentStatus}<br/>${escapeHtml(order.address).replace(/\n/g, '<br/>')}</p>
        </td></tr></table>
        <p style="margin:28px 0 0;text-align:center"><a href="${escapeHtml(trackingUrl)}" style="display:inline-block;background:#244b3b;border-radius:7px;padding:13px 21px;color:#fffefa;font-size:12px;font-weight:700;text-decoration:none">View your order</a></p>
        <p style="margin:27px 0 0;color:#6c796d;font-size:12px;line-height:1.65;text-align:center">Need help? Reply to this email${supportPhone ? ` or call ${supportPhone}` : ''}.<br/>Thank you for choosing AJR.</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`
}

function orderEmailText(order: OrderForEmail, appUrl: string) {
  const lines = (order.items || []).map((item) => {
    const descriptor = [item.name, item.variety, item.selectedWeight].filter(Boolean).join(' · ')
    return `- ${descriptor} × ${Math.max(1, Number(item.quantity) || 1)} — ${formatMoney((Number(item.price) || 0) * Math.max(1, Number(item.quantity) || 1))}`
  })
  return `Hello ${order.customer_name || 'there'},\n\nThank you for shopping with AJR. We have received order ${order.order_number}.\n\n${lines.join('\n')}\n\nSubtotal: ${formatMoney(order.subtotal)}\nDelivery: ${Number(order.shipping) ? formatMoney(order.shipping) : 'Complimentary'}\nTotal: ${formatMoney(order.total)}\nPayment: ${order.payment_method || 'COD'} · ${order.payment_status || 'Pending'}\nDelivery address: ${order.address}\n\nView your order: ${appUrl.replace(/\/$/, '')}/my-orders\n\nThank you for choosing AJR.`
}

export async function sendOrderConfirmationEmail(order: OrderForEmail, recipientOverride?: string) {
  const apiKey = process.env.RESEND_API_KEY
  if (process.env.NOTIFICATIONS_EMAIL_ENABLED === 'false') {
    return { skipped: true, reason: 'Email notifications are disabled. Set NOTIFICATIONS_EMAIL_ENABLED=true or remove that setting.' }
  }
  if (!apiKey) {
    return { skipped: true, reason: 'RESEND_API_KEY is missing. Add it to the app .env.local file, then restart the server.' }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'http://localhost:3000'
  const from = process.env.EMAIL_FROM || 'AJR <onboarding@resend.dev>'
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [recipientOverride || order.email],
      subject: 'Your Order Has Been Successfully Placed!',
      html: orderEmailHtml(order, appUrl),
      text: orderEmailText(order, appUrl),
    }),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(String(result?.message || result?.name || `Resend request failed (${response.status})`))
  return { id: String(result?.id || '') }
}
