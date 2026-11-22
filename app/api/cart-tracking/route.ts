import { NextRequest, NextResponse } from 'next/server'
import { deviceCategory, normalizeTrackedLines, sha256, trackedCartTotal } from '@/lib/abandoned-carts'
import { supabaseAdmin } from '@/lib/supabase'

const capabilityPattern = /^[a-f0-9]{64}$/i

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const capability = String(body.capability || '')
  if (!capabilityPattern.test(capability) || body.consent !== true) {
    return NextResponse.json({ message: 'Explicit anonymous cart-tracking consent is required.' }, { status: 400 })
  }

  const items = normalizeTrackedLines(body.items)
  const itemCount = items.reduce((sum, line) => sum + line.quantity, 0)
  const now = new Date()
  try {
    const admin = supabaseAdmin()
    const { data, error } = await admin.rpc('ajr_guest_cart_tracking', {
      p_token_hash: sha256(capability),
      p_expires_at: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      p_items: items,
      p_cart_total: trackedCartTotal(items),
      p_item_count: itemCount,
      p_device: deviceCategory(request.headers.get('user-agent')),
    })
    if (error) throw error
    if (data !== true) {
      return NextResponse.json({ message: 'Anonymous tracking was declined, expired, or rate-limited. Turn consent off and on to start a new 30-day tracking period.' }, { status: 429 })
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('POST /api/cart-tracking failed:', error)
    return NextResponse.json({ message: 'Anonymous cart tracking is unavailable. Apply supabase/abandoned-carts.sql and try again.' }, { status: 503 })
  }
}

export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const capability = String(body.capability || '')
  if (!capabilityPattern.test(capability)) {
    return NextResponse.json({ message: 'Valid anonymous cart capability required.' }, { status: 400 })
  }
  try {
    const admin = supabaseAdmin()
    const { error } = await admin.from('abandoned_carts')
      .delete()
      .is('user_id', null)
      .eq('guest_token_hash', sha256(capability))
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('DELETE /api/cart-tracking failed:', error)
    return NextResponse.json({ message: 'Anonymous tracking could not be removed.' }, { status: 503 })
  }
}
