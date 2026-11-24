import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request)
  if ('response' in gate) return gate.response
  try {
    const { data, error } = await supabaseAdmin().from('ai_assistant_faqs')
      .select('id,question,answer,published,sort_order').order('sort_order').order('id').limit(200)
    if (error) throw error
    return NextResponse.json({ faqs: data || [] }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Assistant FAQs unavailable:', error)
    return NextResponse.json({ message: 'Could not load FAQs.' }, { status: 503 })
  }
}

export async function POST(request: NextRequest) {
  const gate = await requireAdmin(request)
  if ('response' in gate) return gate.response
  let input: unknown
  try { input = await request.json() } catch { return NextResponse.json({ message: 'Invalid request.' }, { status: 400 }) }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return NextResponse.json({ message: 'Invalid FAQ.' }, { status: 400 })
  const faq = input as Record<string, unknown>
  if (Object.keys(faq).some((key) => !['id', 'question', 'answer', 'published', 'sort_order'].includes(key)) ||
    (faq.id !== undefined && (typeof faq.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(faq.id))) ||
    typeof faq.question !== 'string' || !faq.question.trim() || faq.question.length > 200 ||
    typeof faq.answer !== 'string' || !faq.answer.trim() || faq.answer.length > 2000 ||
    typeof faq.published !== 'boolean' || !Number.isSafeInteger(faq.sort_order) ||
    Number(faq.sort_order) < -1000 || Number(faq.sort_order) > 1000) {
    return NextResponse.json({ message: 'Invalid FAQ.' }, { status: 400 })
  }
  try {
    const admin = supabaseAdmin()
    const values = { question: faq.question.trim(), answer: faq.answer.trim(), published: faq.published, sort_order: faq.sort_order, updated_at: new Date().toISOString() }
    const result = faq.id
      ? await admin.from('ai_assistant_faqs').update(values).eq('id', faq.id).select('id').single()
      : await admin.from('ai_assistant_faqs').insert(values).select('id').single()
    if (result.error) throw result.error
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Assistant FAQ save failed:', error)
    return NextResponse.json({ message: 'Could not save FAQ.' }, { status: 503 })
  }
}
