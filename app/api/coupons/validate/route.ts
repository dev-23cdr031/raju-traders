import { NextRequest, NextResponse } from 'next/server'
import { CouponCartValidationError, quoteCoupon } from '@/lib/coupon-pricing'
import { optionalUser, supabaseAdmin } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const user = await optionalUser(request)
    if (!user) return NextResponse.json({ message: 'Sign in to use a coupon.' }, { status: 401 })
    const body = await request.json().catch(() => ({}))
    const code = String(body.code || '').trim().toUpperCase()
    if (!/^[A-Z0-9_-]{3,40}$/.test(code)) {
      return NextResponse.json({ message: 'Enter a valid coupon code.' }, { status: 400 })
    }

    const { items, quote } = await quoteCoupon(supabaseAdmin(), code, user.id, body.items)
    if (quote?.error) return NextResponse.json({ message: String(quote.error) }, { status: 400 })
    return NextResponse.json({
      quote,
      items,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error: any) {
    console.error('POST /api/coupons/validate failed:', error)
    if (error instanceof CouponCartValidationError) {
      return NextResponse.json({ message: error.message }, { status: 400 })
    }
    return NextResponse.json({
      message: 'Coupon validation is temporarily unavailable.',
    }, { status: 503 })
  }
}
