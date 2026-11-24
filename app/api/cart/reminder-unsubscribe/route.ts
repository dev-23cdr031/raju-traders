import { NextRequest, NextResponse } from 'next/server'
import { validCartUnsubscribeSignature } from '@/lib/cart-reminder-token'
import { supabaseAdmin } from '@/lib/supabase'

const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'" }

async function customerId(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id') || ''
  const signature = request.nextUrl.searchParams.get('signature') || ''
  if (!/^[0-9a-f-]{36}$/i.test(id) || !validCartUnsubscribeSignature(id, signature)) return null
  const { data, error } = await supabaseAdmin().from('abandoned_carts').select('user_id').eq('id', id).maybeSingle()
  if (error) throw error
  return data?.user_id || null
}

export async function GET(request: NextRequest) {
  try {
    if (!await customerId(request)) return NextResponse.json({ message: 'Invalid unsubscribe link.' }, { status: 400, headers })
    return new NextResponse('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Unsubscribe</title></head><body style="font-family:Arial;background:#f4f2e9;color:#173b2e;padding:40px 20px"><main style="max-width:520px;margin:auto;background:white;padding:32px"><h1>Cart reminder emails</h1><p>Stop receiving cart reminder emails?</p><form method="post"><button style="background:#174c37;color:white;padding:14px 22px;border:0" type="submit">Unsubscribe</button></form></main></body></html>', {
      headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' },
    })
  } catch (error) {
    console.error('Cart unsubscribe verification failed:', error)
    return NextResponse.json({ message: 'Could not process this link.' }, { status: 503, headers })
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await customerId(request)
    if (!userId) return NextResponse.json({ message: 'Invalid unsubscribe link.' }, { status: 400, headers })
    const { error } = await supabaseAdmin().rpc('ajr_unsubscribe_cart_reminders', { p_user_id: userId })
    if (error) throw error
    return new NextResponse('You have unsubscribed from cart reminder emails.', {
      headers: { ...headers, 'Content-Type': 'text/plain; charset=utf-8' },
    })
  } catch (error) {
    console.error('Cart unsubscribe failed:', error)
    return NextResponse.json({ message: 'Could not unsubscribe. Please try again.' }, { status: 503, headers })
  }
}
