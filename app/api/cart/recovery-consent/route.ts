import { NextRequest, NextResponse } from 'next/server'
import { persistSignedInCartSnapshot } from '@/lib/abandoned-carts'
import { requireUser, supabaseAdmin } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  const gate = await requireUser(request)
  if ('response' in gate) return gate.response

  const body = await request.json().catch(() => ({}))
  if (typeof body.whatsappMarketingConsent !== 'boolean') {
    return NextResponse.json({ message: 'Choose whether to receive WhatsApp cart reminders.' }, { status: 400 })
  }

  try {
    const admin = supabaseAdmin()
    const { data: cart, error } = await admin.from('carts').select('items').eq('user_id', gate.user.id).maybeSingle()
    if (error) throw error
    const result = await persistSignedInCartSnapshot({
      admin,
      user: gate.user,
      items: body.items === undefined ? cart?.items || [] : body.items,
      whatsappMarketingConsent: body.whatsappMarketingConsent,
      userAgent: request.headers.get('user-agent'),
    })
    return NextResponse.json({ consent: result.consent })
  } catch (error: any) {
    console.error('POST /api/cart/recovery-consent error:', error)
    return NextResponse.json({
      message: 'Cart reminder preference could not be saved. Apply supabase/abandoned-carts.sql and try again.',
    }, { status: 503 })
  }
}
