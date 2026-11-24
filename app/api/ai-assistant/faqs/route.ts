import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin().from('ai_assistant_faqs')
      .select('id,question,answer').eq('published', true).order('sort_order').order('id').limit(100)
    if (error) throw error
    return NextResponse.json({ faqs: data || [] }, {
      headers: { 'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=30' },
    })
  } catch (error) {
    console.error('Public assistant FAQs unavailable:', error)
    return NextResponse.json({ message: 'Help information is temporarily unavailable.' }, { status: 503 })
  }
}
