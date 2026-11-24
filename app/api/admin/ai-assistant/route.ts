import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request)
  if ('response' in gate) return gate.response
  try {
    const admin = supabaseAdmin()
    const [settings, stats] = await Promise.all([
      admin.from('ai_assistant_settings').select('*').eq('id', true).single(),
      admin.rpc('ajr_ai_assistant_stats'),
    ])
    if (settings.error || stats.error) throw settings.error || stats.error
    return NextResponse.json({ settings: settings.data, stats: stats.data }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Assistant admin dashboard unavailable:', error)
    return NextResponse.json({ message: 'Assistant dashboard is unavailable. Check the database migration.' }, { status: 503 })
  }
}

export async function PATCH(request: NextRequest) {
  const gate = await requireAdmin(request)
  if ('response' in gate) return gate.response
  let input: unknown
  try { input = await request.json() } catch { return NextResponse.json({ message: 'Invalid request.' }, { status: 400 }) }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return NextResponse.json({ message: 'Invalid settings.' }, { status: 400 })
  const data = input as Record<string, unknown>
  const allowed = ['enabled', 'welcome_message', 'daily_limit', 'monthly_limit', 'per_actor_minute_limit', 'per_actor_daily_limit', 'daily_request_limit']
  if (!Object.keys(data).length || Object.keys(data).some((key) => !allowed.includes(key))) {
    return NextResponse.json({ message: 'Invalid settings.' }, { status: 400 })
  }
  if ((data.enabled !== undefined && typeof data.enabled !== 'boolean') ||
    (data.welcome_message !== undefined && (typeof data.welcome_message !== 'string' || !data.welcome_message.trim() || data.welcome_message.length > 200))) {
    return NextResponse.json({ message: 'Invalid assistant settings.' }, { status: 400 })
  }
  const limits: Record<string, [number, number]> = {
    daily_limit: [0, 1000], monthly_limit: [0, 30000], per_actor_minute_limit: [1, 30],
    per_actor_daily_limit: [1, 1000], daily_request_limit: [1, 100000],
  }
  for (const [field, [min, max]] of Object.entries(limits)) {
    if (data[field] !== undefined && (!Number.isSafeInteger(data[field]) || Number(data[field]) < min || Number(data[field]) > max)) {
      return NextResponse.json({ message: `Invalid ${field}.` }, { status: 400 })
    }
  }
  try {
    const { error } = await supabaseAdmin().from('ai_assistant_settings')
      .update({ ...data, updated_at: new Date().toISOString() }).eq('id', true).select('id').single()
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Assistant settings update failed:', error)
    return NextResponse.json({ message: 'Could not update assistant settings.' }, { status: 503 })
  }
}
