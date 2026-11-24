import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, supabaseAdmin } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request)
  if ('response' in gate) return gate.response
  const end = Date.parse(request.nextUrl.searchParams.get('to') || '')
  const start = Date.parse(request.nextUrl.searchParams.get('from') || '')
  const product = request.nextUrl.searchParams.get('product') || ''
  const status = request.nextUrl.searchParams.get('status') || ''
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end ||
    end > Date.now() + 60_000 || end - start > 90 * 24 * 60 * 60_000 ||
    (product && (!/^[1-9]\d*$/.test(product) || !Number.isSafeInteger(Number(product)))) ||
    (status && !['pending', 'sending', 'sent', 'failed', 'uncertain', 'cancelled'].includes(status))) {
    return NextResponse.json({ message: 'Choose valid reminder filters.' }, { status: 400 })
  }
  const { data, error } = await supabaseAdmin().rpc('ajr_product_reminder_summary', {
    p_since: new Date(start).toISOString(),
    p_until: new Date(end).toISOString(),
    p_product_id: product ? Number(product) : null,
    p_status: status || null,
  })
  if (error) {
    console.error('Product reminder summary failed:', error.message)
    return NextResponse.json({ message: 'Product reminder analytics is unavailable. Apply the product-reminders migration.' }, { status: 503 })
  }
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
}
