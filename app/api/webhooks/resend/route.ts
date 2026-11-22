import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { validResendSignature } from '@/lib/notification-automation'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const raw = await request.text()
  if (!validResendSignature(raw, request.headers.get('svix-id'), request.headers.get('svix-timestamp'), request.headers.get('svix-signature'))) {
    return NextResponse.json({ message: 'Not found.' }, { status: 404 })
  }
  try {
    const payload = JSON.parse(raw)
    const messageId = String(payload?.data?.email_id || '')
    const type = String(payload?.type || '')
    if (!messageId) return NextResponse.json({ ok: true })
    const patch: any = { updated_at: new Date().toISOString() }
    if (type === 'email.delivered') { patch.status = 'delivered'; patch.delivered_at = new Date().toISOString() }
    if (type === 'email.bounced' || type === 'email.complained') { patch.status = 'failed'; patch.failed_at = new Date().toISOString(); patch.error = type }
    const admin = supabaseAdmin()
    const { error: receiptError } = await admin.from('notification_receipts').upsert({
      provider_message_id: messageId, provider: 'resend', status: type, payload,
    }, { onConflict: 'provider_message_id,status', ignoreDuplicates: true })
    if (receiptError) throw receiptError
    if (Object.keys(patch).length > 1) {
      let query = admin.from('notification_events').update(patch).eq('provider_message_id', messageId)
      if (patch.status === 'delivered') query = query.in('status', ['queued', 'sent'])
      if (patch.status === 'failed') query = query.in('status', ['queued', 'sent'])
      const { error } = await query
      if (error) throw error
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Resend webhook failed:', error)
    return NextResponse.json({ message: 'Webhook processing failed.' }, { status: 503 })
  }
}
