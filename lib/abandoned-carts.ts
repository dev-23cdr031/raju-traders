import 'server-only'

import { createHash } from 'node:crypto'
import type { CartLine } from '@/lib/supabase'

const MAX_LINES = 60

const safeText = (value: unknown, length: number) =>
  String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, length)

const safeImage = (value: unknown) => {
  const image = safeText(value, 500)
  if (image.startsWith('/') && !image.startsWith('//')) return image
  try {
    const url = new URL(image)
    if (url.protocol === 'https:' && !url.username && !url.password) return url.href
  } catch {}
  return ''
}

export function normalizeTrackedLines(input: unknown): CartLine[] {
  if (!Array.isArray(input)) return []
  return input.slice(0, MAX_LINES).flatMap((line: any) => {
    const raw = line?.product
    const quantity = Math.min(99, Math.max(1, Math.floor(Number(line?.quantity))))
    const price = Number(raw?.price)
    if (!raw || !Number.isFinite(quantity) || !Number.isFinite(price) || price < 0 || price > 10_000_000) return []
    const id = typeof raw.id === 'number' && Number.isFinite(raw.id)
      ? raw.id
      : safeText(raw.id, 80)
    if (id === '' || id === 0) return []
    return [{
      product: {
        id,
        name: safeText(raw.name, 140) || 'AJR product',
        type: safeText(raw.type, 80),
        image: safeImage(raw.image),
        price,
        selectedWeight: safeText(raw.selectedWeight || '250 g', 32),
        selectedVariety: safeText(raw.selectedVariety, 80),
      },
      quantity,
    }]
  })
}

export function trackedCartTotal(lines: CartLine[]) {
  return Math.round(lines.reduce((sum, line) => sum + Number(line.product.price) * line.quantity, 0) * 100) / 100
}

export function cartLineKey(line: any) {
  const product = line?.product || line || {}
  return [
    String(product.id ?? ''),
    String(product.selectedWeight || product.selected_weight || '250 g'),
    String(product.selectedVariety || product.variety || ''),
  ].join('|')
}

export function orderOverlapsCart(cartItems: unknown, orderItems: unknown) {
  if (!Array.isArray(cartItems) || !Array.isArray(orderItems)) return false
  const keys = new Set(cartItems.map(cartLineKey))
  return orderItems.some((item: any) => keys.has(cartLineKey(item)))
}

export function matchedOrderItemTotal(cartItems: unknown, orderItems: unknown) {
  if (!Array.isArray(cartItems) || !Array.isArray(orderItems)) return 0
  const keys = new Set(cartItems.map(cartLineKey))
  const total = orderItems.reduce((sum: number, item: any) => {
    if (!keys.has(cartLineKey(item))) return sum
    const price = Number(item?.price ?? item?.product?.price)
    const quantity = Number(item?.quantity ?? 1)
    return Number.isFinite(price) && price >= 0 && Number.isFinite(quantity) && quantity > 0
      ? sum + price * quantity
      : sum
  }, 0)
  return Math.round(total * 100) / 100
}

export function abandonmentMinutes() {
  return 30
}

export function deviceCategory(userAgent: string | null) {
  if (!userAgent) return null
  if (/ipad|tablet|kindle|silk/i.test(userAgent)) return 'Tablet'
  if (/mobile|iphone|ipod|android/i.test(userAgent)) return 'Mobile'
  return 'Desktop'
}

export function sha256(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

export function safeRecoveryBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL
  if (!configured) throw new Error('Set APP_URL or NEXT_PUBLIC_APP_URL before sending cart reminders.')
  const url = new URL(configured)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('APP_URL must use HTTPS (HTTP is allowed for local development).')
  }
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
    throw new Error('Cart recovery links require an HTTPS APP_URL in production.')
  }
  return url.origin
}

