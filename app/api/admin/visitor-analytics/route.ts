import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, supabaseAdmin } from '@/lib/supabase'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_RANGE_MS = 90 * 24 * 60 * 60 * 1000

export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request)
  if ('response' in gate) return gate.response

  const admin = supabaseAdmin()
  const visitorId = request.nextUrl.searchParams.get('visitorId')
  if (visitorId !== null) {
    if (!UUID.test(visitorId)) return NextResponse.json({ message: 'Choose a valid visitor.' }, { status: 400 })
    try {
      const { data, error } = await admin
        .from('visitor_analytics_events')
        .select('session_id,event_name,page,duration_ms,device_type,browser,operating_system,created_at')
        .eq('visitor_id', visitorId)
        .neq('event_name', 'heartbeat')
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      const journey = (data || []).slice().reverse().map((event) => ({
        visitorId,
        sessionId: event.session_id,
        eventName: event.event_name,
        page: event.page,
        durationMs: event.duration_ms,
        deviceType: event.device_type,
        browser: event.browser,
        operatingSystem: event.operating_system,
        createdAt: event.created_at,
      }))
      return NextResponse.json({ journey }, { headers: { 'Cache-Control': 'no-store' } })
    } catch (error: any) {
      console.error('GET /api/admin/visitor-analytics journey failed:', error?.message || 'Unknown analytics read error.')
      return NextResponse.json({ message: 'Could not load this visitor journey.' }, { status: 503 })
    }
  }

  const now = Date.now()
  const requestedEnd = request.nextUrl.searchParams.get('to')
  const requestedStart = request.nextUrl.searchParams.get('from')
  const parsedEnd = requestedEnd ? Date.parse(requestedEnd) : now
  const parsedStart = requestedStart ? Date.parse(requestedStart) : now - 7 * 24 * 60 * 60 * 1000
  if (
    !Number.isFinite(parsedStart) ||
    !Number.isFinite(parsedEnd) ||
    parsedStart >= parsedEnd ||
    parsedEnd > now + 60_000 ||
    parsedEnd - parsedStart > MAX_RANGE_MS
  ) {
    return NextResponse.json({ message: 'Choose a valid range of up to 90 days.' }, { status: 400 })
  }

  try {
    const { data, error } = await admin.rpc('visitor_analytics_summary', {
      p_since: new Date(parsedStart).toISOString(),
      p_until: new Date(parsedEnd).toISOString(),
    })
    if (error) throw error
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error: any) {
    console.error('GET /api/admin/visitor-analytics failed:', error?.message || 'Unknown analytics summary error.')
    return NextResponse.json({
      message: 'Visitor analytics is not ready. Apply supabase/visitor-analytics.sql in your Supabase project, then retry.',
    }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
