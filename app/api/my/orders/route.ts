import { NextRequest, NextResponse } from 'next/server'
import { requireUser, supabaseAdmin } from '@/lib/supabase'

// GET /api/my/orders — only the orders belonging to the signed-in customer.
// Scoped by user_id taken from the access token, so one customer can never
// read another customer's orders.
export async function GET(request: NextRequest) {
  const gate = await requireUser(request)
  if ('response' in gate) return gate.response
  try {
    const admin = supabaseAdmin()
    const { data, error } = await admin
      .from('orders')
      .select('*')
      .eq('user_id', gate.user.id)
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) throw error
    return NextResponse.json({ orders: data ?? [] })
  } catch (e: any) {
    console.error('GET /api/my/orders error:', e)
    return NextResponse.json({ message: e?.message || 'Failed to load your orders.' }, { status: 500 })
  }
}