export async function persistSignedInCartSnapshot({
  admin,
  user,
  items,
  consent,
  whatsappMarketingConsent,
  userAgent,
}: {
  admin: any
  user: any
  items: unknown
  consent?: boolean
  whatsappMarketingConsent?: boolean
  userAgent: string | null
}) {
  const lines = normalizeTrackedLines(items)
  const { data: currentRow, error: lookupError } = await admin
    .from('abandoned_carts')
    .select('*')
    .eq('user_id', user.id)
    .is('closed_at', null)
    .maybeSingle()
  if (lookupError) throw lookupError
  let current = currentRow
  if (current?.reminder_sent_at && lines.length &&
    JSON.stringify(normalizeTrackedLines(current.cart_items)) !== JSON.stringify(lines)) {
    const { data: closed, error } = await admin.from('abandoned_carts')
      .update({ closed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', current.id).eq('reminder_sent_at', current.reminder_sent_at).is('closed_at', null)
      .select('id').maybeSingle()
    if (error || !closed) throw error || new Error('Cart activity changed while recording a new recovery cycle.')
    current = null
  }

  let inherited = current
  if (!inherited) {
    const { data: latest, error: historyError } = await admin
      .from('abandoned_carts')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (historyError) throw historyError
    inherited = latest
  }
  const hasExplicitConsent = typeof consent === 'boolean'
  const hasExplicitWhatsappConsent = typeof whatsappMarketingConsent === 'boolean'
  // Consent belongs to the currently open bag. Do not carry it from a closed
  // bag into a newly-created one: otherwise an opt-out racing with creation
  // could cause a new bag to be mailed without the customer's current choice.
  const inheritedConsent = current ? Boolean(current.recovery_email_consent) : false
  const requestedConsent = consent === true

  // Cart saves and preference changes can arrive from different tabs. Only
  // apply a preference change if the stored value still matches the value we
  // originally read; otherwise report the newer stored preference instead of
  // overwriting it with stale data.
  const persistExplicitConsent = async (cart: any) => {
    const knownConsent = Boolean(cart?.recovery_email_consent)
    if (!cart?.id || ((!hasExplicitConsent || requestedConsent === knownConsent) && !hasExplicitWhatsappConsent)) return knownConsent

    const preferenceUpdate: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }
    if (hasExplicitConsent) {
      preferenceUpdate.recovery_email_consent = requestedConsent
      preferenceUpdate.recovery_email_consent_at = requestedConsent ? new Date().toISOString() : null
    }
    if (hasExplicitWhatsappConsent) {
      preferenceUpdate.whatsapp_marketing_consent = whatsappMarketingConsent === true
      preferenceUpdate.whatsapp_marketing_consent_at = whatsappMarketingConsent ? new Date().toISOString() : null
    }
    // Opting out revokes any unused link. Do not reset reminder fields when
    // opting back in: an old delivery must never become eligible again.
    if (hasExplicitConsent && !requestedConsent) {
      preferenceUpdate.recovery_token_hash = null
      preferenceUpdate.recovery_token_expires_at = null
      preferenceUpdate.recovery_redeemed_at = null
    }
    const { data: updated, error } = await admin.from('abandoned_carts').update(preferenceUpdate)
      .eq('id', cart.id)
      .eq('recovery_email_consent', knownConsent)
      .select('recovery_email_consent')
      .maybeSingle()
    if (error) throw error
    if (updated) return Boolean(updated.recovery_email_consent)

    const { data: latest, error: latestError } = await admin.from('abandoned_carts')
      .select('recovery_email_consent')
      .eq('id', cart.id)
      .maybeSingle()
    if (latestError) throw latestError
    return Boolean(latest?.recovery_email_consent)
  }

  if (!lines.length && current?.order_id) {
    return { lines, consent: await persistExplicitConsent(current) }
  }
  if (!lines.length && current) {
    const { data: recentOrders, error: orderLookupError } = await admin.from('orders')
      .select('id,items,status,created_at')
      .eq('user_id', user.id)
      .gte('created_at', new Date(Date.now() - 60 * 60_000).toISOString())
      .order('created_at', { ascending: false })
      .limit(20)
    if (orderLookupError) throw orderLookupError
    const completedMatch = (recentOrders || []).find((order: any) =>
      String(order.status || '').toLowerCase() !== 'cancelled'
      && orderOverlapsCart(current.cart_items, order.items))
    if (completedMatch) {
      const { error } = await admin.from('abandoned_carts').update({
        order_id: completedMatch.id,
        closed_at: new Date().toISOString(),
        recovery_token_hash: null,
        recovery_token_expires_at: null,
        updated_at: new Date().toISOString(),
      }).eq('id', current.id)
      if (error) throw error
      return { lines, consent: await persistExplicitConsent(current) }
    }
  }
  if (!lines.length && !current) {
    return {
      lines,
      consent: await persistExplicitConsent(inherited),
    }
  }

  const consentChanged = hasExplicitConsent && requestedConsent !== inheritedConsent
  const optedIn = hasExplicitConsent ? requestedConsent : inheritedConsent
  const consentAt = consentChanged
    ? (optedIn ? new Date().toISOString() : null)
    : inherited?.recovery_email_consent_at || null
  const userEmail = user.email_confirmed_at ? safeText(user.email, 254).toLowerCase() : ''
  const metadata = user.user_metadata || {}
  // Routine cart activity must never copy reminder/token state from a stale
  // read. The cron owns that state while it is claiming and delivering email.
  const row = {
    ...(current?.id ? { id: current.id } : {}),
    user_id: user.id,
    guest_token_hash: null,
    cart_items: lines,
    cart_total: trackedCartTotal(lines),
    item_count: lines.reduce((sum, line) => sum + line.quantity, 0),
    customer_name: safeText(metadata.full_name || metadata.name || metadata.first_name, 120),
    customer_email: userEmail,
    customer_phone: safeText(metadata.phone, 40),
    device_category: deviceCategory(userAgent),
    cart_started_at: current?.cart_started_at || new Date().toISOString(),
    last_activity_at: new Date().toISOString(),
    closed_at: lines.length ? null : new Date().toISOString(),
    guest_token_expires_at: null,
    order_id: current?.order_id || null,
    updated_at: new Date().toISOString(),
  }
  if (current) {
    const { error } = await admin.from('abandoned_carts').update(row).eq('id', current.id)
    if (error) throw error
    const storedConsent = await persistExplicitConsent(current)
    return { lines, consent: storedConsent }
  } else if (lines.length) {
    const insertRow = {
      ...row,
      recovery_email_consent: optedIn,
      recovery_email_consent_at: consentAt,
      whatsapp_marketing_consent: hasExplicitWhatsappConsent && whatsappMarketingConsent === true,
      whatsapp_marketing_consent_at: hasExplicitWhatsappConsent && whatsappMarketingConsent ? new Date().toISOString() : null,
    }
    const { error } = await admin.from('abandoned_carts').insert(insertRow)
    if (error) throw error
  }
  return { lines, consent: optedIn }
}

export function isConfirmedCartOrder(order: { payment_method?: unknown; payment_status?: unknown; status?: unknown }) {
  const method = String(order?.payment_method || '').trim().toLowerCase()
  const payment = String(order?.payment_status || '').trim().toLowerCase()
  return String(order.status || '').toLowerCase() !== 'cancelled'
    && (method === 'cod' || method === 'cash on delivery' || payment === 'paid' || payment === 'confirmed')
}

export async function associatePersistedOrder(admin: any, order: any) {
  if (!order?.user_id || !isConfirmedCartOrder(order)) return false
  const { data: cart, error } = await admin
    .from('abandoned_carts')
    .select('id,cart_items,last_activity_at,order_id')
    .eq('user_id', order.user_id)
    .is('closed_at', null)
    .maybeSingle()
  if (error) throw error
  if (!cart || !orderOverlapsCart(cart.cart_items, order.items)) return false

  const orderCreatedAt = new Date(order.created_at || Date.now()).getTime()
  const activityAt = new Date(cart.last_activity_at || 0).getTime()
  if (!Number.isFinite(activityAt) || activityAt > orderCreatedAt + 10 * 60_000) return false
  if (cart.order_id && cart.order_id !== order.id) return false
  const { error: updateError } = await admin
    .from('abandoned_carts')
    .update({ order_id: order.id, closed_at: new Date().toISOString(), recovery_token_hash: null, recovery_token_expires_at: null, updated_at: new Date().toISOString() })
    .eq('id', cart.id)
  if (updateError) throw updateError
  return true
}
