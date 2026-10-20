import { NextRequest, NextResponse } from 'next/server'
import { ORDER_STATUSES, PAYMENT_STATUSES, requireAdmin, supabaseAdmin } from '@/lib/supabase'

// PATCH /api/orders/:id — update order status / payment status (admin only).
// The customer's My Orders page reads the same row, so the new status shows up
// there automatically on their next load.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(request)
  if ('response' in gate) return gate.response
  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))

    const patch: Record<string, any> = {}
    if (body.status !== undefined) {
      const status = String(body.status || '').trim()
      if (!ORDER_STATUSES.includes(status as any)) {
        return NextResponse.json({ message: 'Invalid status.' }, { status: 400 })
      }
      patch.status = status
    }
    if (body.payment_status !== undefined) {
      const paymentStatus = String(body.payment_status || '').trim()
      if (!PAYMENT_STATUSES.includes(paymentStatus as any)) {
        return NextResponse.json({ message: 'Invalid payment status.' }, { status: 400 })
      }
      patch.payment_status = paymentStatus
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ message: 'Nothing to update.' }, { status: 400 })
    }
    patch.updated_at = new Date().toISOString()

    const admin = supabaseAdmin()
    const { data, error } = await admin.from('orders').update(patch).eq('id', id).select('*').single()
    if (error) throw error
    return NextResponse.json({ order: data })
  } catch (e: any) {
    console.error('PATCH /api/orders/:id error:', e)
    const msg = String(e?.message || '')
    if (/does not exist/i.test(msg)) {
      return NextResponse.json(
        { message: 'Database not upgraded yet — run supabase/customer-features.sql in the Supabase SQL editor.' },
        { status: 500 }
      )
    }
    return NextResponse.json({ message: e?.message || 'Failed to update order.' }, { status: 500 })
  }
}

// DELETE /api/orders/:id — delete an order (admin only)
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(request)
  if ('response' in gate) return gate.response
  try {
    const { id } = await params
    const admin = supabaseAdmin()
    const { error } = await admin.from('orders').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('DELETE /api/orders/:id error:', e)
    return NextResponse.json({ message: e?.message || 'Failed to delete order.' }, { status: 500 })
  }
}
