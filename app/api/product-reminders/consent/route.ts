import { NextRequest, NextResponse } from 'next/server'
import { requireUser, supabaseAdmin } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const gate = await requireUser(request)
  if ('response' in gate) return gate.response
  const { data, error } = await supabaseAdmin().from('product_reminder_preferences')
    .select('opted_in,suppressed_at').eq('user_id', gate.user.id).maybeSingle()
  if (error) {
    console.error('Product reminder preference read failed:', error.message)
    return NextResponse.json({ message: 'Could not load your email preference.' }, { status: 503 })
  }
  return NextResponse.json({ optedIn: data?.opted_in === true && !data.suppressed_at, suppressed: Boolean(data?.suppressed_at) },
    { headers: { 'Cache-Control': 'no-store' } })
}

export async function PUT(request: NextRequest) {
  const gate = await requireUser(request)
  if ('response' in gate) return gate.response
  const body = await request.json().catch(() => null)
  if (!body || typeof body.optedIn !== 'boolean') {
    return NextResponse.json({ message: 'Choose a valid email preference.' }, { status: 400 })
  }
  if (body.optedIn && (!gate.user.email || !gate.user.email_confirmed_at)) {
    return NextResponse.json({ message: 'Verify your account email before enabling reminders.' }, { status: 403 })
  }
  const admin = supabaseAdmin()
  const { data: current, error: readError } = await admin.from('product_reminder_preferences')
    .select('suppressed_at').eq('user_id', gate.user.id).maybeSingle()
  if (readError) {
    console.error('Product reminder preference read failed:', readError.message)
    return NextResponse.json({ message: 'Could not save your email preference.' }, { status: 503 })
  }
  if (body.optedIn && current?.suppressed_at) {
    return NextResponse.json({ message: 'Email delivery is suppressed. Please contact support.' }, { status: 403 })
  }
  const now = new Date().toISOString()
  const { error } = await admin.from('product_reminder_preferences').upsert({
    user_id: gate.user.id,
    opted_in: body.optedIn,
    ...(body.optedIn ? { opted_in_at: now } : { opted_out_at: now }),
    updated_at: now,
  })
  if (error) {
    console.error('Product reminder preference write failed:', error.message)
    return NextResponse.json({ message: 'Could not save your email preference.' }, { status: 503 })
  }
  if (!body.optedIn) {
    const { error: cancelError } = await admin.from('product_reminders').update({
      status: 'cancelled', cancel_reason: 'no_consent', updated_at: now,
    }).eq('user_id', gate.user.id).eq('status', 'pending')
    if (cancelError) console.error('Product reminder cancellation failed:', cancelError.message)
  }
  return NextResponse.json({ optedIn: body.optedIn })
}
