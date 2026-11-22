import { NextRequest, NextResponse } from 'next/server'
import { isAdminEmail, requireAdmin, supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const COMPLETED_STATUSES = new Set(['delivered', 'paid'])

async function loadDistinctDevices(admin: ReturnType<typeof supabaseAdmin>, id: string) {
  const devices = new Set<string>()
  for (let start = 0; start <= 50000; start += 1000) {
    const { data, error } = await admin.from('auth_login_events')
      .select('device,browser,os')
      .eq('user_id', id)
      .eq('event_type', 'login_success')
      .range(start, start + 999)
    if (error) throw error
    if (start === 50000) {
      if (data?.length) throw new Error('Too many device events to load safely.')
      return Array.from(devices)
    }
    for (const event of data || []) {
      const description = [event.device, event.browser, event.os].filter(Boolean).join(' · ')
      if (description) devices.add(description)
    }
    if (!data || data.length < 1000) return Array.from(devices)
  }
  throw new Error('Too many device events to load safely.')
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(request)
  if ('response' in gate) return gate.response
  const { id } = await context.params
  if (!UUID_RE.test(id)) return NextResponse.json({ message: 'Invalid customer ID.' }, { status: 400 })

  try {
    const admin = supabaseAdmin()
    const [{ data: result, error: userError }, { data: events, error: eventError }, { count: loginCount, error: countError }, deviceResult, { data: firstOrders, error: orderError }] = await Promise.all([
      admin.auth.admin.getUserById(id),
      admin.from('auth_login_events')
        .select('id,event_type,device,browser,os,login_method,created_at')
        .eq('user_id', id)
        .order('created_at', { ascending: false })
        .limit(200),
      admin.from('auth_login_events')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', id)
        .eq('event_type', 'login_success'),
      loadDistinctDevices(admin, id).then((devices) => ({ devices, error: null }))
        .catch((error) => ({ devices: [] as string[], error })),
      admin.from('orders')
        .select('id,order_number,status,total,created_at,items')
        .eq('user_id', id)
        .order('created_at', { ascending: false })
        .range(0, 999),
    ])
    if (userError || !result?.user) return NextResponse.json({ message: 'Customer not found.' }, { status: 404 })
    if (orderError) throw orderError

    const user = result.user
    const metadata = user.user_metadata || {}
    const recordedLoginCount = loginCount || 0
    const orders = firstOrders ?? []
    let orderCount = orders.length
    let completedSpend = orders.reduce((sum, order) =>
      COMPLETED_STATUSES.has(String(order.status || '').toLowerCase()) ? sum + Number(order.total || 0) : sum, 0)
    if (orders.length === 1000) {
      for (let start = 1000; start <= 50000; start += 1000) {
        const { data: next, error } = await admin.from('orders')
          .select('status,total')
          .eq('user_id', id)
          .order('created_at', { ascending: false })
          .range(start, start + 999)
        if (error) throw error
        if (start === 50000) {
          if (next?.length) throw new Error('Too many customer orders to load safely.')
          break
        }
        orderCount += next?.length || 0
        completedSpend += (next || []).reduce((sum, order) =>
          COMPLETED_STATUSES.has(String(order.status || '').toLowerCase()) ? sum + Number(order.total || 0) : sum, 0)
        if (!next || next.length < 1000) break
      }
    }

    const distinctDevices = deviceResult.devices
    return NextResponse.json({
      customer: {
        id: user.id,
        name: [metadata.first_name, metadata.last_name].filter(Boolean).join(' ').trim() || null,
        email: user.email || null,
        phone: user.phone || metadata.phone || null,
        createdAt: user.created_at || null,
        lastSignInAt: user.last_sign_in_at || null,
        confirmedAt: user.confirmed_at || user.email_confirmed_at || null,
        bannedUntil: user.banned_until || null,
        metadata: {
          firstName: metadata.first_name || null,
          lastName: metadata.last_name || null,
          phone: metadata.phone || null,
        },
      },
      events: events || [],
      devices: distinctDevices,
      loginCount: eventError || countError || (Boolean(user.last_sign_in_at) && recordedLoginCount === 0)
        ? null
        : recordedLoginCount,
      trackingEnabled: !eventError && !countError && !deviceResult.error,
      loginHistoryLimited: (events || []).length === 200,
      orders: orders.slice(0, 20).map((order) => ({
        id: order.id,
        orderNumber: order.order_number,
        status: order.status,
        total: Number(order.total || 0),
        createdAt: order.created_at,
        itemCount: Array.isArray(order.items) ? order.items.reduce((sum: number, item: any) => sum + (Number(item.quantity) || 0), 0) : 0,
      })),
      orderCount,
      completedSpend,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error: any) {
    console.error('GET /api/admin/login-users/[id] failed.')
    return NextResponse.json({ message: error?.message || 'Unable to load customer details.' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(request)
  if ('response' in gate) return gate.response
  const { id } = await context.params
  if (!UUID_RE.test(id)) return NextResponse.json({ message: 'Invalid customer ID.' }, { status: 400 })

  let body: { disabled?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ message: 'Invalid JSON payload.' }, { status: 400 })
  }
  if (typeof body.disabled !== 'boolean') return NextResponse.json({ message: 'A disabled state is required.' }, { status: 400 })

  try {
    const admin = supabaseAdmin()
    const { data: found, error: lookupError } = await admin.auth.admin.getUserById(id)
    if (lookupError || !found?.user) return NextResponse.json({ message: 'Customer not found.' }, { status: 404 })
    if (isAdminEmail(found.user.email)) {
      return NextResponse.json({ message: 'Administrator accounts cannot be disabled from this screen.' }, { status: 409 })
    }
    const { data, error } = await admin.auth.admin.updateUserById(id, {
      ban_duration: body.disabled ? '876000h' : 'none',
    })
    if (error) throw error
    return NextResponse.json({
      id: data.user.id,
      bannedUntil: data.user.banned_until || null,
      status: data.user.banned_until && Date.parse(data.user.banned_until) > Date.now() ? 'Disabled' : 'Active',
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error: any) {
    console.error('PATCH /api/admin/login-users/[id] failed.')
    return NextResponse.json({ message: error?.message || 'Unable to update account status.' }, { status: 500 })
  }
}
