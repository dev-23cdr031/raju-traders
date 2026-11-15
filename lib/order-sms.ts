import 'server-only'

type OrderForSms = {
  id: string
  order_number: string
  customer_name: string
  phone: string
  total: number
  payment_status?: string
}

// The approved DLT copy owns the static `Rs ` prefix. Keep this value numeric
// so Fast2SMS renders `Total: Rs 1,000`, never `Total: Rs Rs 1,000`.
const formattedAmount = (value: unknown) => Math.max(0, Number(value) || 0).toLocaleString('en-IN')

export function normalizeIndianMobile(value: unknown): string {
  let digits = String(value || '').replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.startsWith('91') && digits.length === 12) digits = digits.slice(2)
  return /^[6-9]\d{9}$/.test(digits) ? digits : ''
}

export const orderSmsTemplatePreview = 'AJR: Hi {{customer_name}}, order {{order_number}} received. Total Rs {{total_amount}}. Payment {{payment_status}}. Track: {{tracking_url}}'

export function renderOrderSmsPreview(variables: {
  customer_name: string
  order_number: string
  total_amount: string
  payment_status: string
  tracking_url: string
}) {
  return orderSmsTemplatePreview
    .replace('{{customer_name}}', variables.customer_name)
    .replace('{{order_number}}', variables.order_number)
    .replace('{{total_amount}}', variables.total_amount)
    .replace('{{payment_status}}', variables.payment_status)
    .replace('{{tracking_url}}', variables.tracking_url)
}

export async function sendOrderConfirmationSms(order: OrderForSms) {
  const apiKey = process.env.FAST2SMS_API_KEY
  const messageId = process.env.FAST2SMS_MESSAGE_ID_ORDER_PLACED
  const senderId = process.env.FAST2SMS_SENDER_ID
  if (!apiKey || !messageId || !senderId || process.env.NOTIFICATIONS_SMS_ENABLED === 'false') {
    return { skipped: true, reason: 'SMS notifications are not configured. Add the Fast2SMS API key, DLT Message ID, and approved sender ID.' }
  }

  const mobile = normalizeIndianMobile(order.phone)
  if (!mobile) throw new Error('This order does not have a valid Indian mobile number.')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || ''
  if (!/^https:\/\//i.test(appUrl)) {
    return { skipped: true, reason: 'SMS notifications need a public HTTPS site URL before a tracking link can be sent.' }
  }

  const variables = {
    customer_name: String(order.customer_name || 'Customer').replace(/\|/g, ' ').trim().slice(0, 80),
    order_number: String(order.order_number || order.id).replace(/\|/g, ' ').trim().slice(0, 80),
    total_amount: formattedAmount(order.total),
    payment_status: String(order.payment_status || 'Pending').replace(/\|/g, ' ').trim().slice(0, 40),
    tracking_url: `${appUrl.replace(/\/$/, '')}/my-orders`,
  }
  // Keep a single pure rendering path beside the Flow values; this makes the
  // DLT template contract easy to inspect and prevents currency-prefix drift.
  const renderedPreview = renderOrderSmsPreview(variables)
  if (!/^AJR: Hi .+, order .+ received\. Total Rs [^\s].+\. Payment .+\. Track: https:\/\/.+\/my-orders$/.test(renderedPreview)) {
    throw new Error('Order SMS variables do not match the approved DLT template.')
  }

  // Fast2SMS DLT route uses the exact approved template registered in its DLT
  // Manager. `variables_values` must follow the placeholder order in that
  // template; the browser never supplies this content or the recipient.
  const response = await fetch('https://www.fast2sms.com/dev/bulkV2', {
    method: 'POST',
    headers: { accept: 'application/json', Authorization: apiKey, 'content-type': 'application/json' },
    body: JSON.stringify({
      route: 'dlt',
      sender_id: senderId,
      message: messageId,
      // Register the tracking URL as fixed text in the DLT template. Dynamic
      // links are commonly rejected by DLT validation, so only its four
      // customer/order values are passed to Fast2SMS.
      variables_values: [variables.customer_name, variables.order_number, variables.total_amount, variables.payment_status].join('|'),
      numbers: mobile,
      sms_details: '1',
      udf1: `order-${String(order.order_number || order.id).slice(0, 80)}`,
    }),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok || result?.return !== true) {
    if (Number(result?.status_code) === 414 || /ip.*blacklist/i.test(String(result?.message || ''))) {
      throw new Error('Fast2SMS blocked this server IP. In Fast2SMS Dev API → Security, allow-list the public outbound IP of this server.')
    }
    throw new Error(String(result?.message || `Fast2SMS request failed (${response.status})`))
  }
  return { id: String(result?.request_id || '') }
}
