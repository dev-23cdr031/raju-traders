import { after, NextRequest, NextResponse } from 'next/server'
import { requireAdmin, optionalUser, supabaseAdmin } from '@/lib/supabase'
import { sendOrderConfirmationSms } from '@/lib/order-sms'
import { associatePersistedOrder } from '@/lib/abandoned-carts'
import { CouponCartValidationError, quoteCoupon } from '@/lib/coupon-pricing'
import { dispatchOrderNotifications } from '@/lib/notification-automation'

async function attemptOrderNotification(
  channel: string,
  send: () => Promise<{ skipped?: boolean; reason?: string }>,
) {
  try {
    const result = await send()
    if (result.skipped) {
      console.warn(`Order ${channel} notification skipped: ${result.reason || 'not configured.'}`)
    }
  } catch (notificationError) {
    console.error(`Order confirmation ${channel} failed:`, notificationError)
  }
}

function makeOrderNumber() {
  const d = new Date()
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  const rand = Math.floor(1000 + Math.random() * 9000)
  return `AJR-${ymd}-${rand}`
}

async function findOrderByIdempotency(admin: any, key: string, userId: string | null) {
  let query = admin.from('orders').select('*').eq('idempotency_key', key)
  query = userId ? query.eq('user_id', userId) : query.is('user_id', null)
  return query.maybeSingle()
}

// GET /api/orders — admin only (requires Supabase access token of an admin email in lib/supabase.ts)
export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request)
  if ('response' in gate) return gate.response
  try {
    const admin = supabaseAdmin()
    const { data, error } = await admin
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) throw error
    return NextResponse.json({ orders: data ?? [] })
  } catch (e: any) {
    console.error('GET /api/orders error:', e)
    return NextResponse.json({ message: e?.message || 'Failed to load orders.' }, { status: 500 })
  }
}

