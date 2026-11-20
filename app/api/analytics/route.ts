import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const EVENTS = new Set(['page_view', 'page_duration', 'cart_add', 'checkout_start', 'purchase', 'heartbeat'])
const PAGES = new Set([
  'home',
  'about',
  'shop',
  'contact',
  'cart',
  'wishlist',
  'product-detail',
  'orders',
  'login',
  'signup',
])
const DEVICES = new Set(['desktop', 'mobile', 'tablet'])
const BROWSERS = new Set(['Chrome', 'Safari', 'Firefox', 'Edge', 'Other'])
const OPERATING_SYSTEMS = new Set(['Windows', 'macOS', 'iOS', 'Android', 'Linux', 'Other'])
const BOT = /bot|crawler|spider|preview|headless|lighthouse|googleother|facebookexternalhit/i
const SESSION_LIMITS = new Map<string, { startedAt: number; count: number }>()

function limitedSession(sessionId: string) {
  const now = Date.now()
  for (const [id, window] of SESSION_LIMITS) {
    if (now - window.startedAt > 60_000) SESSION_LIMITS.delete(id)
  }
  if (SESSION_LIMITS.size > 5000) SESSION_LIMITS.clear()

  const current = SESSION_LIMITS.get(sessionId)
  if (!current || now - current.startedAt > 60_000) {
    SESSION_LIMITS.set(sessionId, { startedAt: now, count: 1 })
    return false
  }
  current.count += 1
  return current.count > 60
}

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get('content-length') || 0)
  const userAgent = request.headers.get('user-agent') || ''
  if (contentLength > 4096 || !userAgent || BOT.test(userAgent)) {
    return NextResponse.json({ message: 'Event rejected.' }, { status: 400 })
  }

  const rawBody = await request.text().catch(() => '')
  if (!rawBody || rawBody.length > 4096) {
    return NextResponse.json({ message: 'Invalid event.' }, { status: 400 })
  }
  const body = await Promise.resolve().then(() => JSON.parse(rawBody)).catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ message: 'Invalid event.' }, { status: 400 })
  }

  const visitorId = String(body.visitorId || '')
  const sessionId = String(body.sessionId || '')
  const eventName = String(body.eventName || '')
  const page = String(body.page || '')
  const durationMs = body.durationMs
  const productId = body.productId
  if (!UUID.test(visitorId) || !UUID.test(sessionId) || !EVENTS.has(eventName) || !PAGES.has(page)) {
    return NextResponse.json({ message: 'Invalid event.' }, { status: 400 })
  }
  if (
    productId !== undefined &&
    (
      !Number.isSafeInteger(productId) ||
      productId <= 0 ||
      page !== 'product-detail' ||
      (eventName !== 'page_view' && eventName !== 'page_duration')
    )
  ) {
    return NextResponse.json({ message: 'Invalid product.' }, { status: 400 })
  }
  if (
    eventName === 'page_duration' &&
    (typeof durationMs !== 'number' || !Number.isInteger(durationMs) || durationMs < 0 || durationMs > 900_000)
  ) {
    return NextResponse.json({ message: 'Invalid event duration.' }, { status: 400 })
  }
  if (limitedSession(sessionId)) {
    return NextResponse.json({ message: 'Event rate limit reached.' }, { status: 429 })
  }

  try {
    const { error } = await supabaseAdmin().from('visitor_analytics_events').insert({
      visitor_id: visitorId,
      session_id: sessionId,
      event_name: eventName,
      page,
      product_id: productId ?? null,
      duration_ms: eventName === 'page_duration' ? durationMs : null,
      device_type: DEVICES.has(body.deviceType) ? body.deviceType : 'desktop',
      browser: BROWSERS.has(body.browser) ? body.browser : 'Other',
      operating_system: OPERATING_SYSTEMS.has(body.operatingSystem) ? body.operatingSystem : 'Other',
    })
    if (error) throw error
    return NextResponse.json({ accepted: true }, { status: 202 })
  } catch (error: any) {
    console.error('POST /api/analytics failed:', error?.message || 'Unknown analytics write error.')
    return NextResponse.json({ message: 'Analytics event could not be saved.' }, { status: 503 })
  }
}
