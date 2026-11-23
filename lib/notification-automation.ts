import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'
import { OrderEmailRejectedError, sendOrderConfirmationEmail } from '@/lib/order-email'
import { sendOrderConfirmationWhatsApp, WhatsAppProviderRejectedError } from '@/lib/order-whatsapp'

type Channel = 'email' | 'whatsapp' | 'admin_email'
type EventKind = 'order_confirmation' | 'abandoned_cart'

const clean = (value: unknown, limit = 300) => String(value ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, limit)

export function isConfirmedOrder(order: any) {
  const method = clean(order?.payment_method || 'COD', 40).toLowerCase()
  const payment = clean(order?.payment_status, 40).toLowerCase()
  const status = clean(order?.status, 40).toLowerCase()
  if (status === 'cancelled') return false
  return method === 'cod' || method === 'cash on delivery' || payment === 'paid' || payment === 'confirmed'
}

async function createEvent(admin: any, args: {
  eventKey: string
  kind: EventKind
  channel: Channel
  recipient: string
  payload: Record<string, unknown>
  consent: boolean
}) {
  const { data, error } = await admin.rpc('ajr_claim_notification_event', {
    p_event_key: args.eventKey,
    p_event_type: args.kind,
    p_channel: args.channel,
    p_recipient: args.recipient,
    p_payload: args.payload,
    p_consent: args.consent,
  })
  if (error) throw error
  return data
}

async function record(admin: any, id: string, values: Record<string, unknown>) {
  const { error } = await admin.from('notification_events').update({
    ...values,
    updated_at: new Date().toISOString(),
  }).eq('id', id)
  if (error) throw error
  const providerId = String(values.provider_message_id || '')
  if (!providerId) return
  // Provider callbacks can arrive before a serverless invocation has stored
  // the provider ID. Reconcile durable early receipts as soon as it is known.
  const { data: receipts, error: receiptError } = await admin.from('notification_receipts')
    .select('status').eq('provider_message_id', providerId)
  if (receiptError) throw receiptError
  const statuses = new Set((receipts || []).map((receipt: any) => String(receipt.status)))
  const next = statuses.has('read') ? 'read'
    : (statuses.has('delivered') || statuses.has('email.delivered')) ? 'delivered'
      : (statuses.has('failed') || statuses.has('email.bounced') || statuses.has('email.complained')) ? 'failed'
        : null
  if (next) {
    const { error: reconcileError } = await admin.from('notification_events').update({
      status: next, delivered_at: next === 'delivered' || next === 'read' ? new Date().toISOString() : null,
      failed_at: next === 'failed' ? new Date().toISOString() : null, updated_at: new Date().toISOString(),
    }).eq('id', id).eq('status', 'sent')
    if (reconcileError) throw reconcileError
  }
}

export async function beginCartNotificationEvent(admin: any, cart: any, channel: 'email' | 'whatsapp') {
  return createEvent(admin, {
    eventKey: 'cart:' + String(cart.id) + ':recovery',
    kind: 'abandoned_cart',
    channel,
    recipient: clean(channel === 'email' ? cart.customer_email : cart.customer_phone, 254),
    payload: { cartId: cart.id, itemCount: Number(cart.item_count || 0), cartTotal: Number(cart.cart_total || 0) },
    consent: channel === 'email' ? cart.recovery_email_consent === true : cart.whatsapp_marketing_consent === true,
  })
}

export async function recordNotificationEvent(admin: any, id: string, values: Record<string, unknown>) {
  return record(admin, id, values)
}

