import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { associatePersistedOrder } from '@/lib/abandoned-carts'
import { dispatchOrderNotifications } from '@/lib/notification-automation'

const valid = (value: string | null) => {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET || ''
  if (!secret || !value) return false
  const expected = Buffer.from('Bearer ' + secret)
  const supplied = Buffer.from(value)
  return expected.length === supplied.length && timingSafeEqual(expected, supplied)
}

// Payment providers call this only after their own signature verification
// adapter has authenticated the transaction. It is intentionally server-only.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!valid(request.headers.get('authorization'))) return NextResponse.json({ message: 'Not found.' }, { status: 404 })
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ message: 'Invalid order.' }, { status: 400 })
  try {
    const admin = supabaseAdmin()
    const { data: order, error } = await admin.from('orders').update({ payment_status: 'Paid', status: 'Confirmed', updated_at: new Date().toISOString() })
      .eq('id', id).neq('status', 'Cancelled').select('*').maybeSingle()
    if (error || !order) return NextResponse.json({ message: 'Order was not found.' }, { status: 404 })
    await Promise.allSettled([associatePersistedOrder(admin, order), dispatchOrderNotifications(admin, order)])
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Payment confirmation failed:', error)
    return NextResponse.json({ message: 'Payment confirmation could not be recorded.' }, { status: 503 })
  }
}
