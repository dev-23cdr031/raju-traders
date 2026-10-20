import { NextRequest, NextResponse } from 'next/server'
import { normalizePackSizes, normalizeVarieties, requireAdmin, supabaseAdmin } from '@/lib/supabase'

// Columns added by later migrations. When one is missing we retry the write
// without it so the edit still lands, and report a warning.
const OPTIONAL_COLUMNS = ['varieties', 'pack_sizes'] as const

const MIGRATION_HINT: Record<string, string> = {
  varieties: 'Varieties were skipped — run supabase/add-varieties.sql in the Supabase SQL editor.',
  pack_sizes: 'Pack sizes were skipped — run supabase/seed-prices.sql in the Supabase SQL editor.',
}

// PATCH /api/products/:id — update product incl. stock toggle (admin only)
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(request)
  if ('response' in gate) return gate.response
  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const patch: Record<string, any> = {}
    if (body.name !== undefined) patch.name = String(body.name)
    if (body.type !== undefined) patch.type = String(body.type)
    if (body.category !== undefined) patch.category = String(body.category)
    if (body.stock !== undefined) patch.stock = Number(body.stock)
    if (body.status !== undefined) patch.status = String(body.status)
    if (body.image !== undefined) patch.image = String(body.image)
    if (body.detail !== undefined) patch.detail = String(body.detail)
    if (body.description !== undefined) patch.detail = String(body.description)
    if (body.rating !== undefined) patch.rating = Number(body.rating)
    if (body.reviews_count !== undefined) patch.reviews_count = Number(body.reviews_count)
    if (body.origin !== undefined) patch.origin = String(body.origin)
    if (body.nutrients !== undefined) patch.nutrients = Array.isArray(body.nutrients) ? body.nutrients.map(String) : []
    if (body.active !== undefined) patch.active = Boolean(body.active)

    // Gram options offered for this product (empty = shop defaults by category).
    if (body.pack_sizes !== undefined || body.packSizes !== undefined) {
      patch.pack_sizes = normalizePackSizes(body.pack_sizes ?? body.packSizes)
    }

    // Varieties hold per-kg prices; keep the legacy `price` column in sync (250 g equivalent).
    if (body.varieties !== undefined || body.perKg !== undefined) {
      const varieties = normalizeVarieties(body.varieties, body.perKg)
      patch.varieties = varieties
      if (varieties[0]?.price) patch.price = Math.round(varieties[0].price / 4)
    } else if (body.price !== undefined) {
      patch.price = Number(body.price)
    }

    if (Object.keys(patch).length === 0) return NextResponse.json({ message: 'Nothing to update.' }, { status: 400 })

    const admin = supabaseAdmin()
    let result = await admin.from('products').update(patch).eq('id', id).select('*').single()
    const warnings: string[] = []

    // A migration may not have been applied yet — drop that column and retry so
    // the rest of the edit still saves.
    for (const column of OPTIONAL_COLUMNS) {
      if (!result.error || !new RegExp(column, 'i').test(result.error.message)) continue
      delete patch[column]
      warnings.push(MIGRATION_HINT[column])
      result = await admin.from('products').update(patch).eq('id', id).select('*').single()
    }
    if (result.error) throw result.error
    return NextResponse.json({ product: result.data, warning: warnings.join(' ') })
  } catch (e: any) {
    console.error('PATCH /api/products/:id error:', e)
    return NextResponse.json({ message: e?.message || 'Failed to update product.' }, { status: 500 })
  }
}

// DELETE /api/products/:id — remove product (admin only)
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(request)
  if ('response' in gate) return gate.response
  try {
    const { id } = await params
    const admin = supabaseAdmin()
    const { error } = await admin.from('products').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('DELETE /api/products/:id error:', e)
    return NextResponse.json({ message: e?.message || 'Failed to delete product.' }, { status: 500 })
  }
}
