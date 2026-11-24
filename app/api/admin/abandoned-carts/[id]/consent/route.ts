import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, supabaseAdmin } from '@/lib/supabase'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(request)
  if ('response' in gate) return gate.response

  const { id } = await params
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ message: 'Invalid cart reference.' }, { status: 400 })
  }

  const body = await request.json().catch(() => ({}))
  if (body.consent !== false) {
    return NextResponse.json({ message: 'This action only revokes cart reminder consent.' }, { status: 400 })
  }

  try {
    const admin = supabaseAdmin()
    const { data, error } = await admin.from('abandoned_carts')
      .select('id,user_id')
      .eq('id', id)
      .maybeSingle()
    if (error) throw error
    if (!data) return NextResponse.json({ message: 'This cart is no longer available.' }, { status: 404 })
    if (!data.user_id) return NextResponse.json({ message: 'Anonymous carts have no email preference.' }, { status: 409 })
    const { error: preferenceError } = await admin.rpc('ajr_unsubscribe_cart_reminders', { p_user_id: data.user_id })
    if (preferenceError) throw preferenceError
    return NextResponse.json({ ok: true, message: 'Cart reminder consent revoked. Recovery email capability is disabled.' })
  } catch (error) {
    console.error('POST /api/admin/abandoned-carts/[id]/consent failed:', error)
    return NextResponse.json({ message: 'Consent could not be revoked. The server state was not changed.' }, { status: 503 })
  }
}
