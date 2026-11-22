import { NextRequest, NextResponse } from 'next/server'
import { sha256 } from '@/lib/abandoned-carts'
import { requireUser, supabaseAdmin } from '@/lib/supabase'

const attempts = new Map<string, { startedAt: number; count: number }>()

function isRateLimited(userId: string) {
  const now = Date.now()
  const current = attempts.get(userId)
  if (!current || now - current.startedAt >= 60_000) {
    attempts.set(userId, { startedAt: now, count: 1 })
    return false
  }
  current.count += 1
  return current.count > 10
}

export async function POST(request: NextRequest) {
  const gate = await requireUser(request)
  if ('response' in gate) return gate.response
  if (isRateLimited(gate.user.id)) {
    return NextResponse.json({ message: 'Too many recovery attempts. Wait a minute and try again.' }, { status: 429 })
  }
  const body = await request.json().catch(() => ({}))
  const token = String(body.token || '')
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) {
    return NextResponse.json({ message: 'This recovery link is invalid or has expired.' }, { status: 400 })
  }
  try {
    const admin = supabaseAdmin()
    const { data, error } = await admin.rpc('ajr_redeem_cart_recovery', {
      p_token_hash: sha256(token),
      p_user_id: gate.user.id,
    })
    if (error) throw error
    if (data?.error) return NextResponse.json({ message: String(data.error) }, { status: 400 })
    if (!Array.isArray(data?.items)) return NextResponse.json({ message: 'This recovery link could not be redeemed.' }, { status: 400 })
    return NextResponse.json({ items: data.items })
  } catch (error) {
    console.error('POST /api/cart/recovery/redeem failed:', error)
    return NextResponse.json({ message: 'Recovery is temporarily unavailable. Apply supabase/abandoned-carts.sql and try again.' }, { status: 503 })
  }
}
