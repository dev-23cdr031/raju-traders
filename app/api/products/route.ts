import { NextRequest, NextResponse } from 'next/server'
import { normalizePackSizes, normalizeVarieties, requireAdmin, supabaseAdmin } from '@/lib/supabase'

// Columns added by later migrations. When one is missing we retry the write
// without it so the product still reaches the shop, and report a warning.
const OPTIONAL_COLUMNS = ['varieties', 'pack_sizes', 'benefits', 'ingredients', 'seo_title', 'seo_description'] as const

const MIGRATION_HINT: Record<string, string> = {
  varieties: 'varieties were skipped — run supabase/add-varieties.sql in the Supabase SQL editor.',
  pack_sizes: 'pack sizes were skipped — run supabase/seed-prices.sql in the Supabase SQL editor.',
  benefits: 'product content fields were skipped — run supabase/website-content-manager.sql in the Supabase SQL editor.',
  ingredients: 'product content fields were skipped — run supabase/website-content-manager.sql in the Supabase SQL editor.',
  seo_title: 'product SEO fields were skipped — run supabase/website-content-manager.sql in the Supabase SQL editor.',
  seo_description: 'product SEO fields were skipped — run supabase/website-content-manager.sql in the Supabase SQL editor.',
}

const textList = (value: unknown) => Array.isArray(value)
  ? value.map((item) => String(item ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 160)).filter(Boolean).slice(0, 100)
  : []

// GET /api/products — public catalogue; admins may request inactive products too.
export async function GET(request: NextRequest) {
  const includeInactive = request.nextUrl.searchParams.get('includeInactive') === 'true'
  if (includeInactive) {
    const gate = await requireAdmin(request)
    if ('response' in gate) return gate.response
  }

  try {
    const admin = supabaseAdmin()
    let query = admin.from('products').select('*').order('id', { ascending: true })
    if (!includeInactive) query = query.eq('active', true)
    const { data, error } = await query
    if (error) throw error
    return NextResponse.json({ products: data ?? [] })
  } catch (e: any) {
    console.error('GET /api/products error:', e)
    return NextResponse.json({ message: e?.message || 'Failed to load products.' }, { status: 500 })
  }
}

// POST /api/products — create product (admin only)
export async function POST(request: NextRequest) {
  const gate = await requireAdmin(request)
  if ('response' in gate) return gate.response
  try {
    const body = await request.json().catch(() => ({}))
    const name = String(body.name || '').trim()
    if (!name) return NextResponse.json({ message: 'Name is required.' }, { status: 400 })

    const stock = Number(body.stock ?? 0)
    const varieties = normalizeVarieties(body.varieties, body.perKg ?? body.price)
    const packSizes = normalizePackSizes(body.pack_sizes ?? body.packSizes)
    const perKg = varieties[0]?.price ?? Number(body.price ?? 0)
    const basePrice = Number.isFinite(perKg) ? Math.round(perKg / 4) : 0
    const rating = Number(body.rating ?? 4.9)
    const reviewsCount = Number(body.reviews_count ?? body.reviewsCount ?? 0)
    if (!Number.isFinite(rating) || rating < 0 || rating > 5) {
      return NextResponse.json({ message: 'Rating must be between 0 and 5.' }, { status: 400 })
    }
    if (!Number.isFinite(reviewsCount) || !Number.isInteger(reviewsCount) || reviewsCount < 0) {
      return NextResponse.json({ message: 'Review count must be a non-negative whole number.' }, { status: 400 })
    }

    const row: Record<string, any> = {
      name,
      type: String(body.type || body.category || 'Snacking'),
      category: String(body.category || body.type || 'Snacking'),
      price: basePrice,
      stock: Number.isFinite(stock) ? stock : 0,
      status: String(body.status || (stock <= 0 ? 'Out of stock' : stock <= 8 ? 'Low stock' : 'In stock')),
      image: String(body.image || '/nut-selection.png'),
      detail: String(body.detail ?? body.description ?? ''),
      rating,
      reviews_count: reviewsCount,
      origin: String(body.origin || 'India'),
      nutrients: Array.isArray(body.nutrients) ? body.nutrients.map(String) : [],
      benefits: textList(body.benefits),
      ingredients: textList(body.ingredients),
      seo_title: String(body.seo_title || '').trim().slice(0, 70),
      seo_description: String(body.seo_description || '').trim().slice(0, 320),
      active: body.active !== false,
    }

    const admin = supabaseAdmin()
    let payload: Record<string, any> = { ...row, varieties, pack_sizes: packSizes }
    let result = await admin.from('products').insert(payload).select('*').single()
    const warnings: string[] = []

    // A migration may not have been applied yet — drop that column and retry so
    // the rest of the product still saves.
    for (const column of OPTIONAL_COLUMNS) {
      if (!result.error || !new RegExp(column, 'i').test(result.error.message)) continue
      delete payload[column]
      warnings.push(MIGRATION_HINT[column])
      result = await admin.from('products').insert(payload).select('*').single()
    }

    if (result.error && /duplicate key/i.test(result.error.message)) {
      // Identity sequence is behind (rows were bulk-seeded with explicit ids) — use the next free id.
      const { data: maxRows } = await admin.from('products').select('id').order('id', { ascending: false }).limit(1)
      const nextId = Number(maxRows?.[0]?.id ?? 0) + 1
      result = await admin.from('products').insert({ ...payload, id: nextId }).select('*').single()
    }
    if (result.error) throw result.error
    return NextResponse.json({ product: result.data, warning: warnings.join(' ') }, { status: 201 })
  } catch (e: any) {
    console.error('POST /api/products error:', e)
    return NextResponse.json({ message: e?.message || 'Failed to create product.' }, { status: 500 })
  }
}
