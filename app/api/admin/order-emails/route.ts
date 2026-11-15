import { NextRequest, NextResponse } from 'next/server'
import { sendOrderConfirmationEmail } from '@/lib/order-email'
import { requireAdmin, supabaseAdmin } from '@/lib/supabase'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

// POST /api/admin/order-emails — a guarded resend/test action for an order
// already stored in Supabase. The client is intentionally never allowed to
// supply a recipient, email body, API key, or arbitrary order data.
export async function POST(request: NextRequest) {
  const gate = await requireAdmin(request)
  if ('response' in gate) return gate.response

  try {
    const body = await request.json().catch(() => ({}))
    const orderId = String(body.orderId || '').trim()
    const mode = body.mode === 'preview' ? 'preview' : 'customer'
    if (!UUID.test(orderId)) return NextResponse.json({ message: 'Choose a valid saved order.' }, { status: 400 })

    const { data: order, error } = await supabaseAdmin().from('orders').select('*').eq('id', orderId).maybeSingle()
    if (error) throw error
    if (!order) return NextResponse.json({ message: 'That order could not be found.' }, { status: 404 })
    if (String(order.status || '').toLowerCase() === 'cancelled') {
      return NextResponse.json({ message: 'Cancelled orders cannot receive a confirmation email.' }, { status: 409 })
    }
    if (mode === 'customer' && !String(order.email || '').trim()) {
      return NextResponse.json({ message: 'This order has no customer email address.' }, { status: 400 })
    }
    const previewRecipient = String(gate.user.email || '').trim().toLowerCase()
    if (mode === 'preview' && !previewRecipient) {
      return NextResponse.json({ message: 'Your administrator email is unavailable for a preview.' }, { status: 400 })
    }

    const result = await sendOrderConfirmationEmail(order, mode === 'preview' ? previewRecipient : undefined)
    if (result.skipped) return NextResponse.json({ message: result.reason || 'Email delivery is not configured.' }, { status: 503 })
    return NextResponse.json({
      message: mode === 'preview' ? `Preview email sent to ${previewRecipient}.` : `Confirmation email sent to ${String(order.email).trim()}.`,
      messageId: result.id,
    })
  } catch (error: any) {
    console.error('POST /api/admin/order-emails error:', error)
    return NextResponse.json({ message: error?.message || 'Could not send the order email.' }, { status: 500 })
  }
}