export async function dispatchOrderNotifications(admin: any, order: any) {
  if (!isConfirmedOrder(order)) return { queued: false, reason: 'Order is awaiting payment confirmation.' }
  const orderKey = 'order:' + order.id + ':confirmation'
  const payload = { orderId: order.id, orderNumber: order.order_number, total: order.total }
  const tasks: Promise<unknown>[] = []
  const customerEmail = clean(order.email, 254).toLowerCase()
  if (customerEmail) {
    tasks.push((async () => {
      const event = await createEvent(admin, { eventKey: orderKey, kind: 'order_confirmation', channel: 'email', recipient: customerEmail, payload, consent: true })
      if (!event || event.status !== 'sending') return
      try {
        const result = await sendOrderConfirmationEmail(order)
        if (result?.skipped) {
          console.warn('Order email notification skipped:', result.reason)
          await record(admin, event.id, { status: 'skipped', error: clean(result.reason) })
        }
        else await record(admin, event.id, { status: 'sent', provider_message_id: result?.id || null, sent_at: new Date().toISOString() })
      } catch (error) {
        console.error('Order email notification failed; see the notification ledger for details.')
        const known = error instanceof OrderEmailRejectedError
        await record(admin, event.id, { status: known ? 'failed' : 'uncertain', error: clean(error instanceof Error ? error.message : error), failed_at: new Date().toISOString() })
      }
    })())
  }
  if (order.whatsapp_opt_in === true && clean(order.phone, 32)) {
    tasks.push((async () => {
      const event = await createEvent(admin, { eventKey: orderKey, kind: 'order_confirmation', channel: 'whatsapp', recipient: clean(order.phone, 32), payload, consent: true })
      if (!event || event.status !== 'sending') return
      try {
        const result = await sendOrderConfirmationWhatsApp(order)
        if (result?.skipped) await record(admin, event.id, { status: 'skipped', error: clean(result.reason) })
        else await record(admin, event.id, { status: 'sent', provider_message_id: result?.id || null, sent_at: new Date().toISOString() })
      } catch (error) {
        const known = error instanceof WhatsAppProviderRejectedError
        await record(admin, event.id, { status: known ? 'failed' : 'uncertain', error: clean(error instanceof Error ? error.message : error), failed_at: new Date().toISOString() })
      }
    })())
  }
  const adminEmail = clean(process.env.ADMIN_NOTIFICATION_EMAIL, 254).toLowerCase()
  if (adminEmail) {
    tasks.push((async () => {
      const event = await createEvent(admin, { eventKey: orderKey, kind: 'order_confirmation', channel: 'admin_email', recipient: adminEmail, payload, consent: true })
      if (!event || event.status !== 'sending') return
      try {
        const result = await sendOrderConfirmationEmail(order, adminEmail)
        if (result?.skipped) await record(admin, event.id, { status: 'skipped', error: clean(result.reason) })
        else await record(admin, event.id, { status: 'sent', provider_message_id: result?.id || null, sent_at: new Date().toISOString() })
      } catch (error) {
        const known = error instanceof OrderEmailRejectedError
        await record(admin, event.id, { status: known ? 'failed' : 'uncertain', error: clean(error instanceof Error ? error.message : error), failed_at: new Date().toISOString() })
      }
    })())
  }
  const results = await Promise.allSettled(tasks)
  let failed = false
  for (const result of results) {
    if (result.status !== 'rejected') continue
    failed = true
    const code = typeof result.reason?.code === 'string' && /^[A-Z0-9_]{1,32}$/i.test(result.reason.code)
      ? result.reason.code : 'unknown'
    console.error(`Order notification could not be recorded or dispatched (code: ${code}). Check the notification database migration and server logs.`)
  }
  return { queued: !failed }
}

export function validMetaSignature(body: string, header: string | null) {
  const secret = process.env.META_APP_SECRET || ''
  if (!secret || !header?.startsWith('sha256=')) return false
  const actual = Buffer.from(header.slice(7), 'hex')
  const expected = Buffer.from(createHmac('sha256', secret).update(body).digest('hex'), 'hex')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export function validResendSignature(body: string, id: string | null, timestamp: string | null, signature: string | null) {
  const secret = process.env.RESEND_WEBHOOK_SECRET || ''
  if (!secret || !id || !timestamp || !signature) return false
  const sentAt = Number(timestamp) * 1000
  if (!Number.isFinite(sentAt) || Math.abs(Date.now() - sentAt) > 5 * 60_000) return false
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  const expected = createHmac('sha256', key).update(id + '.' + timestamp + '.' + body).digest('base64')
  return signature.split(' ').some((part) => {
    const value = part.startsWith('v1,') ? part.slice(3) : ''
    const a = Buffer.from(value)
    const b = Buffer.from(expected)
    return a.length === b.length && timingSafeEqual(a, b)
  })
}
