import { NextRequest, NextResponse } from 'next/server'
import { sendOrderConfirmationSms } from '@/lib/order-sms'
import { requireAdmin, supabaseAdmin } from '@/lib/supabase'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

// POST /api/admin/order-sms — template-only sender. The browser supplies only
// an existing order ID; recipient, variables and provider credentials stay server-side.
export async function POST(request: NextRequest) {
  const gate = await requireAdmin(request)
  if ('response' in gate) return gate.response

  try {
    const body = await request.json().catch(() => ({}))
    const orderId = String(body.orderId || '').trim()
    if (!UUID.test(orderId)) return NextResponse.json({ message: 'Choose a valid saved order.' }, { status: 400 })

    const { data: order, error } = await supabaseAdmin().from('orders').select('*').eq('id', orderId).maybeSingle()
    if (error) throw error
    if (!order) return NextResponse.json({ message: 'That order could not be found.' }, { status: 404 })
    if (String(order.status || '').toLowerCase() === 'cancelled') return NextResponse.json({ message: 'Cancelled orders cannot receive a confirmation SMS.' }, { status: 409 })
    if (!String(order.phone || '').trim()) return NextResponse.json({ message: 'This order has no customer mobile number.' }, { status: 400 })

    const result = await sendOrderConfirmationSms(order)
    if (result.skipped) return NextResponse.json({ message: result.reason || 'SMS delivery is not configured.' }, { status: 503 })
    return NextResponse.json({ message: `SMS confirmation submitted for ${String(order.phone).trim()}.`, messageId: result.id })
  } catch (error: any) {
    console.error('POST /api/admin/order-sms error:', error)
    return NextResponse.json({ message: error?.message || 'Could not send the order SMS.' }, { status: 500 })
  }
}
