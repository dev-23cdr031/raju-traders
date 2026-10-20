import { NextRequest, NextResponse } from 'next/server'
import { requireUser, supabaseAdmin } from '@/lib/supabase'

// GET /api/my/orders/:id — full detail for ONE of the signed-in customer's orders.
// 404 if the order does not exist or belongs to somebody else (never leak
// whether another customer's order id exists).
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireUser(request)
  if ('response' in gate) return gate.response
  try {
    const { id } = await params
    const admin = supabaseAdmin()
    const { data, error } = await admin
      .from('orders')
      .select('*')
      .eq('id', id)
      .eq('user_id', gate.user.id)
      .maybeSingle()
    if (error) throw error
    if (!data) return NextResponse.json({ message: 'Order not found.' }, { status: 404 })
    return NextResponse.json({ order: data })
  } catch (e: any) {
    console.error('GET /api/my/orders/:id error:', e)
    return NextResponse.json({ message: e?.message || 'Failed to load the order.' }, { status: 500 })
  }
}
