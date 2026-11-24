import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { validReminderSignature } from '@/lib/product-reminder-email'

const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'" }

async function verify(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id') || ''
  const signature = request.nextUrl.searchParams.get('signature') || ''
  if (!/^[0-9a-f-]{36}$/i.test(id) || !validReminderSignature(id, 'unsubscribe', signature)) return null
  const { data, error } = await supabaseAdmin().from('product_reminders').select('user_id').eq('id', id).maybeSingle()
  if (error) throw error
  return data?.user_id || null
}

export async function GET(request: NextRequest) {
  try {
    if (!await verify(request)) return NextResponse.json({ message: 'Invalid unsubscribe link.' }, { status: 400, headers })
    return new NextResponse('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Unsubscribe</title></head><body style="font-family:Arial,sans-serif;background:#f4f2e9;color:#173b2e;padding:40px 20px"><main style="max-width:520px;margin:auto;background:white;padding:32px"><h1>Product reminder emails</h1><p>Would you like to stop receiving product-view reminder emails?</p><form method="post"><button style="background:#174c37;color:white;padding:14px 22px;border:0" type="submit">Unsubscribe</button></form></main></body></html>', {
      headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' },
    })
  } catch (error) {
    console.error('Product unsubscribe verification failed:', error)
    return NextResponse.json({ message: 'Could not process this link.' }, { status: 503, headers })
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await verify(request)
    if (!userId) return NextResponse.json({ message: 'Invalid unsubscribe link.' }, { status: 400, headers })
    const now = new Date().toISOString()
    const admin = supabaseAdmin()
    const { error } = await admin.from('product_reminder_preferences').update({
      opted_in: false, opted_out_at: now, updated_at: now,
    }).eq('user_id', userId)
    if (error) throw error
    const { error: cancelError } = await admin.from('product_reminders').update({
      status: 'cancelled', cancel_reason: 'no_consent', updated_at: now,
    }).eq('user_id', userId).eq('status', 'pending')
    if (cancelError) throw cancelError
    return new NextResponse('You have unsubscribed from product reminder emails.', {
      headers: { ...headers, 'Content-Type': 'text/plain; charset=utf-8' },
    })
  } catch (error) {
    console.error('Product unsubscribe failed:', error)
    return NextResponse.json({ message: 'Could not unsubscribe. Please try again.' }, { status: 503, headers })
  }
}
