import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { validMetaSignature } from '@/lib/notification-automation'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  if (params.get('hub.mode') === 'subscribe'
    && params.get('hub.verify_token') === process.env.META_WEBHOOK_VERIFY_TOKEN
    && params.get('hub.challenge')) {
    return new NextResponse(params.get('hub.challenge'), { status: 200, headers: { 'Content-Type': 'text/plain' } })
  }
  return NextResponse.json({ message: 'Not found.' }, { status: 404 })
}

export async function POST(request: NextRequest) {
  const raw = await request.text()
  if (!validMetaSignature(raw, request.headers.get('x-hub-signature-256'))) {
    return NextResponse.json({ message: 'Not found.' }, { status: 404 })
  }
  try {
    const payload = JSON.parse(raw)
    const statuses = payload?.entry?.flatMap((entry: any) => entry?.changes || [])
      .flatMap((change: any) => change?.value?.statuses || []) || []
    const admin = supabaseAdmin()
    const results = await Promise.all(statuses.map(async (status: any) => {
      const id = String(status?.id || '')
      const mapped = String(status?.status || '').toLowerCase()
      if (!id || !['sent', 'delivered', 'read', 'failed'].includes(mapped)) return null
      const patch: any = { status: mapped, updated_at: new Date().toISOString() }
      if (mapped === 'delivered' || mapped === 'read') patch.delivered_at = new Date().toISOString()
      if (mapped === 'failed') { patch.failed_at = new Date().toISOString(); patch.error = String(status?.errors?.[0]?.title || 'WhatsApp delivery failed.').slice(0, 300) }
      const { error: receiptError } = await admin.from('notification_receipts').upsert({
        provider_message_id: id, provider: 'meta', status: mapped, payload: status,
      }, { onConflict: 'provider_message_id,status', ignoreDuplicates: true })
      if (receiptError) return receiptError
      let query = admin.from('notification_events').update(patch).eq('provider_message_id', id)
      if (mapped === 'sent') query = query.eq('status', 'queued')
      if (mapped === 'delivered') query = query.in('status', ['queued', 'sent'])
      if (mapped === 'read') query = query.in('status', ['queued', 'sent', 'delivered'])
      if (mapped === 'failed') query = query.in('status', ['queued', 'sent'])
      const { error } = await query
      return error
    }))
    const failure = results.find(Boolean)
    if (failure) throw failure
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Meta WhatsApp webhook failed:', error)
    return NextResponse.json({ message: 'Webhook processing failed.' }, { status: 503 })
  }
}
