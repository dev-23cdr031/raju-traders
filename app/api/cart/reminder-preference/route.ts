import { NextRequest, NextResponse } from 'next/server'
import { requireUser, supabaseAdmin } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const gate = await requireUser(request)
  if ('response' in gate) return gate.response
  const { data, error } = await supabaseAdmin().from('cart_reminder_preferences')
    .select('opted_in,opted_out_at,suppressed_at').eq('user_id', gate.user.id).maybeSingle()
  if (error) {
    console.error('Cart reminder preference read failed:', error.message)
    return NextResponse.json({ message: 'Could not load your cart reminder preference.' }, { status: 503 })
  }
  const state = data?.suppressed_at ? 'suppressed'
    : data?.opted_in ? 'opted_in'
      : data?.opted_out_at ? 'opted_out' : 'not_set'
  return NextResponse.json({ state }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function PUT(request: NextRequest) {
  const gate = await requireUser(request)
  if ('response' in gate) return gate.response
  const body = await request.json().catch(() => null)
  if (!body || typeof body.optedIn !== 'boolean') {
    return NextResponse.json({ message: 'Choose a valid cart reminder preference.' }, { status: 400 })
  }
  if (body.optedIn && (!gate.user.email || !gate.user.email_confirmed_at)) {
    return NextResponse.json({ message: 'Verify your account email before enabling reminders.' }, { status: 403 })
  }
  const admin = supabaseAdmin()
  const { error } = await admin.rpc(body.optedIn ? 'ajr_enable_cart_reminders' : 'ajr_unsubscribe_cart_reminders', {
    p_user_id: gate.user.id,
  })
  if (error) {
    console.error('Cart reminder preference write failed:', error.message)
    if (error.message === 'Email delivery is suppressed. Please contact support.') {
      return NextResponse.json({ message: error.message }, { status: 403 })
    }
    return NextResponse.json({ message: 'Could not save your cart reminder preference.' }, { status: 503 })
  }
  return NextResponse.json({ state: body.optedIn ? 'opted_in' : 'opted_out' }, { headers: { 'Cache-Control': 'no-store' } })
}
