import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, supabaseAdmin } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request)
  if ('response' in gate) return gate.response
  const params = request.nextUrl.searchParams
  const from = params.get('from')
  const to = params.get('to')
  const couponId = params.get('couponId')
  const datePattern = /^\d{4}-\d{2}-\d{2}$/
  if ((from && !datePattern.test(from)) || (to && !datePattern.test(to))) {
    return NextResponse.json({ message: 'Dates must use YYYY-MM-DD format.' }, { status: 400 })
  }
  const fromDate = from ? new Date(`${from}T00:00:00+05:30`) : null
  const toDate = to ? new Date(`${to}T00:00:00+05:30`) : null
  if ((fromDate && Number.isNaN(fromDate.getTime())) || (toDate && Number.isNaN(toDate.getTime()))) {
    return NextResponse.json({ message: 'Choose a valid date.' }, { status: 400 })
  }
  if (from && to && from > to) {
    return NextResponse.json({ message: 'The start date must be on or before the end date.' }, { status: 400 })
  }
  if (couponId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(couponId)) {
    return NextResponse.json({ message: 'Invalid coupon filter.' }, { status: 400 })
  }

  try {
    const admin = supabaseAdmin()
    let query = admin.from('coupon_redemptions').select('*')
      .order('redeemed_at', { ascending: false }).limit(5000)
    if (fromDate) query = query.gte('redeemed_at', fromDate.toISOString())
    if (toDate) {
      const endExclusive = new Date(toDate)
      endExclusive.setUTCDate(endExclusive.getUTCDate() + 1)
      query = query.lt('redeemed_at', endExclusive.toISOString())
    }
    if (couponId) query = query.eq('coupon_id', couponId)
    const { data, error } = await query
    if (error) throw error
    const rows = data || []
    const orderIds = rows.map((row: any) => row.order_id).filter(Boolean)
    const orderById = new Map<string, any>()
    for (let offset = 0; offset < orderIds.length; offset += 400) {
      const { data: orders, error: orderError } = await admin.from('orders')
        .select('id,status,payment_status,total')
        .in('id', orderIds.slice(offset, offset + 400))
      if (orderError) throw orderError
      for (const order of orders || []) orderById.set(order.id, order)
    }
    return NextResponse.json({
      redemptions: rows.map((row: any) => ({
        ...row,
        order_status: orderById.get(row.order_id)?.status || 'Not recorded',
        payment_status: orderById.get(row.order_id)?.payment_status || 'Not recorded',
        final_total: Number(row.final_total || orderById.get(row.order_id)?.total || 0),
      })),
      truncated: rows.length === 5000,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('GET /api/admin/coupons/redemptions failed:', error)
    return NextResponse.json({ message: 'Could not load coupon redemption history.' }, { status: 503 })
  }
}
