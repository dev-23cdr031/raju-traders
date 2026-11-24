import { NextRequest, NextResponse } from 'next/server'
import { marketingEdgeRequest } from '@/lib/marketing-email'
import { requireAdmin, supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request)
  if ('response' in gate) return gate.response
  try {
    const admin = supabaseAdmin()
    const { data: settings, error } = await admin.from('email_automation_settings').select('*').eq('id', true).single()
    if (error) throw error
    const now = new Date()
    const day = new Date(now.getTime() - 24 * 3600_000).toISOString()
    const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
    const recent = new Date(now.getTime() - 5 * 60_000).toISOString()
    const countReservations = (since: string) => admin.from('email_quota_reservations')
      .select('id', { count: 'exact', head: true }).gte('created_at', since)
      .or(`status.in.(reserved,uncertain),and(status.eq.sent,created_at.gte.${recent})`)
    const [daily, monthly] = await Promise.all([countReservations(day), countReservations(month)])
    if (daily.error || monthly.error) throw daily.error || monthly.error
    let usage = null
    let usageError = null
    try {
      const response = await marketingEdgeRequest({ action: 'usage' })
      if (!response.ok) throw new Error('Provider usage unavailable')
      usage = await response.json()
    } catch (reason) {
      console.error('Email automation provider usage unavailable:', reason instanceof Error ? reason.message : reason)
      usageError = 'Resend usage is unavailable. Promotional sends are paused until it can be verified.'
    }
    return NextResponse.json({ settings, usage, usageError, reservations: { daily: daily.count, monthly: monthly.count } }, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (reason) {
    console.error('Email automation dashboard failed:', reason)
    return NextResponse.json({ message: 'Could not load email automation status.' }, { status: 503 })
  }
}

export async function PATCH(request: NextRequest) {
  const gate = await requireAdmin(request)
  if ('response' in gate) return gate.response
  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ message: 'Invalid request.' }, { status: 400 }) }
  if (!body || typeof body !== 'object') return NextResponse.json({ message: 'Invalid request.' }, { status: 400 })
  const input = body as Record<string, unknown>
  if ((input.campaign !== 'cart' && input.campaign !== 'product') || typeof input.enabled !== 'boolean') {
    return NextResponse.json({ message: 'Invalid automation setting.' }, { status: 400 })
  }
  const field = input.campaign === 'cart' ? 'cart_enabled' : 'product_enabled'
  try {
    const { error } = await supabaseAdmin().from('email_automation_settings')
      .update({ [field]: input.enabled, updated_at: new Date().toISOString() }).eq('id', true).select('id').single()
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (reason) {
    console.error('Email automation setting update failed:', reason)
    return NextResponse.json({ message: 'Could not update the automation setting.' }, { status: 503 })
  }
}
