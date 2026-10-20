import { NextRequest, NextResponse } from 'next/server'
import { requireUser, supabaseAdmin } from '@/lib/supabase'

// Wishlist entries are full product snapshots (same shape the shop keeps in
// state), de-duplicated by product id so one product can never be saved twice.
function cleanWishlist(input: unknown): any[] {
  const list = Array.isArray(input) ? input : []
  const seen = new Set<string>()
  const out: any[] = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const key = String((item as any).id ?? '')
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out.slice(0, 100)
}

// GET /api/wishlist — the logged-in customer's own saved products.
export async function GET(request: NextRequest) {
  const gate = await requireUser(request)
  if ('response' in gate) return gate.response
  try {
    const admin = supabaseAdmin()
    const { data, error } = await admin
      .from('wishlists')
      .select('items')
      .eq('user_id', gate.user.id)
      .maybeSingle()
    if (error) throw error
    return NextResponse.json({ items: cleanWishlist(data?.items) })
  } catch (e: any) {
    console.error('GET /api/wishlist error:', e)
    return NextResponse.json(
      { message: e?.message || 'Run supabase/customer-features.sql in the Supabase SQL editor first.' },
      { status: 500 }
    )
  }
}

// PUT /api/wishlist — replace the logged-in customer's wishlist.
export async function PUT(request: NextRequest) {
  const gate = await requireUser(request)
  if ('response' in gate) return gate.response
  try {
    const body = await request.json().catch(() => ({}))
    const items = cleanWishlist(body.items)
    const admin = supabaseAdmin()
    const { error } = await admin.from('wishlists').upsert({
      user_id: gate.user.id,
      items,
      updated_at: new Date().toISOString(),
    })
    if (error) throw error
    return NextResponse.json({ items })
  } catch (e: any) {
    console.error('PUT /api/wishlist error:', e)
    return NextResponse.json(
      { message: e?.message || 'Run supabase/customer-features.sql in the Supabase SQL editor first.' },
      { status: 500 }
    )
  }
}
