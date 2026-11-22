import { NextRequest, NextResponse } from 'next/server'
import { normalizePackSizes, normalizeVarieties, requireAdmin, supabaseAdmin } from '@/lib/supabase'

// Columns added by later migrations. When one is missing we retry the write
// without it so the edit still lands, and report a warning.
const OPTIONAL_COLUMNS = ['varieties', 'pack_sizes', 'benefits', 'ingredients', 'seo_title', 'seo_description'] as const

const MIGRATION_HINT: Record<string, string> = {
  varieties: 'Varieties were skipped — run supabase/add-varieties.sql in the Supabase SQL editor.',
  pack_sizes: 'Pack sizes were skipped — run supabase/seed-prices.sql in the Supabase SQL editor.',
  benefits: 'Product content fields were skipped — run supabase/website-content-manager.sql in the Supabase SQL editor.',
  ingredients: 'Product content fields were skipped — run supabase/website-content-manager.sql in the Supabase SQL editor.',
  seo_title: 'Product SEO fields were skipped — run supabase/website-content-manager.sql in the Supabase SQL editor.',
  seo_description: 'Product SEO fields were skipped — run supabase/website-content-manager.sql in the Supabase SQL editor.',
}

const INVENTORY_STATUSES = new Set(['In stock', 'Low stock', 'Out of stock'])
const textList = (value: unknown) => Array.isArray(value)
  ? value.map((item) => String(item ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 160)).filter(Boolean).slice(0, 100)
  : []

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
    if (body.stock !== undefined) {
      if ((typeof body.stock !== 'number' && typeof body.stock !== 'string') || (typeof body.stock === 'string' && body.stock.trim() === '')) {
        return NextResponse.json({ message: 'Stock must be a finite, non-negative whole number.' }, { status: 400 })
      }
      const stock = Number(body.stock)
      if (!Number.isFinite(stock) || !Number.isInteger(stock) || stock < 0) {
        return NextResponse.json({ message: 'Stock must be a finite, non-negative whole number.' }, { status: 400 })
      }
      patch.stock = stock
    }
    if (body.status !== undefined) {
      const status = String(body.status)
      if (!INVENTORY_STATUSES.has(status)) {
        return NextResponse.json({ message: 'Status must be In stock, Low stock, or Out of stock.' }, { status: 400 })
      }
      patch.status = status
    }
    if (patch.status && patch.stock !== undefined && patch.status !== 'Out of stock' && patch.stock < 1) {
      return NextResponse.json({ message: String(patch.status) + ' products need at least one unit of stock.' }, { status: 400 })
    }
    if (body.image !== undefined) patch.image = String(body.image)
    if (body.detail !== undefined) patch.detail = String(body.detail)
    if (body.description !== undefined) patch.detail = String(body.description)
    if (body.rating !== undefined) {
      const rating = Number(body.rating)
      if (!Number.isFinite(rating) || rating < 0 || rating > 5) {
        return NextResponse.json({ message: 'Rating must be between 0 and 5.' }, { status: 400 })
      }
      patch.rating = rating
    }
    if (body.reviews_count !== undefined || body.reviewsCount !== undefined) {
      const reviewsCount = Number(body.reviews_count ?? body.reviewsCount)
      if (!Number.isFinite(reviewsCount) || !Number.isInteger(reviewsCount) || reviewsCount < 0) {
        return NextResponse.json({ message: 'Review count must be a non-negative whole number.' }, { status: 400 })
      }
      patch.reviews_count = reviewsCount
    }
    if (body.origin !== undefined) patch.origin = String(body.origin)
    if (body.nutrients !== undefined) patch.nutrients = Array.isArray(body.nutrients) ? body.nutrients.map(String) : []
    if (body.benefits !== undefined) patch.benefits = textList(body.benefits)
    if (body.ingredients !== undefined) patch.ingredients = textList(body.ingredients)
    if (body.seo_title !== undefined) patch.seo_title = String(body.seo_title || '').trim().slice(0, 70)
    if (body.seo_description !== undefined) patch.seo_description = String(body.seo_description || '').trim().slice(0, 320)
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
    // Validate against the effective product state, including partial PATCH
    // payloads. This prevents a stock-only request from leaving an item marked
    // In stock (or Low stock) with zero units.
    if (patch.status !== undefined || patch.stock !== undefined) {
      const { data: current, error: currentError } = await admin.from('products').select('stock, status').eq('id', id).single()
      if (currentError) throw currentError
      const currentStock = Number(current?.stock)
      const currentStatus = String(current?.status || (currentStock <= 0 ? 'Out of stock' : 'In stock'))
      const effectiveStock = patch.stock === undefined ? currentStock : patch.stock
      const effectiveStatus = patch.status === undefined ? currentStatus : patch.status
      if (effectiveStatus !== 'Out of stock' && (!Number.isInteger(effectiveStock) || effectiveStock < 1)) {
        return NextResponse.json({ message: String(effectiveStatus) + ' products need at least one unit of stock.' }, { status: 400 })
      }
    }
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
