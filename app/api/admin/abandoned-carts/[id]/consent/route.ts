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
    const now = new Date().toISOString()
    const { data, error } = await admin.from('abandoned_carts')
      .update({
        recovery_email_consent: false,
        recovery_email_consent_at: null,
        recovery_token_hash: null,
        recovery_token_expires_at: null,
        recovery_redeemed_at: null,
        updated_at: now,
      })
      .eq('id', id)
      .eq('recovery_email_consent', true)
      .select('id')
      .maybeSingle()

    if (error) throw error
    if (!data) {
      const { data: existing, error: lookupError } = await admin.from('abandoned_carts')
        .select('id')
        .eq('id', id)
        .maybeSingle()
      if (lookupError) throw lookupError
      if (!existing) return NextResponse.json({ message: 'This cart is no longer available.' }, { status: 404 })
      return NextResponse.json({ ok: true, message: 'Cart reminder consent is already revoked.' })
    }

    return NextResponse.json({ ok: true, message: 'Cart reminder consent revoked. Recovery email capability is disabled.' })
  } catch (error) {
    console.error('POST /api/admin/abandoned-carts/[id]/consent failed:', error)
    return NextResponse.json({ message: 'Consent could not be revoked. The server state was not changed.' }, { status: 503 })
  }
}
