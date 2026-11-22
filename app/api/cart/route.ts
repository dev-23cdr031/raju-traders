import { NextRequest, NextResponse } from 'next/server'
import { requireUser, supabaseAdmin, CartLine } from '@/lib/supabase'
import { persistSignedInCartSnapshot } from '@/lib/abandoned-carts'

// Cart lines are plain JSON: { product: {...}, quantity: n }.
// Keep only well-formed lines and cap the quantity so a bad payload can't
// poison a customer's stored cart.
function cleanLines(input: unknown): CartLine[] {
  const list = Array.isArray(input) ? input : []
  return list
    .filter((line: any) => line && line.product && Number(line.quantity) > 0)
    .slice(0, 60)
    .map((line: any) => ({
      product: line.product,
      quantity: Math.min(99, Math.max(1, Math.floor(Number(line.quantity)))),
    }))
}

// GET /api/cart — the logged-in customer's own cart (never anyone else's).
export async function GET(request: NextRequest) {
  const gate = await requireUser(request)
  if ('response' in gate) return gate.response
  try {
    const admin = supabaseAdmin()
    const { data, error } = await admin.from('carts').select('items').eq('user_id', gate.user.id).maybeSingle()
    if (error) throw error
    let recoveryEmailConsent = false
    try {
      const { data: tracking } = await admin.from('abandoned_carts')
        .select('recovery_email_consent')
        .eq('user_id', gate.user.id)
        .is('closed_at', null)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      recoveryEmailConsent = Boolean(tracking?.recovery_email_consent)
    } catch (trackingError) {
      console.error('GET /api/cart reminder preference unavailable:', trackingError)
    }
    return NextResponse.json({ items: cleanLines(data?.items), recoveryEmailConsent })
  } catch (e: any) {
    console.error('GET /api/cart error:', e)
    return NextResponse.json(
      { message: e?.message || 'Run supabase/customer-features.sql in the Supabase SQL editor first.' },
      { status: 500 }
    )
  }
}

// PUT /api/cart — replace the logged-in customer's cart.
export async function PUT(request: NextRequest) {
  const gate = await requireUser(request)
  if ('response' in gate) return gate.response
  try {
    const body = await request.json().catch(() => ({}))
    const items = cleanLines(body.items)
    const admin = supabaseAdmin()
    const { error } = await admin.from('carts').upsert({
      user_id: gate.user.id,
      items,
      updated_at: new Date().toISOString(),
    })
    if (error) throw error
    try {
      await persistSignedInCartSnapshot({
        admin,
        user: gate.user,
        items,
        userAgent: request.headers.get('user-agent'),
      })
    } catch (trackingError) {
      console.error('PUT /api/cart tracking snapshot failed:', trackingError)
    }
    return NextResponse.json({ items })
  } catch (e: any) {
    console.error('PUT /api/cart error:', e)
    return NextResponse.json(
      { message: e?.message || 'Run supabase/customer-features.sql in the Supabase SQL editor first.' },
      { status: 500 }
    )
  }
}

// DELETE /api/cart — empty the logged-in customer's cart.
export async function DELETE(request: NextRequest) {
  const gate = await requireUser(request)
  if ('response' in gate) return gate.response
  try {
    const admin = supabaseAdmin()
    const { error } = await admin.from('carts').upsert({
      user_id: gate.user.id,
      items: [],
      updated_at: new Date().toISOString(),
    })
    if (error) throw error
    try {
      await persistSignedInCartSnapshot({
        admin,
        user: gate.user,
        items: [],
        userAgent: request.headers.get('user-agent'),
      })
    } catch (trackingError) {
      console.error('DELETE /api/cart tracking snapshot failed:', trackingError)
    }
    return NextResponse.json({ items: [] })
  } catch (e: any) {
    console.error('DELETE /api/cart error:', e)
    return NextResponse.json({ message: e?.message || 'Failed to clear cart.' }, { status: 500 })
  }
}
