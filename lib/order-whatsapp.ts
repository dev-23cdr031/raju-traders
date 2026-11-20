import 'server-only'

type OrderForWhatsApp = {
  id: string
  order_number: string
  customer_name: string
  phone: string
  total: number
  payment_status?: string
}

function normalizeWhatsAppNumber(value: unknown): string {
  let digits = String(value || '').replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.length === 10 && /^[6-9]/.test(digits)) digits = `91${digits}`
  if (digits.length === 11 && digits.startsWith('0')) digits = `91${digits.slice(1)}`
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : ''
}

const formattedAmount = (value: unknown) =>
  `INR ${Math.max(0, Number(value) || 0).toLocaleString('en-IN')}`

export async function sendOrderConfirmationWhatsApp(order: OrderForWhatsApp) {
  const accessToken = process.env.META_WHATSAPP_ACCESS_TOKEN
  const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID
  const templateName = process.env.META_WHATSAPP_ORDER_TEMPLATE
  const languageCode = process.env.META_WHATSAPP_TEMPLATE_LANGUAGE || 'en_US'

  if (process.env.NOTIFICATIONS_WHATSAPP_ENABLED === 'false') {
    return { skipped: true, reason: 'WhatsApp notifications are disabled.' }
  }
  if (!accessToken || !phoneNumberId || !templateName) {
    return {
      skipped: true,
      reason: 'WhatsApp notifications are not configured. Add the Meta WhatsApp access token, phone number ID, and approved order template name.',
    }
  }

  const recipient = normalizeWhatsAppNumber(order.phone)
  if (!recipient) throw new Error('This order does not have a valid WhatsApp number.')

  const parameters = [
    String(order.customer_name || 'Customer').trim().slice(0, 80),
    String(order.order_number || order.id).trim().slice(0, 80),
    formattedAmount(order.total),
    String(order.payment_status || 'Pending').trim().slice(0, 40),
  ]

  const apiVersion = process.env.META_GRAPH_API_VERSION || 'v23.0'
  const response = await fetch(`https://graph.facebook.com/${apiVersion}/${encodeURIComponent(phoneNumberId)}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipient,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        components: [{
          type: 'body',
          parameters: parameters.map((text) => ({ type: 'text', text })),
        }],
      },
    }),
  })

  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(String(result?.error?.message || `Meta WhatsApp request failed (${response.status})`))
  }

  const messageId = result?.messages?.[0]?.id
  if (typeof messageId !== 'string' || !messageId) {
    throw new Error('Meta WhatsApp accepted no message ID for the order confirmation.')
  }
  return { id: messageId }
}
