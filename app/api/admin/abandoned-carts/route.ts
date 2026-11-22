import { NextRequest, NextResponse } from 'next/server'
import { abandonmentMinutes, matchedOrderItemTotal, orderOverlapsCart, trackedCartTotal } from '@/lib/abandoned-carts'
import { requireAdmin, supabaseAdmin } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request)
  if ('response' in gate) return gate.response

  const now = Date.now()
  const thresholdMs = abandonmentMinutes() * 60_000
  const params = request.nextUrl.searchParams
  const from = params.get('from')
  const to = params.get('to')
  const start = from && !Number.isNaN(Date.parse(from)) ? new Date(from).getTime() : now - 30 * 86400_000
  const end = to && !Number.isNaN(Date.parse(to)) ? new Date(to).getTime() + 86400_000 : now + 1
  const todayStart = new Date()
  todayStart.setUTCHours(0, 0, 0, 0)

  try {
    const admin = supabaseAdmin()
    const { data: rows, error } = await admin.from('abandoned_carts')
      .select('id,user_id,cart_items,cart_total,item_count,customer_name,customer_email,customer_phone,device_category,recovery_email_consent,recovery_email_consent_at,cart_started_at,last_activity_at,closed_at,order_id,reminder_attempt_at,reminder_sent_at,reminder_result,reminder_error,created_at')
      .gt('item_count', 0)
      .order('last_activity_at', { ascending: false })
      .limit(5000)
    if (error) throw error

    const cartRows = rows || []
    const orderIds = Array.from(new Set(cartRows.map((row: any) => row.order_id).filter(Boolean)))
    const ordersById = new Map<string, any>()
    for (let offset = 0; offset < orderIds.length; offset += 400) {
      const { data: orders, error: orderError } = await admin.from('orders')
        .select('id,order_number,status,total,created_at,items')
        .in('id', orderIds.slice(offset, offset + 400))
      if (orderError) throw orderError
      for (const order of orders || []) ordersById.set(order.id, order)
    }

    const carts = cartRows.map((row: any) => {
      const order = row.order_id ? ordersById.get(row.order_id) : null
      const recovered = Boolean(order && String(order.status || '').toLowerCase() !== 'cancelled'
        && orderOverlapsCart(row.cart_items, order.items))
      const lastActivity = new Date(row.last_activity_at).getTime()
      const status = recovered ? 'Recovered' : (lastActivity + thresholdMs > now ? 'Active' : 'Abandoned')
      return {
        id: row.id,
        userId: row.user_id,
        items: row.cart_items,
        itemCount: Number(row.item_count || 0),
        total: Number(row.cart_total || trackedCartTotal(row.cart_items || [])),
        customerName: row.customer_name || '',
        customerEmail: row.customer_email || '',
        customerPhone: row.customer_phone || '',
        guest: !row.user_id,
        device: row.device_category || null,
        consent: Boolean(row.recovery_email_consent),
        consentAt: row.recovery_email_consent_at,
        startedAt: row.cart_started_at,
        lastActivityAt: row.last_activity_at,
        status,
        reminderAttemptAt: row.reminder_attempt_at,
        reminderSentAt: row.reminder_sent_at,
        reminderResult: row.reminder_result,
        reminderError: row.reminder_error,
        order: order ? {
          id: order.id,
          number: order.order_number,
          status: order.status,
          total: Number(order.total || 0),
          createdAt: order.created_at,
          matchedItems: orderOverlapsCart(row.cart_items, order.items),
        } : null,
      }
    })

    const inPeriod = carts.filter((cart: any) => {
      const activity = new Date(cart.lastActivityAt).getTime()
      return cart.itemCount > 0 && activity >= start && activity < end
    })
    const recovered = carts.filter((cart: any) => cart.status === 'Recovered')
    const abandoned = carts.filter((cart: any) => cart.status === 'Abandoned')
    const abandonedToday = abandoned.filter((cart: any) => {
      const abandonedAt = new Date(cart.lastActivityAt).getTime() + thresholdMs
      return abandonedAt >= todayStart.getTime() && abandonedAt <= now
    }).length
    const recoveredRevenue = recovered.reduce((sum: number, cart: any) => {
      const order = cart.order ? ordersById.get(cart.order.id) : null
      return sum + matchedOrderItemTotal(cart.items, order?.items)
    }, 0)
    const conversionCount = inPeriod.filter((cart: any) => cart.status === 'Recovered').length
    const abandonmentCount = inPeriod.filter((cart: any) => cart.status === 'Abandoned').length

    return NextResponse.json({
      carts,
      metrics: {
        abandonedCount: abandoned.length,
        abandonedToday,
        abandonedValue: abandoned.reduce((sum: number, cart: any) => sum + cart.total, 0),
        abandonmentRate: inPeriod.length ? Math.round((abandonmentCount / inPeriod.length) * 1000) / 10 : 0,
        recoveredCount: recovered.length,
        recoveredRevenue,
        periodCartCount: inPeriod.length,
        periodAbandonedCount: abandonmentCount,
        periodRecoveredCount: conversionCount,
        thresholdMinutes: abandonmentMinutes(),
        trackedRecords: cartRows.length,
        truncated: cartRows.length === 5000,
        emailConfigured: Boolean(process.env.RESEND_API_KEY) && process.env.NOTIFICATIONS_EMAIL_ENABLED !== 'false',
      },
    })
  } catch (error: any) {
    console.error('GET /api/admin/abandoned-carts error:', error)
    return NextResponse.json({
      message: error?.message?.includes('abandoned_carts')
        ? 'Abandoned-cart storage is not set up. Apply supabase/abandoned-carts.sql.'
        : 'Could not load abandoned carts.',
    }, { status: 503 })
  }
}
