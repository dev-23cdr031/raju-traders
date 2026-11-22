import { NextRequest, NextResponse } from 'next/server'
import { couponStatus, normalizeCouponInput, writeCouponAudit } from '@/lib/coupon-admin'
import { requireAdmin, supabaseAdmin } from '@/lib/supabase'

function istDateKey(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value || ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

function recentISTDateKeys(count: number) {
  const today = istDateKey(new Date().toISOString())
  const [year, month, day] = today.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return Array.from({ length: count }, (_, index) => {
    const result = new Date(date)
    result.setUTCDate(result.getUTCDate() - (count - index - 1))
    return result.toISOString().slice(0, 10)
  })
}

export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request)
  if ('response' in gate) return gate.response

  try {
    const admin = supabaseAdmin()
    const [couponResult, redemptionResult] = await Promise.all([
      admin.from('coupons').select('*').order('created_at', { ascending: false }).limit(1000),
      admin.from('coupon_redemptions').select('*').order('redeemed_at', { ascending: false }).limit(5000),
    ])
    if (couponResult.error) throw couponResult.error
    if (redemptionResult.error) throw redemptionResult.error

    const redemptions = redemptionResult.data || []
    const orderIds = Array.from(new Set(redemptions.map((row: any) => row.order_id).filter(Boolean)))
    const orderById = new Map<string, any>()
    for (let offset = 0; offset < orderIds.length; offset += 400) {
      const { data, error } = await admin.from('orders')
        .select('id,status,payment_status,total,created_at')
        .in('id', orderIds.slice(offset, offset + 400))
      if (error) throw error
      for (const order of data || []) orderById.set(order.id, order)
    }

    const withOrders = redemptions.map((row: any) => ({
      ...row,
      order_status: orderById.get(row.order_id)?.status || 'Not recorded',
      payment_status: orderById.get(row.order_id)?.payment_status || 'Not recorded',
      final_total: Number(row.final_total || orderById.get(row.order_id)?.total || 0),
    }))
    const successful = withOrders.filter((row: any) =>
      row.status === 'redeemed'
      && String(row.order_status).toLowerCase() !== 'cancelled'
      && String(row.payment_status).toLowerCase() !== 'refunded')
    const successfulByCoupon = new Map<string, number>()
    for (const row of successful) successfulByCoupon.set(row.coupon_id, (successfulByCoupon.get(row.coupon_id) || 0) + 1)

    const now = Date.now()
    const coupons = (couponResult.data || []).map((coupon: any) => ({
      ...coupon,
      status: couponStatus(coupon, now),
      redemption_count: successfulByCoupon.get(coupon.id) || 0,
    }))
    const counts = {
      total: coupons.length,
      active: coupons.filter((coupon: any) => coupon.status === 'Active').length,
      inactive: coupons.filter((coupon: any) => coupon.status === 'Inactive').length,
      scheduled: coupons.filter((coupon: any) => coupon.status === 'Scheduled').length,
      expired: coupons.filter((coupon: any) => coupon.status === 'Expired').length,
      successfulRedemptions: successful.length,
      discountTotal: successful.reduce((sum: number, row: any) =>
        sum + Number(row.discount_amount || 0) + Number(row.shipping_discount_amount || 0), 0),
      couponOrderValue: successful.reduce((sum: number, row: any) => sum + Number(row.final_total || 0), 0),
      averageOrderValue: successful.length
        ? successful.reduce((sum: number, row: any) => sum + Number(row.final_total || 0), 0) / successful.length
        : 0,
      conversionRate: null,
      mostPopularCoupon: coupons
        .filter((coupon: any) => coupon.redemption_count > 0)
        .sort((a: any, b: any) => b.redemption_count - a.redemption_count)[0]?.code || null,
      leastPopularCoupon: coupons
        .filter((coupon: any) => coupon.status === 'Active')
        .sort((a: any, b: any) => a.redemption_count - b.redemption_count)[0]?.code || null,
      truncated: couponResult.data?.length === 1000 || redemptionResult.data?.length === 5000,
    }

    const dayTotals = new Map<string, { redemptions: number; discount: number; orderValue: number }>()
    const productTotals = new Map<string, { quantity: number; orderValue: number }>()
    for (const redemption of successful) {
      const day = istDateKey(String(redemption.redeemed_at || ''))
      if (day) {
        const currentDay = dayTotals.get(day) || { redemptions: 0, discount: 0, orderValue: 0 }
        dayTotals.set(day, {
          redemptions: currentDay.redemptions + 1,
          discount: currentDay.discount + Number(redemption.discount_amount || 0) + Number(redemption.shipping_discount_amount || 0),
          orderValue: currentDay.orderValue + Number(redemption.final_total || 0),
        })
      }
      for (const item of Array.isArray(redemption.items_snapshot) ? redemption.items_snapshot : []) {
        const key = String(item.name || 'AJR product')
        const quantity = Math.max(0, Number(item.quantity) || 0)
        const value = Math.max(0, Number(item.price) || 0) * quantity
        const current = productTotals.get(key) || { quantity: 0, orderValue: 0 }
        productTotals.set(key, { quantity: current.quantity + quantity, orderValue: current.orderValue + value })
      }
    }
    const usageByDate = recentISTDateKeys(14).map((key) => ({
      date: key,
      ...(dayTotals.get(key) || { redemptions: 0, discount: 0, orderValue: 0 }),
    }))

    return NextResponse.json({
      coupons,
      redemptions: withOrders,
      metrics: counts,
      usageByDate,
      productPerformance: Array.from(productTotals.entries())
        .map(([name, value]) => ({ name, ...value }))
        .sort((a, b) => b.orderValue - a.orderValue)
        .slice(0, 8),
      attributionNote: 'Coupon order value is the final order total on recorded redemptions; it is not incremental revenue.',
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error: any) {
    console.error('GET /api/admin/coupons failed:', error)
    return NextResponse.json({
      message: error?.message?.includes('coupon')
        ? 'Coupon storage is not ready. Apply supabase/coupons-offers.sql.'
        : 'Could not load coupon records.',
    }, { status: 503 })
  }
}

export async function POST(request: NextRequest) {
  const gate = await requireAdmin(request)
  if ('response' in gate) return gate.response

  try {
    const body = await request.json().catch(() => ({}))
    const payload = normalizeCouponInput(body, gate.user.email || '')
    const admin = supabaseAdmin()
    const { data, error } = await admin.from('coupons')
      .insert({ ...payload, created_by: gate.user.email || '' })
      .select('*')
      .single()
    if (error) {
      if (/duplicate key/i.test(error.message)) return NextResponse.json({ message: 'That coupon code already exists.' }, { status: 409 })
      throw error
    }
    let warning = ''
    try {
      await writeCouponAudit(admin, {
        couponId: data.id,
        code: data.code,
        adminEmail: gate.user.email || '',
        action: 'created',
        changes: payload,
      })
    } catch (auditError) {
      console.error('Coupon was created, but its audit event could not be saved:', auditError)
      warning = 'Coupon saved, but the audit event could not be recorded.'
    }
    return NextResponse.json({ coupon: data, warning }, { status: 201 })
  } catch (error: any) {
    console.error('POST /api/admin/coupons failed:', error)
    return NextResponse.json({ message: error?.message || 'Could not create coupon.' }, { status: 400 })
  }
}
