import { NextRequest, NextResponse } from 'next/server'
import { requireUser, supabaseAdmin } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  const gate = await requireUser(request)
  if ('response' in gate) return gate.response
  const body = await request.json().catch(() => null)
  if (!Number.isSafeInteger(body?.productId) || body.productId <= 0) {
    return NextResponse.json({ message: 'Invalid product.' }, { status: 400 })
  }
  const { error } = await supabaseAdmin().rpc('ajr_record_product_visit', {
    p_user_id: gate.user.id, p_product_id: body.productId,
  })
  if (error) {
    console.error('Product reminder visit failed:', error.message)
    return NextResponse.json({ message: 'Could not record product activity.' }, { status: 503 })
  }
  return NextResponse.json({ accepted: true }, { status: 202 })
}
