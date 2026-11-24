import { NextRequest, NextResponse } from 'next/server'
import { sha256 } from '@/lib/abandoned-carts'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const token = String(body.token || '')
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) {
    return NextResponse.json({ message: 'This unsubscribe link is invalid or has expired.' }, { status: 400 })
  }
  try {
    const admin = supabaseAdmin()
    const { data, error } = await admin.from('abandoned_carts')
      .select('user_id')
      .eq('recovery_token_hash', sha256(token))
      .eq('recovery_email_consent', true)
      .gt('recovery_token_expires_at', new Date().toISOString())
      .is('recovery_redeemed_at', null)
      .maybeSingle()
    if (error) throw error
    if (!data) return NextResponse.json({ message: 'This unsubscribe link is invalid, expired, or already used.' }, { status: 400 })
    const { error: preferenceError } = await admin.rpc('ajr_unsubscribe_cart_reminders', { p_user_id: data.user_id })
    if (preferenceError) throw preferenceError
    return NextResponse.json({ ok: true, message: 'Cart reminder consent has been withdrawn. No further reminders will be sent.' })
  } catch (error) {
    console.error('POST /api/cart/recovery/unsubscribe failed:', error)
    return NextResponse.json({ message: 'Consent could not be updated. Please sign in and turn off cart reminders in your bag.' }, { status: 503 })
  }
}
