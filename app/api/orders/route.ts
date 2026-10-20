import { NextRequest, NextResponse } from 'next/server'
import { ORDER_STATUSES, optionalUser, PAYMENT_METHODS, PAYMENT_STATUSES, requireAdmin, supabaseAdmin } from '@/lib/supabase'

function makeOrderNumber() {
  const d = new Date()
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  const rand = Math.floor(1000 + Math.random() * 9000)
  return `AJR-${ymd}-${rand}`
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

    if (!customer_name) return NextResponse.json({ message: 'Please enter your name.' }, { status: 400 })
    if (!email) return NextResponse.json({ message: 'Please enter your email.' }, { status: 400 })
    if (!phone) return NextResponse.json({ message: 'Please enter your phone number.' }, { status: 400 })
    if (!address) return NextResponse.json({ message: 'Please enter your delivery address.' }, { status: 400 })
    if (items.length === 0) return NextResponse.json({ message: 'Your bag is empty.' }, { status: 400 })
    if (!Number.isFinite(total) || total <= 0) return NextResponse.json({ message: 'Invalid order total.' }, { status: 400 })

    const admin = supabaseAdmin()
    const order_number = body.order_number ? String(body.order_number) : makeOrderNumber()
    const status = ORDER_STATUSES.includes(String(body.status || '') as any) ? String(body.status) : 'Pending'

    // Payment details + the customer who placed the order (from the access token).
    const user = await optionalUser(request)
    const user_id = user?.id ?? null
    const payment_method = PAYMENT_METHODS.includes(String(body.payment_method || '') as any)
      ? String(body.payment_method)
      : 'COD'
    const payment_status = PAYMENT_STATUSES.includes(String(body.payment_status || '') as any)
      ? String(body.payment_status)
      : 'Pending'
    const idempotency_key = body.idempotency_key ? String(body.idempotency_key).slice(0, 80) : null

    // ---- Duplicate-order protection -------------------------------------
    // The browser generates one idempotency_key per checkout attempt, so a
    // double-clicked (or retried) Place Order returns the FIRST order instead
    // of inserting a second one.
    if (idempotency_key) {
      const { data: existing, error: lookupError } = await admin
        .from('orders')
        .select('*')
        .eq('idempotency_key', idempotency_key)
        .maybeSingle()
      if (lookupError) throw lookupError
      if (existing) return NextResponse.json({ order: existing, duplicate: true }, { status: 200 })
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
        idempotency_key,
      })
      .select('*')
      .single()

    // A concurrent request can win the race on the same idempotency_key —
    // in that case return the winner instead of failing the checkout.
    if (error && idempotency_key && /duplicate key/i.test(error.message || '')) {
      const { data: existing } = await admin
        .from('orders')
        .select('*')
        .eq('idempotency_key', idempotency_key)
        .maybeSingle()
      if (existing) return NextResponse.json({ order: existing, duplicate: true }, { status: 200 })
    }
    if (error) throw error
    return NextResponse.json({ order: data }, { status: 201 })
  } catch (e: any) {
    console.error('POST /api/orders error:', e)
    const msg = String(e?.message || '')
    if (/column .* (user_id|payment_method|idempotency_key)/i.test(msg) || /does not exist/i.test(msg)) {
      return NextResponse.json(
        { message: 'Database not upgraded yet — run supabase/customer-features.sql in the Supabase SQL editor, then retry.' },
        { status: 500 }
      )
    }
    return NextResponse.json({ message: e?.message || 'Failed to place order.' }, { status: 500 })
  }
}