// POST /api/orders — place a new order from the shop
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const customer_name = String(body.customer_name || body.customer || '').trim()
    const email = String(body.email || '').trim().toLowerCase()
    const phone = String(body.phone || '').trim()
    const address = String(body.address || '').trim()
    const items = Array.isArray(body.items) ? body.items : []
    const subtotal = Number(body.subtotal ?? 0)
    const shipping = Number(body.shipping ?? 0)
    const total = Number(body.total ?? subtotal + shipping)
    const channel = String(body.channel || 'Online')
    const couponCode = String(body.coupon_code || '').trim().toUpperCase()

    if (!customer_name) return NextResponse.json({ message: 'Please enter your name.' }, { status: 400 })
    if (!email) return NextResponse.json({ message: 'Please enter your email.' }, { status: 400 })
    if (!phone) return NextResponse.json({ message: 'Please enter your phone number.' }, { status: 400 })
    if (!address) return NextResponse.json({ message: 'Please enter your delivery address.' }, { status: 400 })
    if (items.length === 0) return NextResponse.json({ message: 'Your bag is empty.' }, { status: 400 })
    if (!Number.isFinite(total) || total < 0 || (!couponCode && total === 0)) {
      return NextResponse.json({ message: 'Invalid order total.' }, { status: 400 })
    }

    const admin = supabaseAdmin()
    const order_number = body.order_number ? String(body.order_number) : makeOrderNumber()
    const status = 'Pending'

    // Payment details + the customer who placed the order (from the access token).
    const user = await optionalUser(request)
    const user_id = user?.id ?? null
    const payment_method = 'COD'
    const payment_status = 'Pending'
    const whatsapp_opt_in = body.whatsapp_opt_in === true
    const idempotency_key = body.idempotency_key ? String(body.idempotency_key).slice(0, 80) : null

    // ---- Duplicate-order protection -------------------------------------
    // The browser generates one idempotency_key per checkout attempt, so a
    // double-clicked (or retried) Place Order returns the FIRST order instead
    // of inserting a second one.
    if (idempotency_key) {
      const { data: existing, error: lookupError } = await findOrderByIdempotency(admin, idempotency_key, user_id)
      if (lookupError) throw lookupError
      if (existing) {
        after(async () => {
          try {
            await associatePersistedOrder(admin, existing)
          } catch (associationError) {
            console.error('Existing order cart association failed:', associationError)
          }
        })
        return NextResponse.json({ order: existing, duplicate: true }, { status: 200 })
      }
    }

    if (couponCode) {
      if (!user_id) return NextResponse.json({ message: 'Sign in to use a coupon.' }, { status: 401 })
      if (!/^[A-Z0-9_-]{3,40}$/.test(couponCode)) {
        return NextResponse.json({ message: 'This coupon code is invalid.' }, { status: 400 })
      }

      let couponPricing: Awaited<ReturnType<typeof quoteCoupon>>
      try {
        couponPricing = await quoteCoupon(admin, couponCode, user_id, items)
      } catch (pricingError) {
        if (pricingError instanceof CouponCartValidationError) {
          return NextResponse.json({ message: pricingError.message }, { status: 400 })
        }
        console.error('Coupon order pricing failed:', pricingError)
        return NextResponse.json({ message: 'Coupon checkout is not ready. Apply the coupons-offers database migration and retry.' }, { status: 503 })
      }
      const { items: verifiedItems, quote } = couponPricing
      if (quote?.error) return NextResponse.json({ message: String(quote.error) }, { status: 400 })
      const orderPayload = {
        order_number,
        customer_name,
        email,
        phone,
        address,
        items: verifiedItems,
        subtotal: quote.subtotal,
        shipping: quote.shipping,
        status,
        channel,
        user_id,
        payment_method,
        payment_status,
        whatsapp_opt_in,
        whatsapp_opt_in_at: whatsapp_opt_in ? new Date().toISOString() : null,
        idempotency_key,
      }
      const { data: result, error: couponOrderError } = await admin.rpc('ajr_create_coupon_order', {
        p_order: orderPayload,
        p_coupon_code: couponCode,
      })
      if (couponOrderError) {
        if (idempotency_key && /duplicate key/i.test(couponOrderError.message || '')) {
          const { data: existing, error: existingError } = await findOrderByIdempotency(admin, idempotency_key, user_id)
          if (existingError) throw existingError
          if (existing) return NextResponse.json({ order: existing, duplicate: true }, { status: 200 })
        }
        throw couponOrderError
      }
      if (result?.error) return NextResponse.json({ message: String(result.error) }, { status: 400 })
      const order = result?.order
      if (!order?.id) throw new Error('The coupon order was not saved.')
      after(async () => {
        try {
          await associatePersistedOrder(admin, order)
        } catch (associationError) {
          console.error('Coupon order cart association failed:', associationError)
        }
        await Promise.allSettled([
          dispatchOrderNotifications(admin, order),
          attemptOrderNotification('SMS', () => sendOrderConfirmationSms(order)),
        ])
      })
      return NextResponse.json({ order }, { status: 201 })
    }

    const { data, error } = await admin
      .from('orders')
      .insert({
        order_number,
        customer_name,
        email,
        phone,
        address,
        items,
        subtotal,
        shipping,
        total,
        status,
        channel,
        user_id,
        payment_method,
        payment_status,
        whatsapp_opt_in,
        whatsapp_opt_in_at: whatsapp_opt_in ? new Date().toISOString() : null,
        idempotency_key,
      })
      .select('*')
      .single()

    // A concurrent request can win the race on the same idempotency_key —
    // in that case return the winner instead of failing the checkout.
    if (error && idempotency_key && /duplicate key/i.test(error.message || '')) {
      const { data: existing } = await findOrderByIdempotency(admin, idempotency_key, user_id)
      if (existing) {
        after(async () => {
          try {
            await associatePersistedOrder(admin, existing)
          } catch (associationError) {
            console.error('Existing order cart association failed:', associationError)
          }
        })
        return NextResponse.json({ order: existing, duplicate: true }, { status: 200 })
      }
    }
    if (error) throw error
    // This runs only after a brand-new order was persisted. Notification
    // failures are isolated from checkout and from each other.
    after(async () => {
      try {
        await associatePersistedOrder(admin, data)
      } catch (associationError) {
        console.error('Persisted order cart association failed:', associationError)
      }
      await Promise.allSettled([
        dispatchOrderNotifications(admin, data),
        attemptOrderNotification('SMS', () => sendOrderConfirmationSms(data)),
      ])
    })
    return NextResponse.json({ order: data }, { status: 201 })
  } catch (e: any) {
    console.error('POST /api/orders error:', e)
    const msg = String(e?.message || '')
    if (/column .* (user_id|payment_method|idempotency_key|whatsapp_opt_in(?:_at)?|coupon_code|coupon_discount|coupon_shipping_discount)/i.test(msg) || /function public\.ajr_create_coupon_order/i.test(msg)) {
      return NextResponse.json(
        { message: 'Database not upgraded yet — run supabase/customer-features.sql and supabase/coupons-offers.sql in the Supabase SQL editor, then retry.' },
        { status: 500 }
      )
    }
    return NextResponse.json({ message: e?.message || 'Failed to place order.' }, { status: 500 })
  }
}
